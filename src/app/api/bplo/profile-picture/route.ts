import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBploSession } from "@/lib/bplo-api";
import {
  PROFILE_IMAGE_ERROR_MAX_SIZE,
  PROFILE_IMAGE_ERROR_UNSUPPORTED_TYPE,
  validateProfileImageFile,
} from "@/lib/profile-image-upload-rules";
import {
  createStorageSignedUrlByPath,
  removeApplicantDocument,
  uploadApplicantProfileImage,
} from "@/lib/document-storage";

const PROFILE_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 30;

type ProfileImagePayload = {
  hasProfileImage: boolean;
  storagePath: string | null;
  bucket: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  signedUrl: string | null;
};

function buildProfileImageResponse(payload: ProfileImagePayload) {
  return {
    hasProfilePicture: payload.hasProfileImage,
    profilePictureUrl: payload.signedUrl,
    profileImage: payload,
  };
}

async function resolveSignedProfileImageUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;

  try {
    const signed = await createStorageSignedUrlByPath({
      storagePath,
      expiresIn: PROFILE_IMAGE_SIGNED_URL_TTL_SECONDS,
    });
    return signed.signedUrl;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await requireBploSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { userId: session.user.id },
    select: {
      userId: true,
      role: true,
      profileImageStoragePath: true,
      profileImageBucket: true,
      profileImageMimeType: true,
      profileImageSizeBytes: true,
      profileImageUploadedAt: true,
    },
  });

  if (!user || user.role !== "BPLO") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signedUrl = await resolveSignedProfileImageUrl(user.profileImageStoragePath ?? null);

  return NextResponse.json(
    buildProfileImageResponse({
      hasProfileImage: Boolean(user.profileImageStoragePath),
      storagePath: user.profileImageStoragePath ?? null,
      bucket: user.profileImageBucket ?? null,
      mimeType: user.profileImageMimeType ?? null,
      sizeBytes: user.profileImageSizeBytes ?? null,
      uploadedAt: user.profileImageUploadedAt?.toISOString() ?? null,
      signedUrl,
    }),
    {
      headers: {
        "Cache-Control": "private, no-store, must-revalidate",
      },
    }
  );
}

export async function POST(req: Request) {
  const session = await requireBploSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const fileValue = formData.get("image");

  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "Profile image is required." }, { status: 400 });
  }

  const validationError = validateProfileImageFile(fileValue);
  if (validationError) {
    const status =
      validationError === PROFILE_IMAGE_ERROR_MAX_SIZE ||
      validationError === PROFILE_IMAGE_ERROR_UNSUPPORTED_TYPE
        ? 400
        : 422;
    return NextResponse.json({ error: validationError }, { status });
  }

  const existingUser = await prisma.user.findUnique({
    where: { userId: session.user.id },
    select: {
      role: true,
      profileImageStoragePath: true,
      profileImageMimeType: true,
    },
  });

  if (!existingUser || existingUser.role !== "BPLO") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uploaded;
  try {
    uploaded = await uploadApplicantProfileImage({
      applicantId: session.user.id,
      file: fileValue,
    });
  } catch (uploadErr) {
    const errorMessage = uploadErr instanceof Error ? uploadErr.message : "Failed to store profile image";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }

  try {
    const updated = await prisma.user.update({
      where: { userId: session.user.id },
      data: {
        profileImageStoragePath: uploaded.storagePath,
        profileImageBucket: uploaded.bucket,
        profileImageMimeType: uploaded.mimeType,
        profileImageSizeBytes: uploaded.sizeBytes,
        profileImageUploadedAt: new Date(),
      },
      select: {
        profileImageStoragePath: true,
        profileImageBucket: true,
        profileImageMimeType: true,
        profileImageSizeBytes: true,
        profileImageUploadedAt: true,
      },
    });

    const signedUrl = await resolveSignedProfileImageUrl(updated.profileImageStoragePath ?? null);

    if (
      existingUser.profileImageStoragePath &&
      existingUser.profileImageStoragePath !== updated.profileImageStoragePath
    ) {
      await removeApplicantDocument(
        existingUser.profileImageStoragePath,
        existingUser.profileImageMimeType ?? undefined
      );
    }

    return NextResponse.json(
      buildProfileImageResponse({
        hasProfileImage: Boolean(updated.profileImageStoragePath),
        storagePath: updated.profileImageStoragePath,
        bucket: updated.profileImageBucket,
        mimeType: updated.profileImageMimeType,
        sizeBytes: updated.profileImageSizeBytes,
        uploadedAt: updated.profileImageUploadedAt?.toISOString() ?? null,
        signedUrl,
      })
    );
  } catch {
    await removeApplicantDocument(uploaded.storagePath, uploaded.mimeType);
    return NextResponse.json({ error: "Unable to save profile image. Please try again." }, { status: 400 });
  }
}

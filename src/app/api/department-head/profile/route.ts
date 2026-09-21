import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";
import { formatPersonName } from "@/lib/person-name";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { createStorageSignedUrlByPath } from "@/lib/document-storage";

const PROFILE_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 30;

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
  const session = await requireDepartmentHeadSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { userId: session.user.id },
    select: {
      userId: true,
      email: true,
      role: true,
      name: true,
      firstName: true,
      middleName: true,
      lastName: true,
      suffix: true,
      profileImageStoragePath: true,
      profileImageBucket: true,
      profileImageMimeType: true,
      profileImageSizeBytes: true,
      profileImageUploadedAt: true,
    },
  });

  if (!user || user.role !== "DEPARTMENT_HEAD") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signedUrl = await resolveSignedProfileImageUrl(user.profileImageStoragePath ?? null);

  return NextResponse.json(
    {
      profile: {
        id: user.userId,
        email: user.email,
        role: user.role,
        name: user.name,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        suffix: user.suffix,
        hasProfilePicture: Boolean(user.profileImageStoragePath),
        profilePictureUrl: signedUrl,
        profileImage: {
          hasProfileImage: Boolean(user.profileImageStoragePath),
          storagePath: user.profileImageStoragePath,
          bucket: user.profileImageBucket,
          mimeType: user.profileImageMimeType,
          sizeBytes: user.profileImageSizeBytes,
          uploadedAt: user.profileImageUploadedAt?.toISOString() ?? null,
          signedUrl,
        },
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, must-revalidate",
      },
    }
  );
}

export async function PATCH(req: Request) {
  const session = await requireDepartmentHeadSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const firstName = typeof record.firstName === "string" ? record.firstName.trim() : "";
  const middleName = typeof record.middleName === "string" ? record.middleName.trim() : "";
  const lastName = typeof record.lastName === "string" ? record.lastName.trim() : "";
  const suffix = typeof record.suffix === "string" ? record.suffix.trim() : "";

  if (!firstName) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }

  if (!lastName) {
    return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  }

  const computedName = formatPersonName({
    firstName,
    middleName,
    lastName,
    suffix,
    fallbackName: `${firstName} ${lastName}`,
  });

  try {
    const updated = await prisma.user.update({
      where: { userId: session.user.id },
      data: {
        name: computedName,
        firstName,
        middleName: middleName || null,
        lastName,
        suffix: suffix || null,
      },
      select: {
        userId: true,
        email: true,
        role: true,
        name: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
      },
    });

    if (updated.role !== "DEPARTMENT_HEAD") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      profile: {
        id: updated.userId,
        email: updated.email,
        role: updated.role,
        name: updated.name,
        firstName: updated.firstName,
        middleName: updated.middleName,
        lastName: updated.lastName,
        suffix: updated.suffix,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to update profile.") },
      { status: 400 }
    );
  }
}

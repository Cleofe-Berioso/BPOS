import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireBploSession } from "@/lib/bplo-api";
import { prisma } from "@/lib/prisma";
import { createStorageSignedUrlByPath } from "@/lib/document-storage";
import { BploProfileSettingsClient } from "@/components/bplo/bplo-profile-settings-client";

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

export default async function BploProfilePage() {
  const session = await requireBploSession();
  if (!session?.user?.id) notFound();

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
    },
  });

  if (!user || user.role !== "BPLO") {
    notFound();
  }

  const profilePictureUrl = await resolveSignedProfileImageUrl(user.profileImageStoragePath ?? null);

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="BPLO"
        title="Profile"
        description="Set your BPLO staff display name and profile picture for multi-staff identity."
        badge={<RoleBadge roleType="BPLO" />}
      />

      <BploProfileSettingsClient
        initialProfile={{
          id: user.userId,
          email: user.email,
          role: user.role,
          name: user.name,
          firstName: user.firstName,
          middleName: user.middleName,
          lastName: user.lastName,
          suffix: user.suffix,
          hasProfilePicture: Boolean(user.profileImageStoragePath),
          profilePictureUrl,
        }}
      />
    </section>
  );
}

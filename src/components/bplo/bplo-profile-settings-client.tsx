"use client";

import { useMemo, useState } from "react";
import { Fingerprint, Loader2, Mail, Shield, UserCircle2 } from "lucide-react";
import { AccountDetailsPanel } from "@/components/ui/account-details-panel";
import { SectionCard } from "@/components/ui/section-card";
import { actionButtonStyles } from "@/components/ui/action-button";
import { bploFormControlClass } from "@/components/bplo/bplo-ui-styles";
import {
  PROFILE_IMAGE_FILE_INPUT_ACCEPT,
  validateProfileImageFile,
} from "@/lib/profile-image-upload-rules";

type BploProfileData = {
  id: string;
  email: string;
  role: string;
  name: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  hasProfilePicture: boolean;
  profilePictureUrl: string | null;
};

type FormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
};

function dispatchProfileUpdated(detail: { name?: string; profilePictureUrl?: string | null }) {
  window.dispatchEvent(new CustomEvent("bplo-profile-updated", { detail }));
}

export function BploProfileSettingsClient({ initialProfile }: { initialProfile: BploProfileData }) {
  const [profile, setProfile] = useState(initialProfile);
  const [form, setForm] = useState<FormState>({
    firstName: initialProfile.firstName ?? "",
    middleName: initialProfile.middleName ?? "",
    lastName: initialProfile.lastName ?? "",
    suffix: initialProfile.suffix ?? "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const imagePreviewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  async function saveProfileName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingName) return;

    setSavingName(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/bplo/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        error?: string;
        profile?: {
          name: string;
          firstName: string | null;
          middleName: string | null;
          lastName: string | null;
          suffix: string | null;
        };
      };

      if (!response.ok || !data.profile) {
        setError(data.error ?? "Unable to update profile.");
        return;
      }

      setProfile((current) => ({
        ...current,
        name: data.profile?.name ?? current.name,
        firstName: data.profile?.firstName ?? current.firstName,
        middleName: data.profile?.middleName ?? current.middleName,
        lastName: data.profile?.lastName ?? current.lastName,
        suffix: data.profile?.suffix ?? current.suffix,
      }));
      setForm({
        firstName: data.profile.firstName ?? "",
        middleName: data.profile.middleName ?? "",
        lastName: data.profile.lastName ?? "",
        suffix: data.profile.suffix ?? "",
      });
      setMessage("Profile name updated.");
      dispatchProfileUpdated({ name: data.profile.name });
    } catch {
      setError("Unable to update profile.");
    } finally {
      setSavingName(false);
    }
  }

  function onSelectImage(file: File | null) {
    if (!file) {
      setImageFile(null);
      setImageError(null);
      return;
    }

    const validationError = validateProfileImageFile(file);
    if (validationError) {
      setImageFile(null);
      setImageError(validationError);
      return;
    }

    setImageFile(file);
    setImageError(null);
    setError(null);
  }

  async function uploadProfilePicture() {
    if (!imageFile || uploadingImage) return;

    setUploadingImage(true);
    setImageError(null);
    setError(null);
    setMessage(null);

    try {
      const payload = new FormData();
      payload.append("image", imageFile);

      const response = await fetch("/api/bplo/profile-picture", {
        method: "POST",
        body: payload,
      });

      const data = (await response.json()) as {
        error?: string;
        profilePictureUrl?: string | null;
        hasProfilePicture?: boolean;
        profileImage?: {
          signedUrl?: string | null;
          hasProfileImage?: boolean;
        };
      };

      if (!response.ok) {
        setImageError(data.error ?? "Unable to upload profile picture.");
        return;
      }

      const signedUrl = data.profileImage?.signedUrl ?? data.profilePictureUrl ?? null;
      const hasProfilePicture = Boolean(data.profileImage?.hasProfileImage ?? data.hasProfilePicture);

      setProfile((current) => ({
        ...current,
        hasProfilePicture,
        profilePictureUrl: signedUrl,
      }));
      setImageFile(null);
      setMessage("Profile picture updated.");
      dispatchProfileUpdated({ profilePictureUrl: signedUrl });
    } catch {
      setImageError("Unable to upload profile picture.");
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Profile Picture" description="Upload your staff profile photo for top-bar identity.">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)] text-[var(--ink-muted)]">
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="Selected profile" className="h-full w-full object-cover" />
            ) : profile.profilePictureUrl ? (
              <img src={profile.profilePictureUrl} alt="Current profile" className="h-full w-full object-cover" />
            ) : (
              <UserCircle2 className="h-9 w-9" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <input
              type="file"
              accept={PROFILE_IMAGE_FILE_INPUT_ACCEPT}
              aria-label="Upload profile picture"
              onChange={(event) => onSelectImage(event.currentTarget.files?.[0] ?? null)}
              className={`block w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm ${bploFormControlClass}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={uploadProfilePicture}
                disabled={!imageFile || uploadingImage}
                className={actionButtonStyles("primary", "sm")}
              >
                {uploadingImage ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </span>
                ) : (
                  "Save Profile Picture"
                )}
              </button>
            </div>
            {imageError ? <p className="text-sm text-[var(--danger)]">{imageError}</p> : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Account Details" description="Signed-in BPLO staff identity used across the portal.">
        <AccountDetailsPanel
          items={[
            {
              label: "Display Name",
              value: profile.name || "Not set",
              icon: <UserCircle2 className="h-4 w-4" />,
              emphasize: true,
            },
            {
              label: "Email",
              value: profile.email,
              icon: <Mail className="h-4 w-4" />,
              hint: "Login address",
            },
            {
              label: "Role",
              value: profile.role,
              icon: <Shield className="h-4 w-4" />,
            },
            {
              label: "User ID",
              value: profile.id,
              icon: <Fingerprint className="h-4 w-4" />,
              hint: "System reference only",
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Name Setup" description="Set your personal BPLO display name.">
        <form className="space-y-3" onSubmit={saveProfileName}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-[var(--ink-muted)]">
              <span className="font-medium">First Name</span>
              <input
                value={form.firstName}
                maxLength={50}
                onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                required
                className={`w-full rounded-xl border border-[var(--border-color)] px-3 py-2 ${bploFormControlClass}`}
              />
            </label>

            <label className="space-y-1 text-sm text-[var(--ink-muted)]">
              <span className="font-medium">Last Name</span>
              <input
                value={form.lastName}
                maxLength={50}
                onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                required
                className={`w-full rounded-xl border border-[var(--border-color)] px-3 py-2 ${bploFormControlClass}`}
              />
            </label>

            <label className="space-y-1 text-sm text-[var(--ink-muted)]">
              <span className="font-medium">Middle Name</span>
              <input
                value={form.middleName}
                maxLength={50}
                onChange={(event) => setForm((current) => ({ ...current, middleName: event.target.value }))}
                className={`w-full rounded-xl border border-[var(--border-color)] px-3 py-2 ${bploFormControlClass}`}
              />
            </label>

            <label className="space-y-1 text-sm text-[var(--ink-muted)]">
              <span className="font-medium">Suffix</span>
              <input
                value={form.suffix}
                maxLength={10}
                onChange={(event) => setForm((current) => ({ ...current, suffix: event.target.value }))}
                className={`w-full rounded-xl border border-[var(--border-color)] px-3 py-2 ${bploFormControlClass}`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={savingName} className={actionButtonStyles("primary", "sm")}>
              {savingName ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Name"
              )}
            </button>
            {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
            {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

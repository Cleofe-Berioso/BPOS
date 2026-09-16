"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CameraOff, CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { actionButtonStyles } from "@/components/ui/action-button";
import { useProfileCamera } from "@/components/applicant/use-profile-camera";
import {
  clearApplicantProfileSetupNextPath,
  readApplicantProfileSetupNextPath,
} from "@/lib/applicant-profile-setup-next";
import {
  PROFILE_IMAGE_FILE_INPUT_ACCEPT,
  validateProfileImageFile,
} from "@/lib/profile-image-upload-rules";

function buildCaptureFile(blob: Blob): File {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([blob], `profile-picture-${timestamp}.jpg`, { type: "image/jpeg" });
}

export function ProfilePictureSetupClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextPath, setNextPath] = useState("/applicant/dashboard");
  const {
    videoRef,
    cameraActive,
    cameraLoading,
    cameraError,
    setCameraError,
    startCamera,
    stopCamera,
    captureFrame,
  } = useProfileCamera();

  useEffect(() => {
    setNextPath(readApplicantProfileSetupNextPath());
  }, []);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function assignFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      setError(null);
      setMessage(null);
      return;
    }

    const validationError = validateProfileImageFile(nextFile);
    if (validationError) {
      setError(validationError);
      setFile(null);
      setMessage(null);
      return;
    }

    setFile(nextFile);
    setError(null);
    setCameraError(null);
    setMessage("Profile image is ready to upload.");
  }

  async function captureFromCamera() {
    setError(null);
    const blob = await captureFrame();
    if (!blob) {
      setError(cameraError ?? "Unable to capture image. Please try again.");
      return;
    }
    assignFile(buildCaptureFile(blob));
    stopCamera();
  }

  async function uploadProfileImage() {
    if (!file || submitting) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const payload = new FormData();
      payload.append("image", file);

      const response = await fetch("/api/applicant/profile-picture", {
        method: "POST",
        body: payload,
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to upload profile image.");
      }

      setMessage("Profile picture saved. Redirecting...");
      clearApplicantProfileSetupNextPath();
      router.replace(nextPath);
      router.refresh();
    } catch (uploadError) {
      const uploadMessage =
        uploadError instanceof Error ? uploadError.message : "Unable to upload profile image.";
      setError(uploadMessage);
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = error ?? cameraError;

  return (
    <section className="ui-page-stack">
      <PageHeader
        eyebrow="Applicant"
        title="Complete Profile Picture"
        description="A profile picture is required before continuing to the applicant portal."
      />

      <SectionCard title="Capture or Upload" description="Use your camera or upload a clear photo of yourself.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {!cameraActive ? (
              <button
                type="button"
                disabled={cameraLoading || submitting}
                onClick={() => {
                  void startCamera();
                }}
                className={actionButtonStyles("secondary", "sm")}
              >
                {cameraLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
                Open Camera
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void captureFromCamera();
                  }}
                  className={actionButtonStyles("primary", "sm")}
                >
                  <Camera className="mr-1.5 h-4 w-4" />
                  Capture
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={stopCamera}
                  className={actionButtonStyles("secondary", "sm")}
                >
                  <CameraOff className="mr-1.5 h-4 w-4" />
                  Close Camera
                </button>
              </>
            )}

            <label className={actionButtonStyles("secondary", "sm")}>
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Choose Image
              <input
                type="file"
                accept={PROFILE_IMAGE_FILE_INPUT_ACCEPT}
                aria-label="Choose profile image"
                className="sr-only"
                disabled={submitting}
                onChange={(event) => {
                  assignFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {cameraActive ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-black">
              <video
                ref={videoRef}
                aria-label="Camera preview"
                className="h-auto w-full max-h-[360px] object-contain scale-x-[-1]"
                autoPlay
                playsInline
                muted
              />
            </div>
          ) : null}

          {previewUrl ? (
            <div className="space-y-2">
              <p className="ui-caption font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Preview</p>
              <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)]">
                <img src={previewUrl} alt="Profile preview" className="h-auto w-full max-h-[360px] object-contain" />
              </div>
              <p className="text-xs text-[var(--ink-muted)]">Selected file: {file?.name}</p>
            </div>
          ) : null}

          {displayError ? <p className="text-sm font-medium text-[var(--danger)]">{displayError}</p> : null}
          {message ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--success)]">
              <CheckCircle2 className="h-4 w-4" />
              {message}
            </p>
          ) : null}

          <div className="pt-2">
            <button
              type="button"
              disabled={!file || submitting}
              onClick={() => {
                void uploadProfileImage();
              }}
              className={actionButtonStyles("primary", "md")}
            >
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save Profile Picture
            </button>
          </div>
        </div>
      </SectionCard>
    </section>
  );
}

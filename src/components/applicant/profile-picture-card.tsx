"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { actionButtonStyles } from "@/components/ui/action-button";
import { useProfileCamera } from "@/components/applicant/use-profile-camera";
import {
  PROFILE_IMAGE_FILE_INPUT_ACCEPT,
  validateProfileImageFile,
} from "@/lib/profile-image-upload-rules";

interface ProfilePictureCardProps {
  userName: string;
}

function buildCaptureFile(blob: Blob) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([blob], `profile-picture-${timestamp}.jpg`, { type: "image/jpeg" });
}

export function ProfilePictureCard({ userName }: ProfilePictureCardProps) {
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [hasProfilePicture, setHasProfilePicture] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    async function fetchProfilePicture() {
      try {
        setLoading(true);
        const response = await fetch("/api/applicant/profile-picture", {
          cache: "no-store",
        });
        if (!response.ok) {
          setError("Failed to load profile picture");
          return;
        }

        const data = await response.json();
        setHasProfilePicture(data.hasProfilePicture);
        setProfilePictureUrl(data.profilePictureUrl || null);
        setImageFailed(false);
        setError(null);
      } catch (fetchError) {
        console.error("Error fetching profile picture:", fetchError);
        setError("Error loading profile picture");
      } finally {
        setLoading(false);
      }
    }

    void fetchProfilePicture();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function resetComposer() {
    stopCamera();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFile(null);
    setMessage(null);
    setError(null);
    setCameraError(null);
    setSubmitting(false);
  }

  async function refreshProfilePicture() {
    const response = await fetch("/api/applicant/profile-picture", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load profile picture");
    }

    const data = await response.json();
    setHasProfilePicture(data.hasProfilePicture);
    setProfilePictureUrl(data.profilePictureUrl || null);
    setImageFailed(false);
  }

  function openModal() {
    setModalOpen(true);
    setError(null);
    setCameraError(null);
    setMessage(null);
  }

  function closeModal() {
    resetComposer();
    setModalOpen(false);
  }

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

      await refreshProfilePicture();
      closeModal();
    } catch (uploadError) {
      const uploadMessage =
        uploadError instanceof Error ? uploadError.message : "Unable to upload profile image.";
      setError(uploadMessage);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-[var(--border-color)] bg-[var(--muted-surface)] p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--ink-muted)]" />
        <p className="text-sm text-[var(--ink-muted)]">Loading profile picture...</p>
      </div>
    );
  }

  const displayError = error ?? cameraError;

  return (
    <>
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-8">
        {hasProfilePicture && profilePictureUrl && !imageFailed ? (
          <>
            <img
              src={profilePictureUrl}
              alt={userName}
              className="h-32 w-32 rounded-full border-2 border-[var(--border-color)] object-cover"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
            <p className="text-sm text-[var(--ink-muted)]">{userName}</p>
          </>
        ) : (
          <>
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-[var(--border-color)] bg-[var(--muted-surface)]">
              <Camera className="h-12 w-12 text-[var(--info)]" />
            </div>
            <p className="text-sm text-[var(--ink-muted)]">
              {hasProfilePicture ? "Profile picture could not be loaded" : "No profile picture yet"}
            </p>
          </>
        )}

        <div className="flex w-full justify-center">
          <button onClick={openModal} className={actionButtonStyles("primary", "sm")} type="button">
            <Camera className="h-4 w-4" />
            {hasProfilePicture ? "Change Picture" : "Upload Picture"}
          </button>
        </div>

        {error && !modalOpen ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <Modal
        open={modalOpen}
        title="Update Profile Picture"
        description="Use your camera or upload a clear photo. Save keeps the change, Discard closes the modal."
        onClose={closeModal}
        footer={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={closeModal} className={actionButtonStyles("secondary", "sm")}>
              Discard
            </button>
            <button
              type="button"
              disabled={!file || submitting}
              onClick={() => {
                void uploadProfileImage();
              }}
              className={actionButtonStyles("primary", "sm")}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Profile Picture
            </button>
          </div>
        }
      >
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
                ref={fileInputRef}
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
                className="h-auto max-h-[360px] w-full object-contain scale-x-[-1]"
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
                <img src={previewUrl} alt="Profile preview" className="h-auto max-h-[360px] w-full object-contain" />
              </div>
              <p className="text-xs text-[var(--ink-muted)]">Selected file: {file?.name}</p>
            </div>
          ) : null}

          {!cameraActive && !previewUrl ? <p className="text-sm text-[var(--ink-muted)]">No new image selected yet.</p> : null}

          {displayError ? <p className="text-sm font-medium text-[var(--danger)]">{displayError}</p> : null}
          {message ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--success)]">
              <CheckCircle2 className="h-4 w-4" />
              {message}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

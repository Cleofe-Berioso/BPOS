"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Safely attaches a MediaStream to a video element and starts playback.
 * Using async/await so the rejected play() promise is properly caught instead
 * of leaking an unhandled promise rejection.
 */
async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  if (!video.isConnected) return;
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute("playsinline", "true");
  video.playsInline = true;
  try {
    await video.play();
  } catch {
    // AbortError  – srcObject replaced before play() resolved (safe to ignore).
    // NotAllowedError – browser blocked autoplay without gesture (rare here).
  }
}

/**
 * Webcam preview + still-frame capture for profile-picture upload.
 *
 * ## Why the preview was black
 *
 * The original flow:
 *   1. `getUserMedia` resolves → `streamRef.current = stream`
 *   2. `setCameraActive(true)` → React schedules a re-render
 *   3. React commits → `<video autoPlay …>` is inserted into the DOM
 *   4. The browser sees `autoPlay` with **no srcObject** → starts a
 *      "no source" playback → video element enters a black "ended/empty"
 *      state.
 *   5. `videoCallbackRef` fires (callback ref) → sets `srcObject` → calls
 *      `play()` again, but the element is already stuck in an error/empty
 *      state in some browsers → still black.
 *
 * ## Fix
 *
 * • Remove `autoPlay` from the `<video>` JSX — playback is driven
 *   programmatically, only after `srcObject` is set.
 * • Use a `pendingAttach` ref so the callback ref knows a stream is ready
 *   even before `cameraActive` state propagates.
 * • Keep the `useEffect([cameraActive])` as a belt-and-suspenders path for
 *   cases where the `<video>` node was already in the DOM (e.g. HMR).
 * • Distinguish common `DOMException` names for actionable error messages.
 */
export function useProfileCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** True while we have a stream that hasn't been wired to a video node yet. */
  const pendingAttach = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── Stop ─────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    pendingAttach.current = false;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  }, []);

  // ── Callback ref ─────────────────────────────────────────────────────────
  // Fires synchronously when React mounts/unmounts the <video> node.

  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current && pendingAttach.current) {
      pendingAttach.current = false;
      void attachStreamToVideo(node, streamRef.current);
    }
  }, []);

  // ── Belt-and-suspenders effect ───────────────────────────────────────────
  // Runs after React commits cameraActive=true.  Handles the case where the
  // <video> node was already mounted (HMR / StrictMode double-invoke) so the
  // callback ref didn't fire during this activation cycle.

  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      pendingAttach.current = false;
      void attachStreamToVideo(video, stream);
    }
  }, [cameraActive]);

  // ── Unmount cleanup ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      pendingAttach.current = false;
    };
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Camera is not supported in this browser or the page is not served " +
          "over HTTPS. Use file upload instead.",
      );
      return;
    }

    setCameraLoading(true);
    setCameraError(null);

    // Stop any existing stream before requesting a new one.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      pendingAttach.current = true; // <video> node not in DOM yet

      // Triggers the re-render that mounts <video> (without autoPlay).
      // The callback ref will fire on commit and attach srcObject + play().
      setCameraActive(true);
    } catch (err) {
      streamRef.current = null;
      pendingAttach.current = false;
      setCameraActive(false);

      let msg =
        "Camera access was denied or unavailable. Use file upload instead.";
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          msg =
            "Camera permission was denied. Please allow camera access in " +
            "your browser settings and try again.";
        } else if (err.name === "NotFoundError") {
          msg = "No camera device was found. Use file upload instead.";
        } else if (err.name === "NotReadableError") {
          msg =
            "Camera is already in use by another application. " +
            "Close it and try again.";
        }
      }
      setCameraError(msg);
    } finally {
      setCameraLoading(false);
    }
  }, [stopCamera]);

  // ── Capture still frame ───────────────────────────────────────────────────

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;

    if (!video) {
      setCameraError(
        "Camera preview is not available. Please reopen the camera.",
      );
      return null;
    }

    // videoWidth / videoHeight are 0 until the first frame arrives.
    if (!video.videoWidth || !video.videoHeight) {
      setCameraError(
        "Camera is still initializing. Wait a moment and try again.",
      );
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Unable to capture from camera. Please use file upload.");
      return null;
    }

    // Un-mirror: CSS `scale-x-[-1]` flips the preview only.
    // The saved JPEG should not be horizontally flipped.
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.9);
    });
  }, []);

  return {
    videoRef: videoCallbackRef,
    cameraActive,
    cameraLoading,
    cameraError,
    setCameraError,
    startCamera,
    stopCamera,
    captureFrame,
  };
}

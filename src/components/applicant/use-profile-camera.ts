"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream) {
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute("playsinline", "true");
  video.playsInline = true;
  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      // Autoplay can fail briefly; Open Camera is already a user gesture.
    });
  }
}

/**
 * Webcam preview for profile picture capture.
 *
 * Bug fixed: previously srcObject was set while cameraActive=false, so <video>
 * was not mounted yet → black preview. We now mount video first, then attach
 * the stream via a callback ref + effect.
 */
export function useProfileCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  }, []);

  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      attachStreamToVideo(node, streamRef.current);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not supported in this browser. Use file upload instead.");
      return;
    }

    setCameraLoading(true);
    setCameraError(null);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      // Mount <video>; callback ref / effect attaches srcObject.
      setCameraActive(true);
    } catch {
      stopCamera();
      setCameraError("Camera access was denied or unavailable. Use file upload instead.");
    } finally {
      setCameraLoading(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      attachStreamToVideo(video, stream);
    }
  }, [cameraActive]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("Camera is still initializing. Try again in a moment.");
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

    // Match mirrored preview (scale-x-[-1]).
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

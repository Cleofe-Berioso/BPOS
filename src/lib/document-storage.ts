import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { getSupabaseStorageAdminClient } from "@/lib/supabase-storage-server";
import { localWriteFile, localDeleteFile, localReadFile, resolveLocalFilePath } from "@/lib/local-storage";
import { formatOwnerName } from "@/lib/person-name";

function isLocalStorageDriver(): boolean {
  return process.env.STORAGE_DRIVER === "local";
}
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_UPLOAD_ERROR_MAX_SIZE,
  DOCUMENT_UPLOAD_ERROR_UNSUPPORTED_TYPE,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from "@/lib/document-upload-rules";
import { validateDocumentFileContent } from "@/lib/file-content-validation";

const ALLOWED_MIME_TYPES = new Set<string>(ALLOWED_DOCUMENT_MIME_TYPES);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_BUCKET = process.env.S3_PDF_BUCKET ?? "ebpls-pdfs";
const IMAGE_BUCKET = process.env.S3_IMAGE_BUCKET ?? "ebpls-images";

type DocumentBucket = typeof PDF_BUCKET | typeof IMAGE_BUCKET;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sanitizeFilenamePart(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "");

  return normalized.length > 0 ? normalized : fallback;
}

function formatUploadTimestamp(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return `${values.year ?? "0000"}${values.month ?? "00"}${values.day ?? "00"}-${values.hour ?? "00"}${values.minute ?? "00"}${values.second ?? "00"}`;
}

function fileExtensionFromName(fileName: string, mimeType: string): string {
  const extension = path.extname(fileName).trim();
  if (extension) {
    return extension;
  }

  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";

  return ".bin";
}

function buildApplicantDocumentFileName(params: {
  applicantName: string;
  documentType: string;
  originalFileName: string;
  mimeType: string;
  uploadedAt: Date;
  collisionSuffix?: string;
}): string {
  const baseApplicantName = sanitizeFilenamePart(params.applicantName, "Applicant");
  const baseDocumentType = sanitizeFilenamePart(params.documentType, "Document");
  const timestamp = formatUploadTimestamp(params.uploadedAt);
  const suffix = params.collisionSuffix ? `-${sanitizeFilenamePart(params.collisionSuffix, "retry")}` : "";
  const extension = fileExtensionFromName(params.originalFileName, params.mimeType);

  return `${baseApplicantName}_${baseDocumentType}_${timestamp}${suffix}${extension}`;
}

function sanitizePathSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "") || "item";
}

function joinObjectPath(parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "webp";
}

function inferBucketFromStoragePath(storagePath: string): DocumentBucket {
  const extension = path.extname(storagePath).toLowerCase();
  if (extension === ".pdf") {
    return PDF_BUCKET;
  }

  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    return IMAGE_BUCKET;
  }

  throw new Error("Unable to infer storage bucket from file path");
}

export function resolveBucketByMimeType(mimeType: string): DocumentBucket {
  if (mimeType === "application/pdf") {
    return PDF_BUCKET;
  }

  if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return IMAGE_BUCKET;
  }

  throw new Error(DOCUMENT_UPLOAD_ERROR_UNSUPPORTED_TYPE);
}

export function resolveBucketByStoragePath(storagePath: string): DocumentBucket {
  return inferBucketFromStoragePath(storagePath);
}

function buildApplicationObjectPath(params: {
  applicationId: string;
  documentType: string;
  fileName: string;
}): string {
  const applicationId = sanitizePathSegment(params.applicationId);
  const documentType = sanitizePathSegment(params.documentType);
  const safeFileName = sanitizeFileName(params.fileName || "upload.bin");

  return joinObjectPath(["applications", applicationId, documentType, safeFileName]);
}

function buildProfileImageObjectPath(params: {
  applicantId: string;
  mimeType: string;
}): string {
  const applicantId = sanitizePathSegment(params.applicantId);
  const extension = extensionFromMimeType(params.mimeType);
  const fileName = `profile-picture.${extension}`;

  return joinObjectPath(["profile-pictures", applicantId, fileName]);
}

export async function uploadDocumentFile(params: {
  file: File;
  objectPath?: string;
  objectPrefix?: string;
  upsert?: boolean;
  fileName?: string;
}) {
  const { file, objectPrefix, objectPath, fileName, upsert = false } = params;

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(DOCUMENT_UPLOAD_ERROR_UNSUPPORTED_TYPE);
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    throw new Error(DOCUMENT_UPLOAD_ERROR_MAX_SIZE);
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const contentError = validateDocumentFileContent(fileBytes, file.type);
  if (contentError) {
    throw new Error(contentError);
  }

  const bucket = resolveBucketByMimeType(file.type);
  const safeFileName = sanitizeFileName(file.name || "upload.bin");
  const storagePath =
    objectPath ??
    joinObjectPath([
      objectPrefix ? sanitizePathSegment(objectPrefix) : "documents",
      `${Date.now()}-${safeFileName}`,
    ]);

  if (isLocalStorageDriver()) {
    if (!upsert) {
      try {
        await fs.access(resolveLocalFilePath(storagePath));
        throw new Error("Storage path already exists");
      } catch (error) {
        if (error instanceof Error && error.message === "Storage path already exists") {
          throw error;
        }
      }
    }

    await localWriteFile(storagePath, file);
    return {
      fileName: fileName ?? safeFileName,
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath,
      bucket,
    };
  }

  const supabase = getSupabaseStorageAdminClient();
  const uploadResult = await supabase.storage.from(bucket).upload(storagePath, file, {
    contentType: file.type,
    upsert,
  });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  return {
    fileName: fileName ?? safeFileName,
    mimeType: file.type,
    sizeBytes: file.size,
    storagePath,
    bucket,
  };
}

export async function uploadApplicationFile(params: {
  applicationId: string;
  documentType: string;
  applicantName: string;
  file: File;
}) {
  const uploadedAt = new Date();
  const baseFileName = buildApplicantDocumentFileName({
    applicantName: params.applicantName,
    documentType: params.documentType,
    originalFileName: params.file.name,
    mimeType: params.file.type,
    uploadedAt,
  });

  const tryUpload = async (collisionSuffix?: string) => {
    const fileName = collisionSuffix
      ? buildApplicantDocumentFileName({
          applicantName: params.applicantName,
          documentType: params.documentType,
          originalFileName: params.file.name,
          mimeType: params.file.type,
          uploadedAt,
          collisionSuffix,
        })
      : baseFileName;

    const objectPath = buildApplicationObjectPath({
      applicationId: params.applicationId,
      documentType: params.documentType,
      fileName,
    });

    return uploadDocumentFile({
      file: params.file,
      objectPath,
      fileName,
    });
  };

  try {
    return await tryUpload();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists|Storage path already exists|duplicate|409/i.test(message)) {
      throw error;
    }

    return tryUpload(`retry-${Math.random().toString(36).slice(2, 6)}`);
  }
}

export async function uploadApplicantProfileImage(params: {
  applicantId: string;
  file: File;
}) {
  const objectPath = buildProfileImageObjectPath({
    applicantId: params.applicantId,
    mimeType: params.file.type,
  });

  return uploadDocumentFile({
    file: params.file,
    objectPath,
    upsert: true,
  });
}

export async function createStorageSignedUrl(params: {
  storagePath: string;
  mimeType: string;
  expiresIn?: number;
  downloadFileName?: string;
  download?: boolean;
}) {
  const bucket = resolveBucketByMimeType(params.mimeType);

  if (isLocalStorageDriver()) {
    const qs = params.download && params.downloadFileName
      ? `?download=${encodeURIComponent(params.downloadFileName)}`
      : "";
    return { bucket, signedUrl: `/api/uploads/${params.storagePath}${qs}` };
  }

  const supabase = getSupabaseStorageAdminClient();
  const result = await supabase.storage.from(bucket).createSignedUrl(params.storagePath, params.expiresIn ?? 60, {
    download: params.download ? params.downloadFileName || true : false,
  });

  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? "Unable to create signed URL");
  }

  return {
    bucket,
    signedUrl: result.data.signedUrl,
  };
}

/**
 * Serve a stored file for authenticated route handlers.
 * Local storage streams bytes directly (avoids brittle redirects behind ngrok/proxies).
 * Remote storage returns a short-lived signed URL for the caller to redirect to.
 */
export async function createStoredFileDelivery(params: {
  storagePath: string;
  mimeType: string;
  downloadFileName?: string;
  download?: boolean;
  expiresIn?: number;
}): Promise<
  | { mode: "stream"; response: Response }
  | { mode: "redirect"; signedUrl: string }
> {
  if (isLocalStorageDriver()) {
    let fileBuffer: Buffer;
    try {
      fileBuffer = await localReadFile(params.storagePath);
    } catch {
      throw new Error("Stored file not found");
    }

    const headers = new Headers({
      "Content-Type": params.mimeType || "application/octet-stream",
      "Content-Length": String(fileBuffer.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });

    const rawName = (params.downloadFileName || "download").replace(/[\r\n"]/g, "_");
    const asciiName = rawName.replace(/[^\x20-\x7E]/g, "_") || "download";
    const utf8Name = encodeURIComponent(rawName);

    if (params.download) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
      );
    } else {
      headers.set("Content-Disposition", `inline; filename="${asciiName}"`);
    }

    return {
      mode: "stream",
      response: new Response(new Uint8Array(fileBuffer), {
        status: 200,
        headers,
      }),
    };
  }

  const signed = await createStorageSignedUrl(params);
  return { mode: "redirect", signedUrl: signed.signedUrl };
}

function configuredPublicOrigin(): string | null {
  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (process.env.NODE_ENV === "production" && isLocalHostName(parsed.hostname)) {
        continue;
      }
      return parsed.origin;
    } catch {
      // Ignore invalid env URL values.
    }
  }
  return null;
}

function isLocalHostName(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized.startsWith("localhost:") ||
    normalized.startsWith("127.0.0.1:") ||
    normalized.startsWith("0.0.0.0:") ||
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0"
  );
}

/** Prefer proxy-aware public origin so redirects stay on the browser's host (e.g. ngrok). */
export function resolveRequestPublicOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = req.headers.get("host")?.trim();
  if (host) {
    if (isLocalHostName(host)) {
      const configured = configuredPublicOrigin();
      if (configured) {
        return configured;
      }
    }

    const proto = forwardedProto || (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  const requestOrigin = new URL(req.url).origin;
  if (isLocalHostName(new URL(req.url).host)) {
    return configuredPublicOrigin() ?? requestOrigin;
  }

  return requestOrigin;
}

export async function createStorageSignedUrlByPath(params: {
  storagePath: string;
  expiresIn?: number;
  downloadFileName?: string;
  download?: boolean;
}) {
  const bucket = resolveBucketByStoragePath(params.storagePath);

  if (isLocalStorageDriver()) {
    const qs = params.download && params.downloadFileName
      ? `?download=${encodeURIComponent(params.downloadFileName)}`
      : "";
    return { bucket, signedUrl: `/api/uploads/${params.storagePath}${qs}` };
  }

  const supabase = getSupabaseStorageAdminClient();
  const result = await supabase.storage.from(bucket).createSignedUrl(params.storagePath, params.expiresIn ?? 60, {
    download: params.download ? params.downloadFileName || true : false,
  });

  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? "Unable to create signed URL");
  }

  return {
    bucket,
    signedUrl: result.data.signedUrl,
  };
}

export async function deleteStorageObject(params: {
  storagePath: string;
  mimeType?: string;
}) {
  const bucket = params.mimeType ? resolveBucketByMimeType(params.mimeType) : inferBucketFromStoragePath(params.storagePath);

  if (isLocalStorageDriver()) {
    await localDeleteFile(params.storagePath);
    return { bucket };
  }

  const supabase = getSupabaseStorageAdminClient();
  const result = await supabase.storage.from(bucket).remove([params.storagePath]);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { bucket };
}

export async function storeApplicantDocument(
  file: File,
  options?: {
    applicationId?: string;
    documentType?: string;
    applicantName?: string;
    objectPrefix?: string;
  }
) {
  if (options?.applicationId && options.documentType) {
    return uploadApplicationFile({
      file,
      applicationId: options.applicationId,
      documentType: options.documentType,
      applicantName: options.applicantName ?? formatOwnerName({ ownerName: "Applicant" }),
    });
  }

  return uploadDocumentFile({ file, objectPrefix: options?.objectPrefix });
}

export async function removeApplicantDocument(storagePath: string, mimeType?: string) {
  try {
    await deleteStorageObject({ storagePath, mimeType });
  } catch {
    // Missing files should not break document record cleanup.
  }
}

export const getDocumentSignedUrl = createStorageSignedUrl;
export const deleteDocumentFile = deleteStorageObject;

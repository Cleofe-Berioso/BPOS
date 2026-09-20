export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_FILE_SIZE_LABEL = "10 MB";

export const DOCUMENT_UPLOAD_ERROR_MAX_SIZE =
  "File exceeds the 10 MB file size limit.";
export const DOCUMENT_UPLOAD_ERROR_UNSUPPORTED_TYPE =
  "Unsupported file type. Please upload PDF, JPG, PNG, or WEBP files.";

export function buildDocumentMaxSizeError(fileName: string): string {
  const safeFileName = fileName.trim().length > 0 ? fileName.trim() : "File";
  return `${safeFileName} exceeds the 10 MB file size limit.`;
}

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const ALLOWED_DOCUMENT_MIME_TYPE_SET = new Set<string>(ALLOWED_DOCUMENT_MIME_TYPES);

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return ALLOWED_DOCUMENT_MIME_TYPE_SET.has(mimeType);
}

export function validateDocumentFileUpload(file: File): string | null {
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return DOCUMENT_UPLOAD_ERROR_MAX_SIZE;
  }

  if (!isAllowedDocumentMimeType(file.type)) {
    return DOCUMENT_UPLOAD_ERROR_UNSUPPORTED_TYPE;
  }

  return null;
}

export const DOCUMENT_FILE_INPUT_ACCEPT = ALLOWED_DOCUMENT_MIME_TYPES.join(",");

export const MAX_TOTAL_SUBMIT_UPLOAD_BYTES = 4.2 * 1024 * 1024;
export const MAX_TOTAL_SUBMIT_UPLOAD_LABEL = "4.2 MB";

export function validateTotalPendingUploadSize(files: File[]): string | null {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_SUBMIT_UPLOAD_BYTES) {
    const totalMb = (total / (1024 * 1024)).toFixed(1);
    return `The combined size of all uploaded documents (${totalMb} MB) exceeds the ${MAX_TOTAL_SUBMIT_UPLOAD_LABEL} limit. Please compress your files before submitting.`;
  }
  return null;
}

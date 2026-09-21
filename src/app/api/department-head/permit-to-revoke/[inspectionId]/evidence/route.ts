import path from "node:path";
import { NextResponse } from "next/server";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";
import { prisma } from "@/lib/prisma";
import { ensureUploadRoot, localReadFile, resolveLocalFilePath } from "@/lib/local-storage";
import { getSupabaseStorageAdminClient } from "@/lib/supabase-storage-server";
import { resolveBucketByMimeType, resolveBucketByStoragePath } from "@/lib/document-storage";

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function isSafeStoragePath(storagePath: string): boolean {
  return storagePath.trim().length > 0 && !storagePath.includes("..") && !storagePath.startsWith("/") && !storagePath.startsWith("\\");
}

function inferMimeType(storagePath: string, mimeType: string | null): string {
  if (mimeType?.trim()) {
    return mimeType;
  }

  const extension = path.extname(storagePath).toLowerCase();
  return MIME_MAP[extension] ?? "application/octet-stream";
}

function contentDispositionInline(fileName: string): string {
  const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `inline; filename="${safeFileName}"`;
}

function resolveEvidenceBucket(storagePath: string, evidenceBucket: string | null, contentType: string) {
  if (evidenceBucket?.trim()) {
    return evidenceBucket;
  }

  try {
    return resolveBucketByStoragePath(storagePath);
  } catch {
    return resolveBucketByMimeType(contentType);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  try {
    const session = await requireDepartmentHeadSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { inspectionId } = await params;
    const inspection = await prisma.inspection.findUnique({
      where: { inspectionId },
      select: {
        evidenceStoragePath: true,
        evidenceBucket: true,
        evidenceMimeType: true,
        evidenceFileName: true,
        status: true,
      },
    });

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }

    if (!inspection.evidenceStoragePath) {
      return NextResponse.json({ error: "No evidence uploaded." }, { status: 404 });
    }

    if (!isSafeStoragePath(inspection.evidenceStoragePath)) {
      return NextResponse.json({ error: "Invalid evidence path" }, { status: 400 });
    }

    if (!new Set(["VERIFIED_NON_COMPLIANT", "REVOCATION_REVIEW", "REVOCATION_DENIED", "REVOKED"]).has(inspection.status)) {
      return NextResponse.json({ error: "Inspection evidence not available" }, { status: 403 });
    }

    const contentType = inferMimeType(inspection.evidenceStoragePath, inspection.evidenceMimeType);
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": contentDispositionInline(inspection.evidenceFileName ?? inspection.evidenceStoragePath),
      "Cache-Control": "private, no-store",
    });

    if (process.env.STORAGE_DRIVER === "local") {
      await ensureUploadRoot();
      resolveLocalFilePath(inspection.evidenceStoragePath);
      const fileBuffer = await localReadFile(inspection.evidenceStoragePath);
      return new NextResponse(new Uint8Array(fileBuffer), { status: 200, headers });
    }

    const bucket = resolveEvidenceBucket(inspection.evidenceStoragePath, inspection.evidenceBucket, contentType);
    const supabase = getSupabaseStorageAdminClient();
    const result = await supabase.storage.from(bucket).download(inspection.evidenceStoragePath);

    if (result.error || !result.data) {
      return NextResponse.json({ error: "Inspection evidence file was not found in storage." }, { status: 404 });
    }

    const fileBuffer = await result.data.arrayBuffer();
    return new NextResponse(Buffer.from(fileBuffer), { status: 200, headers });
  } catch (error) {
    console.error("Failed to retrieve inspection evidence:", error);
    return NextResponse.json({ error: "Inspection evidence file was not found in storage." }, { status: 404 });
  }
}

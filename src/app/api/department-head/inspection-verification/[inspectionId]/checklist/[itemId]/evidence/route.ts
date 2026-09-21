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
  { params }: { params: Promise<{ inspectionId: string; itemId: string }> }
) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId, itemId } = await params;
  const checklistItem = await prisma.inspectionChecklistItem.findFirst({
    where: {
      inspectionChecklistItemId: itemId,
      inspectionId,
      inspection: {
        status: "DH_VERIFICATION_PENDING",
      },
    },
    select: {
      evidenceStoragePath: true,
      evidenceBucket: true,
      evidenceMimeType: true,
      evidenceFileName: true,
    },
  });

  if (!checklistItem) {
    return NextResponse.json({ error: "Checklist evidence not found" }, { status: 404 });
  }

  if (!checklistItem.evidenceStoragePath) {
    return NextResponse.json({ error: "No evidence uploaded for this checklist item." }, { status: 404 });
  }

  if (!isSafeStoragePath(checklistItem.evidenceStoragePath)) {
    return NextResponse.json({ error: "Invalid evidence path" }, { status: 400 });
  }

  try {
    const contentType = inferMimeType(checklistItem.evidenceStoragePath, checklistItem.evidenceMimeType);
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": contentDispositionInline(
        checklistItem.evidenceFileName ?? checklistItem.evidenceStoragePath
      ),
      "Cache-Control": "private, no-store",
    });

    if (process.env.STORAGE_DRIVER === "local") {
      await ensureUploadRoot();
      resolveLocalFilePath(checklistItem.evidenceStoragePath);
      const fileBuffer = await localReadFile(checklistItem.evidenceStoragePath);
      return new NextResponse(new Uint8Array(fileBuffer), { status: 200, headers });
    }

    const bucket = resolveEvidenceBucket(
      checklistItem.evidenceStoragePath,
      checklistItem.evidenceBucket,
      contentType
    );
    const supabase = getSupabaseStorageAdminClient();
    const result = await supabase.storage.from(bucket).download(checklistItem.evidenceStoragePath);

    if (result.error || !result.data) {
      return NextResponse.json({ error: "Checklist evidence file was not found in storage." }, { status: 404 });
    }

    const fileBuffer = await result.data.arrayBuffer();
    return new NextResponse(Buffer.from(fileBuffer), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Checklist evidence file was not found in storage." }, { status: 404 });
  }
}

import { NextResponse } from "next/server";
import { requireBploSession } from "@/lib/bplo-api";
import { prisma } from "@/lib/prisma";
import { localReadFile } from "@/lib/local-storage";
import { getSupabaseStorageAdminClient } from "@/lib/supabase-storage-server";
import { resolveBucketByStoragePath } from "@/lib/document-storage";

function isSafeStoragePath(storagePath: string): boolean {
  return storagePath.trim().length > 0 && !storagePath.includes("..") && !storagePath.startsWith("/") && !storagePath.startsWith("\\");
}

function contentDispositionInline(fileName: string): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `inline; filename="${safeFileName}"`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paymentReferenceId: string }> }
) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentReferenceId } = await params;
  const reference = await prisma.paymentReference.findUnique({
    where: { paymentReferenceId },
    select: {
      proofStoragePath: true,
      proofBucket: true,
      proofMimeType: true,
      proofFileName: true,
      application: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!reference) {
    return NextResponse.json({ error: "Payment reference not found" }, { status: 404 });
  }

  if (!reference.proofStoragePath || !reference.proofFileName || !reference.proofMimeType) {
    return NextResponse.json({ error: "No payment proof has been uploaded for this reference." }, { status: 404 });
  }

  if (!isSafeStoragePath(reference.proofStoragePath)) {
    return NextResponse.json({ error: "Invalid payment proof path" }, { status: 400 });
  }

  const allowedStatuses = new Set([
    "APPROVED_FOR_PAYMENT",
    "PAID",
    "FOR_RELEASE",
    "RELEASED",
  ]);
  if (!allowedStatuses.has(reference.application.status)) {
    return NextResponse.json({ error: "Payment proof not available" }, { status: 403 });
  }

  try {
    const headers = new Headers({
      "Content-Type": reference.proofMimeType,
      "Content-Disposition": contentDispositionInline(reference.proofFileName),
      "Cache-Control": "no-store",
    });

    if (process.env.STORAGE_DRIVER === "local") {
      const fileBuffer = await localReadFile(reference.proofStoragePath);
      const arrayBuffer = new Uint8Array(fileBuffer).buffer;

      return new NextResponse(arrayBuffer, {
        status: 200,
        headers,
      });
    }

    const bucket = reference.proofBucket ?? resolveBucketByStoragePath(reference.proofStoragePath);
    const supabase = getSupabaseStorageAdminClient();
    const result = await supabase.storage.from(bucket).download(reference.proofStoragePath);
    if (result.error || !result.data) {
      return NextResponse.json({ error: "Payment proof file was not found in storage." }, { status: 404 });
    }

    const arrayBuffer = await result.data.arrayBuffer();
    return new NextResponse(Buffer.from(arrayBuffer), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Payment proof file was not found in storage." }, { status: 404 });
  }
}

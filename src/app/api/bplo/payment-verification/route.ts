import { NextResponse } from "next/server";
import { requireBploSession } from "@/lib/bplo-api";
import { listPaymentVerificationEntriesPaginated } from "@/lib/bplo-payment-verification";

export async function GET(req: Request) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tab = (searchParams.get("tab") ?? "PENDING") as "PENDING" | "VERIFIED" | "RETURNED" | "REJECTED";
  const page = searchParams.get("page") ?? undefined;
  const pageSize = searchParams.get("pageSize") ?? undefined;

  const result = await listPaymentVerificationEntriesPaginated(tab, { page, pageSize });
  return NextResponse.json(result);
}

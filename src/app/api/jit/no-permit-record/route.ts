import { NextResponse } from "next/server";
import { requireJitSession } from "@/lib/jit-api";
import { listJitNoPermitRecordsPaginated } from "@/lib/jit-no-permit-records";
import { sendNoPermitOptionalNotification } from "@/lib/jit-no-permit-notifications";
import {
  createJitNoPermitTicket,
  normalizeOptionalEmail,
  normalizeOptionalPhone,
} from "@/lib/jit-no-permit-ticket";

export async function GET(req: Request) {
  const session = await requireJitSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = searchParams.get("page") ?? undefined;
  const pageSize = searchParams.get("pageSize") ?? undefined;

  const result = await listJitNoPermitRecordsPaginated(session.user.id, { page, pageSize });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await requireJitSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const {
    businessName,
    personAttended,
    lineOfBusiness,
    remarks,
    findings,
    latitude,
    longitude,
    address,
    contactPhone,
    contactEmail,
  } = body;

  if (!businessName || typeof businessName !== "string" || businessName.trim() === "") {
    return NextResponse.json({ error: "businessName is required" }, { status: 400 });
  }
  if (!personAttended || typeof personAttended !== "string" || personAttended.trim() === "") {
    return NextResponse.json({ error: "Witness is required" }, { status: 400 });
  }
  if (!lineOfBusiness || typeof lineOfBusiness !== "string" || lineOfBusiness.trim() === "") {
    return NextResponse.json({ error: "lineOfBusiness is required" }, { status: 400 });
  }
  if (latitude === undefined || typeof latitude !== "number") {
    return NextResponse.json({ error: "latitude is required and must be a number" }, { status: 400 });
  }
  if (longitude === undefined || typeof longitude !== "number") {
    return NextResponse.json({ error: "longitude is required and must be a number" }, { status: 400 });
  }

  const normalizedPhone = normalizeOptionalPhone(typeof contactPhone === "string" ? contactPhone : null);
  const normalizedEmail = normalizeOptionalEmail(typeof contactEmail === "string" ? contactEmail : null);

  if (typeof contactPhone === "string" && contactPhone.trim() && !normalizedPhone) {
    return NextResponse.json({ error: "contactPhone must be a valid Philippine mobile number" }, { status: 400 });
  }
  if (typeof contactEmail === "string" && contactEmail.trim() && !normalizedEmail) {
    return NextResponse.json({ error: "contactEmail must be a valid email address" }, { status: 400 });
  }

  const result = await createJitNoPermitTicket({
    businessName,
    personAttended,
    lineOfBusiness,
    remarks: typeof remarks === "string" ? remarks : null,
    findings: typeof findings === "string" ? findings : null,
    latitude: Number(latitude),
    longitude: Number(longitude),
    address: typeof address === "string" ? address : null,
    contactPhone: normalizedPhone,
    contactEmail: normalizedEmail,
    createdById: session.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "An open no-permit ticket already exists for this establishment and location.",
        duplicate: result.duplicate,
        printPath: `/jit/no-permit-record/${result.duplicate.id}/print`,
      },
      { status: 409 }
    );
  }

  const notification = await sendNoPermitOptionalNotification({
    recordId: result.record.jitNoPermitRecordId,
    businessName: result.record.businessName,
    personAttended: result.record.personAttended,
    ticketNumber: result.record.ticketNumber,
    requiredAction: result.record.requiredAction,
    contactPhone: result.record.contactPhone,
    contactEmail: result.record.contactEmail,
  });

  return NextResponse.json(
    {
      record: result.record,
      printPath: `/jit/no-permit-record/${result.record.jitNoPermitRecordId}/print`,
      notification,
    },
    { status: 201 }
  );
}

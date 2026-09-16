import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { createRenewalExtension, listRenewalExtensions } from "@/lib/fee-settings";
import { parseRenewalExtensionCreate } from "@/lib/superadmin-settings-policies";

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const extensions = await listRenewalExtensions();
  return NextResponse.json({ extensions });
}

export async function POST(req: Request) {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = parseRenewalExtensionCreate(body as Record<string, unknown>);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const extension = await createRenewalExtension({
      ...parsed.value,
      updatedById: session.user.id,
    });

    return NextResponse.json({ success: true, extension }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const safeMessage =
        process.env.NODE_ENV !== "production"
          ? error.message
          : "Failed to create renewal extension. Please check your input and try again.";
      return NextResponse.json({ error: safeMessage }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create renewal extension." }, { status: 500 });
  }
}

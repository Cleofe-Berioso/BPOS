import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { getOrCreateSystemFeeSetting, updateSystemFeeSetting } from "@/lib/fee-settings";
import { logSettingsAction } from "@/lib/audit-log";
import { parseSystemPenaltySettings } from "@/lib/superadmin-settings-policies";

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const penalties = await getOrCreateSystemFeeSetting();
  return NextResponse.json({ penalties });
}

export async function PUT(req: Request) {
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

  const parsed = parseSystemPenaltySettings(body as Record<string, unknown>);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const penalties = await updateSystemFeeSetting({
      ...parsed.value,
      updatedById: session.user.id,
    });
    // Audit: Penalties/system fees updated
    void logSettingsAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "SUPER_ADMIN",
      "SYSTEM_FEE",
      "default",
      "UPDATED",
      "System fee settings updated",
      { ...parsed.value }
    );

    return NextResponse.json({ success: true, penalties });
  } catch {
    return NextResponse.json({ error: "Failed to update penalty settings." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { logSettingsAction } from "@/lib/audit-log";
import { toggleRenewalExtension, formatRenewalExtensionPeriod } from "@/lib/fee-settings";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ extensionId: string }> }
) {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { extensionId } = await params;
  if (!extensionId) {
    return NextResponse.json({ error: "Extension ID is required." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { isActive } = body as Record<string, unknown>;
  if (typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be true or false." }, { status: 400 });
  }

  try {
    const extension = await toggleRenewalExtension({
      extensionId,
      isActive,
      updatedById: session.user.id,
    });

    // Audit: Renewal extension toggled
    await logSettingsAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "SUPER_ADMIN",
      "RENEWAL_EXTENSION",
      extensionId,
      "UPDATED",
      `Renewal extension ${isActive ? "activated" : "deactivated"}: ${formatRenewalExtensionPeriod(extension.startDate, extension.endDate)}`,
      { startDate: extension.startDate, endDate: extension.endDate, isActive }
    );

    return NextResponse.json({ success: true, extension });
  } catch (error) {
    return NextResponse.json({ error: safeApiErrorMessage(error, "Failed to update extension status.") }, { status: 400 });
    return NextResponse.json({ error: "Failed to update extension status." }, { status: 500 });
  }
}

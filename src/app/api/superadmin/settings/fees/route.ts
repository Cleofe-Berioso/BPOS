import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import {
  deleteFeeConfigurationItem,
  getAllFeeCategoryOptions,
  isValidClassificationForOptions,
  listFeeConfigurationItems,
  upsertFeeConfigurationItem,
  updateFeeConfigurationItemById,
} from "@/lib/fee-settings";
import { logSettingsAction } from "@/lib/audit-log";
import { validateFeeAmount } from "@/lib/superadmin-settings-policies";

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [items, categories] = await Promise.all([
    listFeeConfigurationItems(),
    getAllFeeCategoryOptions(),
  ]);
  return NextResponse.json({ items, categories });
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

  const { category, classification, amount } = body as Record<string, unknown>;
  const categories = await getAllFeeCategoryOptions();

  if (typeof category !== "string" || !categories.some((item) => item.key === category)) {
    return NextResponse.json({ error: "Invalid business category." }, { status: 400 });
  }

  if (typeof classification !== "string" || !classification.trim()) {
    return NextResponse.json({ error: "Size classification is required." }, { status: 400 });
  }

  if (!isValidClassificationForOptions(category, classification, categories)) {
    return NextResponse.json(
      { error: "Invalid size classification for the selected business category." },
      { status: 400 }
    );
  }

  const amountCheck = validateFeeAmount(amount);
  if (amountCheck.ok === false) {
    return NextResponse.json({ error: amountCheck.error }, { status: 400 });
  }

  try {
    const item = await upsertFeeConfigurationItem({
      category,
      classification,
      amount: amountCheck.amount,
      isActive: true,
      updatedById: session.user.id,
    });

    void logSettingsAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "SUPER_ADMIN",
      "FEE_CONFIGURATION",
      item.id,
      "CREATED",
      `Fee configuration: ${category} / ${classification} = PHP ${amountCheck.amount}`,
      { category, classification, amount: amountCheck.amount, isActive: true }
    );

    return NextResponse.json({ success: true, item });
  } catch {
    return NextResponse.json({ error: "Failed to save fee configuration." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
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

  const { id, amount } = body as Record<string, unknown>;

  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Configuration item ID is required." }, { status: 400 });
  }

  if (typeof amount !== "undefined") {
    const amountCheck = validateFeeAmount(amount);
    if (amountCheck.ok === false) {
      return NextResponse.json({ error: amountCheck.error }, { status: 400 });
    }
  }

  try {
    const item = await updateFeeConfigurationItemById({
      id,
      ...(typeof amount === "number" ? { amount } : {}),
      updatedById: session.user.id,
    });

    return NextResponse.json({ success: true, item });
  } catch {
    return NextResponse.json({ error: "Failed to update fee configuration item." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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

  const { id } = body as Record<string, unknown>;
  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Configuration item ID is required." }, { status: 400 });
  }

  try {
    const item = await deleteFeeConfigurationItem(id.trim());
    void logSettingsAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "SUPER_ADMIN",
      "FEE_CONFIGURATION",
      item.id,
      "DELETED",
      `Fee configuration deleted: ${item.category} / ${item.classification}`,
      { category: item.category, classification: item.classification }
    );
    return NextResponse.json({ success: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete fee configuration item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

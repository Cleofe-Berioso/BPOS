import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import {
  createFeeConfigurationCategory,
  deleteFeeConfigurationCategory,
  getAllFeeCategoryOptions,
} from "@/lib/fee-settings";
import { logSettingsAction } from "@/lib/audit-log";

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await getAllFeeCategoryOptions();
  return NextResponse.json({ categories });
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

  const { label, key, classifications, useDefaultClassifications, useFixedFeeOnly } =
    (body ?? {}) as Record<string, unknown>;

  if (typeof label !== "string" || !label.trim()) {
    return NextResponse.json({ error: "Category label is required." }, { status: 400 });
  }

  try {
    const category = await createFeeConfigurationCategory({
      label: label.trim(),
      key: typeof key === "string" && key.trim() ? key.trim() : undefined,
      classifications: Array.isArray(classifications)
        ? (classifications as string[])
        : undefined,
      useDefaultClassifications: Boolean(useDefaultClassifications),
      useFixedFeeOnly: Boolean(useFixedFeeOnly),
      updatedById: session.user.id,
    });

    void logSettingsAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "SUPER_ADMIN",
      "FEE_CONFIGURATION",
      category.key,
      "CREATED",
      `Business category added: ${category.label} (${category.key})`,
      { key: category.key, label: category.label, classifications: category.classifications }
    );

    const categories = await getAllFeeCategoryOptions();
    return NextResponse.json({ success: true, category, categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add business category.";
    return NextResponse.json({ error: message }, { status: 400 });
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

  const { key } = (body ?? {}) as Record<string, unknown>;
  if (typeof key !== "string" || !key.trim()) {
    return NextResponse.json({ error: "Category key is required." }, { status: 400 });
  }

  try {
    const deleted = await deleteFeeConfigurationCategory(key.trim());
    void logSettingsAction(
      session.user.id,
      session.user.name ?? session.user.email ?? null,
      "SUPER_ADMIN",
      "FEE_CONFIGURATION",
      deleted.key,
      "DELETED",
      `Business category deleted: ${deleted.label} (${deleted.key}) along with ${deleted.deletedFeeItems} fee items`,
      { key: deleted.key, label: deleted.label, deletedFeeItems: deleted.deletedFeeItems }
    );

    const categories = await getAllFeeCategoryOptions();
    return NextResponse.json({ success: true, deleted, categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete business category.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { getOrCreateSystemFeeSetting } from "@/lib/fee-settings";
import {
  countUninspectedActivePermittedBusinesses,
  updateJitPortalEnabled,
  type JitPortalEnforcementResult,
  type JitUninspectedSummary,
} from "@/lib/jit-settings";
import { parseJitPortalEnabled } from "@/lib/superadmin-settings-policies";

export interface JitPortalResponse {
  jitPortalEnabled: boolean;
  updatedAt: string;
  uninspected: JitUninspectedSummary;
  error?: string;
}

export interface JitPortalUpdateResponse {
  success: boolean;
  jitPortalEnabled: boolean;
  enforcementResult?: JitPortalEnforcementResult;
  uninspectedAtDisable?: JitUninspectedSummary;
  inspectionCycleStartedAt?: string;
  error?: string;
}

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [settings, uninspected] = await Promise.all([
      getOrCreateSystemFeeSetting(),
      countUninspectedActivePermittedBusinesses(),
    ]);
    return NextResponse.json({
      jitPortalEnabled: settings.jitPortalEnabled,
      updatedAt: settings.updatedAt,
      uninspected,
    } as JitPortalResponse);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch JIT portal setting." },
      { status: 500 }
    );
  }
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

  const { jitPortalEnabled } = body as Record<string, unknown>;
  const parsed = parseJitPortalEnabled(jitPortalEnabled);
  if (parsed.ok === false) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await updateJitPortalEnabled({
      enabled: parsed.value,
      changedById: session.user.id,
      changedByName: session.user.name ?? session.user.email ?? null,
      changedByRole: session.user.role,
    });

    return NextResponse.json({
      success: result.success,
      jitPortalEnabled: result.newValue,
      ...(result.enforcementResult ? { enforcementResult: result.enforcementResult } : {}),
      ...(result.uninspectedAtDisable ? { uninspectedAtDisable: result.uninspectedAtDisable } : {}),
      ...(result.inspectionCycleStartedAt
        ? { inspectionCycleStartedAt: result.inspectionCycleStartedAt }
        : {}),
    } as JitPortalUpdateResponse);
  } catch (error) {
    console.error("[JIT Settings API] Error updating JIT portal setting:", error);
    return NextResponse.json(
      { error: "Failed to update JIT portal setting." },
      { status: 500 }
    );
  }
}

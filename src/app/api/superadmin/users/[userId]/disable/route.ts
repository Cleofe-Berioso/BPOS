import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { prisma } from "@/lib/prisma";
import { createAuditLog, logUserManagementAction } from "@/lib/audit-log";
import { decideDisableUser } from "@/lib/superadmin-user-policies";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const { userId } = await params;

  const target = userId
    ? await prisma.user.findUnique({
        where: { userId },
        select: { userId: true, name: true, email: true, role: true, isActive: true },
      })
    : null;

  let activeSuperAdminCount = 0;
  if (target?.role === "SUPER_ADMIN" && target.isActive) {
    activeSuperAdminCount = await prisma.user.count({
      where: { role: "SUPER_ADMIN", isActive: true },
    });
  }

  const decision = decideDisableUser({
    actorId: session.user.id,
    targetId: userId,
    targetExists: Boolean(target),
    targetIsActive: target?.isActive ?? false,
    targetRole: target?.role ?? "",
    activeSuperAdminCount,
  });

  if (decision.action === "reject") {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  if (decision.action === "already_disabled") {
    return NextResponse.json({ success: true, message: "User is already disabled." });
  }

  await prisma.user.update({
    where: { userId },
    data: { isActive: false },
  });

  if (target!.role === "JIT") {
    void createAuditLog({
      actorId: session.user.id,
      actorName: session.user.name ?? session.user.email ?? null,
      actorRole: "SUPER_ADMIN",
      action: "SUPERADMIN_DISABLED_JIT_INSPECTOR",
      module: "USER_MANAGEMENT",
      entityType: "USER",
      entityId: target!.email,
      description: `IT Administrator disabled JIT inspector account${reason ? `: ${reason}` : ""}`,
      metadata: {
        targetUserId: target!.userId,
        targetName: target!.name,
        targetEmail: target!.email,
        targetRole: target!.role,
        reason: reason || null,
      },
    });
  }

  void logUserManagementAction(
    session.user.id,
    session.user.name ?? session.user.email ?? null,
    "SUPER_ADMIN",
    userId,
    userId,
    "DEACTIVATED",
    "ACTIVE",
    "INACTIVE",
    `User disabled: ${target!.role}`,
    { role: target!.role, targetName: target!.name, targetEmail: target!.email, reason: reason || null }
  );

  return NextResponse.json({ success: true });
}

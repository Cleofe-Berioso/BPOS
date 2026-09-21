import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { prisma } from "@/lib/prisma";
import { createAuditLog, logUserManagementAction } from "@/lib/audit-log";
import { decideReactivateUser } from "@/lib/superadmin-user-policies";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  const target = userId
    ? await prisma.user.findUnique({
        where: { userId },
        select: { userId: true, name: true, email: true, role: true, isActive: true },
      })
    : null;

  const decision = decideReactivateUser({
    targetId: userId,
    targetExists: Boolean(target),
    targetIsActive: target?.isActive ?? false,
  });

  if (decision.action === "reject") {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  if (decision.action === "already_active") {
    return NextResponse.json({ success: true, message: "User is already active." });
  }

  await prisma.user.update({
    where: { userId },
    data: { isActive: true },
  });

  if (target!.role === "JIT") {
    void createAuditLog({
      actorId: session.user.id,
      actorName: session.user.name ?? session.user.email ?? null,
      actorRole: "SUPER_ADMIN",
      action: "SUPERADMIN_ENABLED_JIT_INSPECTOR",
      module: "USER_MANAGEMENT",
      entityType: "USER",
      entityId: target!.email,
      description: "IT Administrator enabled JIT inspector account",
      metadata: {
        targetUserId: target!.userId,
        targetName: target!.name,
        targetEmail: target!.email,
        targetRole: target!.role,
      },
    });
  }

  void logUserManagementAction(
    session.user.id,
    session.user.name ?? session.user.email ?? null,
    "SUPER_ADMIN",
    userId,
    userId,
    "ACTIVATED",
    "INACTIVE",
    "ACTIVE",
    `User reactivated`,
    { role: target!.role, targetName: target!.name, targetEmail: target!.email }
  );

  return NextResponse.json({ success: true });
}

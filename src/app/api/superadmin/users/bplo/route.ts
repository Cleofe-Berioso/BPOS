import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit-log";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import { parseCreateBploAccountInput, mapUserActiveStatus } from "@/lib/superadmin-user-policies";
import { prisma } from "@/lib/prisma";

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

  const parsed = parseCreateBploAccountInput(body as Record<string, unknown>);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const {
    firstName,
    middleName,
    lastName,
    suffix,
    name: computedName,
    email: normalizedEmail,
    password,
  } = parsed.value;

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      name: computedName,
      firstName,
      middleName: middleName || null,
      lastName,
      suffix: suffix || null,
      email: normalizedEmail,
      passwordHash,
      role: "BPLO",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  void createAuditLog({
    actorId: session.user.id,
    actorName: session.user.name ?? session.user.email ?? null,
    actorRole: "SUPER_ADMIN",
    action: "STAFF_ACCOUNT_CREATED",
    module: "USER_MANAGEMENT",
    entityType: "USER",
    entityId: user.id,
    description: "IT Administrator created new BPLO staff account",
    metadata: {
      newUserId: user.id,
      newUserEmail: user.email,
      newUserRole: "BPLO",
    },
  });

  return NextResponse.json(
    {
      success: true,
      user: {
        ...user,
        status: mapUserActiveStatus(user.isActive),
      },
    },
    { status: 201 }
  );
}

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { resolveApplicantSessionContext } from "@/lib/applicant-api";
import { logUserManagementAction } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const authContext = await resolveApplicantSessionContext();
  if (authContext.ok === false) {
    return NextResponse.json({ error: authContext.error }, { status: authContext.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword } = body as Record<string, unknown>;

  if (!currentPassword || typeof currentPassword !== "string") {
    return NextResponse.json({ error: "Current password is required." }, { status: 400 });
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (confirmPassword !== newPassword) {
    return NextResponse.json({ error: "New password and confirmation do not match." }, { status: 400 });
  }

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from your current password." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { userId: authContext.applicantId },
    select: { userId: true, email: true, passwordHash: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Unable to update password for this account." }, { status: 404 });
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentMatches) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { userId: user.userId },
    data: { passwordHash },
  });

  void logUserManagementAction(
    authContext.applicantId,
    authContext.session.user.name ?? authContext.applicantEmail,
    "APPLICANT",
    user.userId,
    user.email,
    "PASSWORD_CHANGED",
    null,
    null,
    "Applicant changed account password",
    { targetUserId: user.userId }
  );

  return NextResponse.json({ success: true, message: "Password updated successfully." });
}

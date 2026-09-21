import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/person-name";
import {
  checkRateLimit,
  rateLimitResponse,
  REGISTER_RATE_LIMIT,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-client-ip";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { isValidPhMobile } from "@/lib/ph-mobile";

export async function POST(req: NextRequest) {
  const ipLimit = checkRateLimit(`register:ip:${getClientIp(req)}`, REGISTER_RATE_LIMIT);
  if (!ipLimit.ok) {
    return rateLimitResponse(ipLimit.resetAt);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { firstName, middleName, lastName, suffix, email, contactNumber, password, confirmPassword } = body as Record<string, unknown>;

  // ── Field presence validation ──────────────────────────────────────────────
  if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }

  if (!lastName || typeof lastName !== "string" || lastName.trim().length === 0) {
    return NextResponse.json({ error: "Last name is required." }, { status: 400 });
  }

  if (!email || typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json({ error: "Email address is required." }, { status: 400 });
  }

  if (!contactNumber || typeof contactNumber !== "string" || contactNumber.trim().length === 0) {
    return NextResponse.json({ error: "Contact number is required." }, { status: 400 });
  }

  const normalizedContactNumber = contactNumber.replace(/[\s-]/g, "");
  if (!isValidPhMobile(normalizedContactNumber)) {
    return NextResponse.json({ error: "Invalid Philippine mobile number format." }, { status: 400 });
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return NextResponse.json({ error: "Invalid email address format." }, { status: 400 });
  }

  if (!password || typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  const passwordPolicyError = validatePasswordPolicy(password);
  if (passwordPolicyError) {
    return NextResponse.json({ error: passwordPolicyError }, { status: 400 });
  }

  if (confirmPassword !== password) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // ── Uniqueness check ───────────────────────────────────────────────────────
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: "Unable to create account. If you already have an account, try signing in." },
      { status: 409 }
    );
  }

  // ── OTP verification gate ──────────────────────────────────────────────────
  // Require that the email was verified within the last 15 minutes
  // by checking for a recently-verified, unused OTP in the PasswordResetOtp table.
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const verifiedOtp = await prisma.passwordResetOtp.findFirst({
    where: {
      email: normalizedEmail,
      verifiedAt: { not: null, gte: fifteenMinutesAgo },
      usedAt: null,
    },
    orderBy: { verifiedAt: "desc" },
  });

  if (!verifiedOtp) {
    return NextResponse.json(
      { error: "Email verification required. Please verify your email with the OTP before registering." },
      { status: 403 }
    );
  }

  // Mark the OTP as used so it cannot be replayed
  await prisma.passwordResetOtp.update({
    where: { passwordResetOtpId: verifiedOtp.passwordResetOtpId },
    data: { usedAt: new Date() },
  });

  // ── Create user ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, 12);
  const normalizedFirstName = firstName.trim();
  const normalizedMiddleName = typeof middleName === "string" ? middleName.trim() : "";
  const normalizedLastName = lastName.trim();
  const normalizedSuffix = typeof suffix === "string" ? suffix.trim() : "";
  const computedName = formatPersonName({
    firstName: normalizedFirstName,
    middleName: normalizedMiddleName,
    lastName: normalizedLastName,
    suffix: normalizedSuffix,
    fallbackName: `${normalizedFirstName} ${normalizedLastName}`,
  });

  const user = await prisma.user.create({
    data: {
      name: computedName,
      firstName: normalizedFirstName,
      middleName: normalizedMiddleName || null,
      lastName: normalizedLastName,
      suffix: normalizedSuffix || null,
      email: normalizedEmail,
      passwordHash,
      role: "APPLICANT", // always APPLICANT — never configurable via public registration
      isActive: true,
    },
    select: {
      userId: true,
      email: true,
      name: true,
      // role and createdAt intentionally omitted: not needed client-side
      // and would expose information useful for account enumeration.
    },
  });

  return NextResponse.json(
    { success: true, user: { id: user.userId, email: user.email, name: user.name } },
    { status: 201 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { issueSuperAdminLoginOtp, verifySuperAdminLoginOtp } from "@/lib/superadmin-login-otp";

/**
 * Blackbox-only helper: verify Super Admin password, issue + pre-verify a login OTP
 * so Auth.js authorize()/consumeSuperAdminLoginOtp can succeed.
 * Disabled unless E2E_BLACKBOX=1.
 */
export async function POST(request: NextRequest) {
  if (process.env.E2E_BLACKBOX !== "1") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user || !user.isActive || user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "not_super_admin" }, { status: 404 });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: "invalid_password" }, { status: 401 });
    }

    const issued = await issueSuperAdminLoginOtp(email);
    if (!issued.otp) {
      return NextResponse.json({ error: "otp_not_issued", cooldown: issued.cooldown }, { status: 500 });
    }

    const verified = await verifySuperAdminLoginOtp(email, issued.otp);
    if (verified.valid === false) {
      return NextResponse.json({ error: verified.error ?? "otp_verify_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, email, otp: issued.otp });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

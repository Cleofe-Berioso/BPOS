import { NextRequest, NextResponse } from "next/server";
import { generateOtp, hashOtp } from "@/lib/password-reset";
import { sendEmail, generateRegistrationOtpEmailHtml, isEmailConfigured } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  rateLimitResponse,
  OTP_REQUEST_IP_RATE_LIMIT,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-client-ip";
import { captureE2eOtp } from "@/lib/e2e-otp-capture";

export async function POST(request: NextRequest) {
  const ipLimit = checkRateLimit(
    `reg-otp-request:ip:${getClientIp(request)}`,
    OTP_REQUEST_IP_RATE_LIMIT
  );
  if (!ipLimit.ok) {
    return rateLimitResponse(ipLimit.resetAt);
  }

  try {
    const body = await request.json();
    const email = body.email?.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address format." },
        { status: 400 }
      );
    }

    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email delivery is not configured on the server. Set RESEND_API_KEY (recommended on Render) or contact BPLO support.",
        },
        { status: 503 }
      );
    }

    // Check if email is already registered
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Unable to create account. If you already have an account, try signing in." },
        { status: 409 }
      );
    }

    const otpExpirationMinutes = parseInt(
      process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES || "10"
    );

    // ── 60-second cooldown ────────────────────────────────────────────────────
    // Prevent inbox flooding: skip if a non-expired OTP was issued within
    // the last 60 seconds for this email.
    const recentOtp = await prisma.passwordResetOtp.findFirst({
      where: {
        email,
        usedAt: null,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!recentOtp) {
      // Invalidate previous unused OTPs for this email
      await prisma.passwordResetOtp.updateMany({
        where: { email, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Generate and store new OTP
      const plainOtp = generateOtp();
      const otpHash = await hashOtp(plainOtp);
      const expiresAt = new Date(Date.now() + otpExpirationMinutes * 60 * 1000);

      await prisma.passwordResetOtp.create({
        data: { email, otpHash, expiresAt },
      });

      // Capture before mail so blackbox can proceed without SMTP/Resend.
      captureE2eOtp("register", email, plainOtp);

      try {
        const emailHtml = generateRegistrationOtpEmailHtml(plainOtp, otpExpirationMinutes);
        await sendEmail({
          to: email,
          subject: "Business Permit Online System — Email Verification OTP",
          html: emailHtml,
        });
      } catch (error) {
        if (process.env.E2E_BLACKBOX !== "1") {
          throw error;
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`[register] OTP sent to: ${email}`);
      }
    }

    return NextResponse.json(
      { message: "A verification OTP has been sent to your email. Please check your inbox and spam folder." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending registration OTP:", error);
    const message =
      error instanceof Error && error.message.includes("SMTP is blocked")
        ? error.message
        : error instanceof Error && error.message.includes("Resend")
          ? "Email delivery failed. Verify RESEND_API_KEY and RESEND_FROM in server settings."
          : "Failed to send OTP. Please try again later.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

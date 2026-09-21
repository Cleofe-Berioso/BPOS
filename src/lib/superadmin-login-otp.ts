import { generateOtp, hashOtp, verifyOtp } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { generateSuperAdminLoginOtpEmailHtml, sendEmail } from "@/lib/mail";
import { captureE2eOtp } from "@/lib/e2e-otp-capture";

/** Namespace PasswordResetOtp.email so login OTPs never collide with reset/register OTPs. */
export function superAdminLoginOtpEmailKey(email: string): string {
  return `sa-login:${email.trim().toLowerCase()}`;
}

function otpExpirationMinutes(): number {
  return Number.parseInt(process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES || "10", 10);
}

/**
 * Issue a login OTP for a verified Super Admin email/password challenge.
 * Returns whether a new email was sent (false on cooldown).
 */
export async function issueSuperAdminLoginOtp(
  email: string
): Promise<{ sent: boolean; cooldown: boolean; otp?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const storageEmail = superAdminLoginOtpEmailKey(normalizedEmail);
  const expiresMinutes = otpExpirationMinutes();

  const recentOtp = await prisma.passwordResetOtp.findFirst({
    where: {
      email: storageEmail,
      usedAt: null,
      createdAt: { gte: new Date(Date.now() - 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });

  // Blackbox needs a fresh plaintext OTP every login attempt.
  if (recentOtp && process.env.E2E_BLACKBOX !== "1") {
    return { sent: false, cooldown: true };
  }

  await prisma.passwordResetOtp.updateMany({
    where: {
      email: storageEmail,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  const plainOtp = generateOtp();
  const otpHash = await hashOtp(plainOtp);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  await prisma.passwordResetOtp.create({
    data: {
      email: storageEmail,
      otpHash,
      expiresAt,
    },
  });

  // Capture before mail so Playwright can proceed even if SMTP/Resend is unavailable.
  captureE2eOtp("sa-login", normalizedEmail, plainOtp);

  try {
    const emailHtml = generateSuperAdminLoginOtpEmailHtml(plainOtp, expiresMinutes);
    await sendEmail({
      to: normalizedEmail,
      subject: "Business Permit Online System — IT Administrator Login OTP",
      html: emailHtml,
      text: `Your IT Administrator login OTP is ${plainOtp}. It expires in ${expiresMinutes} minutes.`,
    });
  } catch (error) {
    if (process.env.E2E_BLACKBOX === "1") {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[superadmin-login] E2E_BLACKBOX: skipping email send failure", error);
      }
    } else {
      throw error;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[superadmin-login] OTP sent to: ${normalizedEmail}`);
  }

  return {
    sent: true,
    cooldown: false,
    ...(process.env.E2E_BLACKBOX === "1" ? { otp: plainOtp } : {}),
  };
}

/**
 * Verify Super Admin login OTP without consuming it (authorize will consume).
 * Used by the UI step before calling signIn.
 */
export async function verifySuperAdminLoginOtp(
  email: string,
  plainOtp: string
): Promise<{ valid: true } | { valid: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const storageEmail = superAdminLoginOtpEmailKey(normalizedEmail);
  const maxAttempts = Number.parseInt(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS || "5", 10);

  if (!/^\d{6}$/.test(plainOtp)) {
    return { valid: false, error: "OTP must be 6 digits." };
  }

  try {
    const otpRecord = await prisma.passwordResetOtp.findFirst({
      where: {
        email: storageEmail,
        usedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return { valid: false, error: "OTP not found or already used. Please sign in again." };
    }

    if (new Date() > otpRecord.expiresAt) {
      return { valid: false, error: "OTP has expired. Please sign in again to request a new code." };
    }

    if (otpRecord.attempts >= maxAttempts) {
      await prisma.passwordResetOtp.update({
        where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
        data: { usedAt: new Date() },
      });
      return { valid: false, error: "Too many failed attempts. Please sign in again to request a new code." };
    }

    const otpMatch = await verifyOtp(plainOtp, otpRecord.otpHash);
    if (!otpMatch) {
      await prisma.passwordResetOtp.update({
        where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
        data: { attempts: otpRecord.attempts + 1 },
      });
      return { valid: false, error: "Invalid OTP." };
    }

    await prisma.passwordResetOtp.update({
      where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
      data: { verifiedAt: new Date() },
    });

    return { valid: true };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error verifying Super Admin login OTP:", error);
    }
    return { valid: false, error: "Failed to verify OTP. Please try again later." };
  }
}

/**
 * Consume a verified Super Admin login OTP during authorize().
 * Requires a matching unused OTP that was verified within the last 15 minutes.
 */
export async function consumeSuperAdminLoginOtp(
  email: string,
  plainOtp: string
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const storageEmail = superAdminLoginOtpEmailKey(normalizedEmail);
  const verifiedWindowMs = 15 * 60 * 1000;

  const otpRecord = await prisma.passwordResetOtp.findFirst({
    where: {
      email: storageEmail,
      usedAt: null,
      verifiedAt: { not: null, gte: new Date(Date.now() - verifiedWindowMs) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) return false;
  if (new Date() > otpRecord.expiresAt) return false;

  const otpMatch = await verifyOtp(plainOtp, otpRecord.otpHash);
  if (!otpMatch) return false;

  await prisma.passwordResetOtp.update({
    where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
    data: { usedAt: new Date() },
  });

  return true;
}

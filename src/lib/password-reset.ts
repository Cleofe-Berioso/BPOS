import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { captureE2eOtp } from "@/lib/e2e-otp-capture";

/**
 * Generate a 6-digit random OTP
 */
export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash OTP using bcrypt
 */
export async function hashOtp(otp: string): Promise<string> {
  // Cost factor 12 — consistent with password hashing in the auth flow.
  return bcrypt.hash(otp, 12);
}

/**
 * Compare plain OTP with hashed OTP
 */
export async function verifyOtp(plainOtp: string, hashedOtp: string): Promise<boolean> {
  return bcrypt.compare(plainOtp, hashedOtp);
}

/**
 * Request password reset OTP for an email
 * - Invalidates previous unused OTPs for the same email
 * - Creates and stores a new OTP
 * - Does NOT reveal whether email exists
 */
export async function requestPasswordResetOtp(email: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const otpExpirationMinutes = parseInt(process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES || "10");

  // Generate OTP
  const plainOtp = generateOtp();
  const otpHash = await hashOtp(plainOtp);

  // Calculate expiration time
  const expiresAt = new Date(Date.now() + otpExpirationMinutes * 60 * 1000);

  try {
    // ── 60-second cooldown ──────────────────────────────────────────────────
    // Prevent inbox flooding: if a non-expired OTP was issued within the last
    // 60 seconds, silently skip creation so the caller can return the generic
    // success response without sending another email.
    const recentOtp = await prisma.passwordResetOtp.findFirst({
      where: {
        email: normalizedEmail,
        usedAt: null,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentOtp) {
      // Return empty string — caller must treat this as "cooldown active".
      return "";
    }

    // Invalidate previous unused OTPs for this email
    await prisma.passwordResetOtp.updateMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Create new OTP
    await prisma.passwordResetOtp.create({
      data: {
        email: normalizedEmail,
        otpHash,
        expiresAt,
      },
    });

    // Avoid logging PII (email) in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[password-reset] OTP generated for: ${normalizedEmail}`);
    }
    captureE2eOtp("password-reset", normalizedEmail, plainOtp);
    return plainOtp;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error creating password reset OTP:", error);
    }
    throw new Error("Failed to generate OTP. Please try again later.");
  }
}

/**
 * Verify password reset OTP
 * - Checks if OTP is valid and not expired
 * - Checks attempt limit
 * - Marks OTP as verified when valid
 */
export async function verifyPasswordResetOtp(
  email: string,
  plainOtp: string
): Promise<{ valid: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const maxAttempts = 5;

  try {
    // Find the latest OTP for this email
    const otpRecord = await prisma.passwordResetOtp.findFirst({
      where: {
        email: normalizedEmail,
        usedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Check if OTP record exists
    if (!otpRecord) {
      return { valid: false, error: "OTP not found or already used" };
    }

    // Check if OTP is expired
    if (new Date() > otpRecord.expiresAt) {
      return { valid: false, error: "OTP has expired" };
    }

    // Check attempt limit
    if (otpRecord.attempts >= maxAttempts) {
      // Mark as used to prevent further attempts
      await prisma.passwordResetOtp.update({
        where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
        data: { usedAt: new Date() },
      });
      return { valid: false, error: "Too many failed attempts. Please request a new OTP." };
    }

    // Verify OTP
    const otpMatch = await verifyOtp(plainOtp, otpRecord.otpHash);

    if (!otpMatch) {
      // Increment attempt counter
      await prisma.passwordResetOtp.update({
        where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
        data: { attempts: otpRecord.attempts + 1 },
      });
      return { valid: false, error: "Invalid OTP" };
    }

    // Mark OTP as verified
    await prisma.passwordResetOtp.update({
      where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
      data: { verifiedAt: new Date() },
    });

    // Avoid logging PII (email) in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[password-reset] OTP verified for: ${normalizedEmail}`);
    }
    return { valid: true };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error verifying password reset OTP:", error);
    }
    return { valid: false, error: "Failed to verify OTP. Please try again later." };
  }
}

/**
 * Reset password after OTP verification
 * - Checks if OTP was verified and not used
 * - Updates user password hash
 * - Marks OTP as used
 */
export async function resetUserPassword(
  email: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // ── 15-minute recency gate ──────────────────────────────────────────────
    // The OTP must have been verified in the last 15 minutes.
    // Without this, a previously-verified-but-unused OTP could remain
    // exploitable indefinitely, allowing a stale session to reset the password.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const otpRecord = await prisma.passwordResetOtp.findFirst({
      where: {
        email: normalizedEmail,
        verifiedAt: { not: null, gte: fifteenMinutesAgo },
        usedAt: null,
      },
      orderBy: {
        verifiedAt: "desc",
      },
    });

    // Check if a recently-verified OTP exists
    if (!otpRecord) {
      return { success: false, error: "OTP session expired or not found. Please request a new OTP and try again." };
    }

    // Check if OTP is still within its absolute expiry window
    if (new Date() > otpRecord.expiresAt) {
      return { success: false, error: "OTP has expired" };
    }


    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return {
        success: false,
        error: "Unable to reset password. Please request a new OTP and try again.",
      };
    }

    // Hash new password — cost 12 consistent with registration flow.
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update user password
    await prisma.user.update({
      where: { userId: user.userId },
      data: { passwordHash: newPasswordHash },
    });

    // Mark OTP as used
    await prisma.passwordResetOtp.update({
      where: { passwordResetOtpId: otpRecord.passwordResetOtpId },
      data: { usedAt: new Date() },
    });

    // Avoid logging PII (email) in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[password-reset] password reset completed for: ${normalizedEmail}`);
    }
    return { success: true };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error resetting password:", error);
    }
    return { success: false, error: "Failed to reset password. Please try again later." };
  }
}

/**
 * Cleanup expired OTPs (can be run periodically)
 */
export async function cleanupExpiredOtps(): Promise<number> {
  try {
    const result = await prisma.passwordResetOtp.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        usedAt: null,
      },
    });

    console.log(`Cleaned up ${result.count} expired OTPs`);
    return result.count;
  } catch (error) {
    console.error("Error cleaning up expired OTPs:", error);
    return 0;
  }
}

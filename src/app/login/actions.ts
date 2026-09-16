"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import {
  issueSuperAdminLoginOtp,
  verifySuperAdminLoginOtp,
} from "@/lib/superadmin-login-otp";

export type LoginState = {
  error?: string;
  requiresOtp?: boolean;
  email?: string;
  rememberMe?: boolean;
  otpMessage?: string;
} | null;

function parseRememberMe(formData: FormData): boolean {
  const rememberMeRaw = formData.get("rememberMe");
  return (
    rememberMeRaw === "on" ||
    rememberMeRaw === "true" ||
    rememberMeRaw === "1"
  );
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const otp = String(formData.get("otp") ?? "").trim();
    const rememberMe = parseRememberMe(formData);

    if (!email || !password) {
      return { error: "Invalid email or password." };
    }

    const normalizedEmail = email.toLowerCase();

    let existing;
    try {
      existing = await getUserByEmail(normalizedEmail);
    } catch (error) {
      if (process.env.E2E_BLACKBOX === "1" || process.env.NODE_ENV !== "production") {
        console.error("[loginAction] getUserByEmail failed", error);
      }
      existing = null;
    }

    if (existing && !existing.isActive) {
      const passwordMatch = await bcrypt.compare(password, existing.passwordHash);
      if (passwordMatch) {
        return {
          error:
            "Your account has been disabled. Please contact the system administrator.",
        };
      }
    }

    // Super Admin: password check first, then OTP challenge (every login).
    if (existing?.role === "SUPER_ADMIN" && existing.isActive) {
      const passwordMatch = await bcrypt.compare(password, existing.passwordHash);
      if (!passwordMatch) {
        return { error: "Invalid email or password." };
      }

      // Completing OTP step → verify then signIn with otp for authorize gate.
      if (otp) {
        const verified = await verifySuperAdminLoginOtp(normalizedEmail, otp);
        if (verified.valid === false) {
          return {
            requiresOtp: true,
            email: normalizedEmail,
            rememberMe,
            error: verified.error,
          };
        }

        await signIn("credentials", {
          email: normalizedEmail,
          password,
          otp,
          rememberMe: rememberMe ? "true" : "false",
          redirectTo: "/auth/redirect",
        });
        return null;
      }

      try {
        const issued = await issueSuperAdminLoginOtp(normalizedEmail);
        return {
          requiresOtp: true,
          email: normalizedEmail,
          rememberMe,
          otpMessage: issued.cooldown
            ? "A login OTP was already sent recently. Please check your email (including spam)."
            : "A login OTP was sent to your email. Enter the 6-digit code to continue.",
        };
      } catch {
        return {
          error: "Unable to send login OTP right now. Please try again.",
        };
      }
    }

    await signIn("credentials", {
      email,
      password,
      rememberMe: rememberMe ? "true" : "false",
      redirectTo: "/auth/redirect",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Invalid email or password." };
      }

      return { error: "Unable to sign in right now. Please try again." };
    }
    // Re-throw NEXT_REDIRECT — Next.js uses this for successful navigation
    throw error;
  }
  return null;
}

export async function resendSuperAdminLoginOtpAction(
  email: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, error: "Email is required." };
  }

  try {
    const user = await getUserByEmail(normalizedEmail);
    if (!user || !user.isActive || user.role !== "SUPER_ADMIN") {
      // Do not reveal account details.
      return {
        ok: true,
        message: "If eligible, a new login OTP has been sent.",
      };
    }

    const issued = await issueSuperAdminLoginOtp(normalizedEmail);
    return {
      ok: true,
      message: issued.cooldown
        ? "A login OTP was already sent recently. Please check your email (including spam)."
        : "A new login OTP was sent to your email.",
    };
  } catch {
    return { ok: false, error: "Unable to resend OTP right now. Please try again." };
  }
}

export async function googleSignInAction(): Promise<void> {
  await signIn("google", {
    redirectTo: "/auth/redirect",
  });
}

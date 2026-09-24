"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Mail, Lock, KeyRound, CheckCircle, Loader, Eye, EyeOff } from "lucide-react";

type Step = "email" | "otp" | "password" | "success";

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send OTP");
        return;
      }

      setSuccessMessage(data.message);
      setStep("otp");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to verify OTP");
        return;
      }

      setStep("password");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword, confirmPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reset password");
        return;
      }

      setStep("success");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = () => {
    setError("");
    setOtp("");
    setStep("email");
  };

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="bg-[var(--primary)] px-8 py-8 text-center text-white">
          <div className="mb-4 flex justify-center">
            <Image
              src="/images/logo.png"
              alt="Municipality of Enrique B. Magalona Logo"
              width={64}
              height={64}
              className="h-16 w-16 object-contain drop-shadow"
            />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-soft)]">Municipality of Enrique B. Magalona</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Reset Password</h1>
          <p className="mt-2 text-sm text-[var(--primary-soft)]">Secure password recovery with OTP verification</p>
        </div>

        <div className="p-8">
          {/* Success State */}
          {step === "success" ? (
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="rounded-full bg-[var(--success-soft)] p-4">
                  <CheckCircle className="h-8 w-8 text-[var(--success)]" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Password Reset Successful!</h2>
              <p className="text-sm text-slate-600 mb-6">
                Your password has been changed successfully. You can now sign in with your new password.
              </p>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--primary)] bg-[var(--primary)] px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)]"
              >
                Back to Sign In
              </Link>
            </div>
          ) : null}

          {/* Step 1: Email */}
          {step === "email" ? (
            <>
              <form onSubmit={handleRequestOtp} className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">Enter Your Email</h3>
                  <p className="text-sm text-slate-600">We&apos;ll send you a one-time password (OTP) to verify your identity.</p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                {successMessage && step === "email" && (
                  <output className="block rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {successMessage}
                  </output>
                )}

                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                    Account Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]"
                      placeholder="your.email@example.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--primary)] px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send OTP"
                  )}
                </button>

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </Link>
              </form>
            </>
          ) : null}

          {/* Step 2: OTP Verification */}
          {step === "otp" ? (
            <>
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">Enter Your OTP</h3>
                  <p className="text-sm text-slate-600">
                    We&apos;ve sent a 6-digit code to <span className="font-semibold">{email}</span>
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="otp" className="mb-2 block text-sm font-semibold text-slate-700">
                    6-Digit OTP Code
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-center text-2xl font-bold tracking-widest text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]"
                      placeholder="000000"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--primary)] px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    "Verify OTP"
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="w-full py-2 text-sm font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]"
                >
                  Didn&apos;t receive the code? Request a new one
                </button>

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-semibold"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </Link>
              </form>
            </>
          ) : null}

          {/* Step 3: Password Reset */}
          {step === "password" ? (
            <>
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">Set New Password</h3>
                  <p className="text-sm text-slate-600">Enter your new password below. Make it strong and secure.</p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-slate-700">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-10 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]"
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Minimum 8 characters</p>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-700">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-10 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]"
                      placeholder="Confirm your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--primary)] px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Resetting…
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-semibold"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </Link>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

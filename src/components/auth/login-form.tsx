"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ClipboardEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Headphones, Lock, LogIn, Mail, ShieldCheck } from "lucide-react";
import {
  googleSignInAction,
  loginAction,
  resendSuperAdminLoginOtpAction,
} from "@/app/login/actions";

export function LoginForm({
  initialEmail = "",
  disabledAccountNotice = false,
  sessionExpiredNotice = false,
}: {
  initialEmail?: string;
  disabledAccountNotice?: boolean;
  sessionExpiredNotice?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState<{
    email: string;
    password: string;
    rememberMe: boolean;
  } | null>(null);
  const pendingCredentialsRef = useRef<{
    email: string;
    password: string;
    rememberMe: boolean;
  } | null>(null);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, startResendTransition] = useTransition();

  useEffect(() => {
    if (state?.requiresOtp && state.email && pendingCredentialsRef.current) {
      setOtpChallenge({
        email: state.email,
        password: pendingCredentialsRef.current.password,
        rememberMe: state.rememberMe ?? pendingCredentialsRef.current.rememberMe,
      });
      // Fresh OTP challenge (or resend via loginAction) resets the inputs.
      if (!state.error) {
        setOtpDigits(["", "", "", "", "", ""]);
        setResendCountdown(60);
        setResendMessage(state.otpMessage ?? null);
        setResendError(null);
      }
    }
  }, [state]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = window.setTimeout(() => setResendCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCountdown]);

  const otpValue = otpDigits.join("");
  const showOtpStep = Boolean(otpChallenge?.email);

  function handlePasswordStepSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const rememberMe =
      formData.get("rememberMe") === "on" ||
      formData.get("rememberMe") === "true" ||
      formData.get("rememberMe") === "1";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    pendingCredentialsRef.current = { email, password, rememberMe };
    formAction(formData);
  }

  function updateOtpDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) {
      document.getElementById(`login-otp-digit-${index + 1}`)?.focus();
    }
  }

  function handleOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      document.getElementById(`login-otp-digit-${index - 1}`)?.focus();
    }
  }

  function handleOtpPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i]!;
    setOtpDigits(next);
    const focusIndex = Math.min(pasted.length, 5);
    document.getElementById(`login-otp-digit-${focusIndex}`)?.focus();
  }

  function handleResendOtp() {
    if (!otpChallenge?.email || resendCountdown > 0) return;
    startResendTransition(async () => {
      setResendError(null);
      const result = await resendSuperAdminLoginOtpAction(otpChallenge.email);
      if (result.ok === false) {
        setResendError(result.error);
        return;
      }
      setResendMessage(result.message);
      setResendCountdown(60);
    });
  }

  return (
    <div className="flex min-h-dvh">
      {/* Left panel — building photo with light forest overlay */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[44%] xl:w-[42%]">
        <Image
          src="/images/login-bg.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1280px) 42vw, 44vw"
          className="object-cover object-center"
          aria-hidden="true"
        />

        <div aria-hidden="true" className="login-hero-overlay absolute inset-0" />
        <div aria-hidden="true" className="login-hero-vignette pointer-events-none absolute inset-0" />

        <div className="relative z-10 flex min-h-dvh w-full flex-col p-10 xl:p-12">
          <div className="animate-fade-slide-up" style={{ animationDelay: "0ms" }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e8c078]">
              Republic of the Philippines
            </p>
            <p className="mt-1 text-sm font-medium text-white/90">Province of Negros Occidental</p>
          </div>

          <div className="flex flex-1 flex-col justify-center py-10">
            <div className="max-w-md space-y-4 animate-fade-slide-up" style={{ animationDelay: "80ms" }}>
              <div className="h-px w-12 bg-[#c4852a]/60" aria-hidden="true" />
              <h1
                className="font-semibold leading-[1.15] tracking-tight text-white"
                style={{ fontSize: "clamp(1.75rem, 2.4vw, 2.5rem)" }}
              >
                Business Permit Online System
              </h1>
              <p className="max-w-[320px] text-[0.9375rem] leading-relaxed text-white/82">
                Municipality of Enrique B. Magalona — Business Permits and Licensing Office
              </p>
            </div>
          </div>

          <div
            className="flex max-w-sm items-start gap-3 rounded-xl border border-white/12 bg-[#0b1d11]/35 px-4 py-3.5 backdrop-blur-[2px] animate-fade-slide-up"
            style={{ animationDelay: "160ms" }}
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#dfa030]" aria-hidden="true" />
            <p className="text-[10px] leading-relaxed text-white/78">
              © 2026 Municipality of Enrique B. Magalona
              <br />
              Business Permits &amp; Licensing Office (BPLO)
              <br />
              All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — sign-in card */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#f0ebe0] px-5 py-8 sm:px-8">
        <div className="mb-6 w-full max-w-md text-center animate-fade-slide-up lg:hidden">
          <div className="relative mx-auto mb-4 h-20 w-full overflow-hidden rounded-xl border border-[var(--border-color)]">
            <Image
              src="/images/login-bg.png"
              alt=""
              fill
              className="object-cover object-center"
              aria-hidden="true"
            />
            <div className="login-hero-overlay absolute inset-0" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Republic of the Philippines
          </p>
          <h1 className="mt-2 text-xl font-semibold text-[var(--foreground)]">Business Permit Online System</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Municipality of Enrique B. Magalona</p>
        </div>

        <div className="w-full max-w-[26rem] animate-fade-slide-up" style={{ animationDelay: "100ms" }}>
          <div className="login-card p-7 sm:p-8">
            <div className="mb-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                {showOtpStep ? "IT Administrator Security" : "Applicant & Staff Access"}
              </p>
              <h2 className="mt-2 text-[1.625rem] font-semibold leading-tight text-[var(--foreground)]">
                {showOtpStep ? "Verify Login OTP" : "Sign In"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                {showOtpStep
                  ? `Enter the 6-digit code sent to ${otpChallenge?.email}.`
                  : "Enter your credentials to access your account."}
              </p>
            </div>

            {showOtpStep ? (
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="email" value={otpChallenge!.email} />
                <input type="hidden" name="password" value={otpChallenge!.password} />
                <input
                  type="hidden"
                  name="rememberMe"
                  value={otpChallenge!.rememberMe ? "true" : "false"}
                />
                <input type="hidden" name="otp" value={otpValue} />

                {(state?.error || resendError) && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {state?.error || resendError}
                  </div>
                )}

                {(state?.otpMessage || resendMessage) && !state?.error && !resendError && (
                  <div
                    role="status"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                  >
                    {resendMessage || state?.otpMessage}
                  </div>
                )}

                <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      id={`login-otp-digit-${index}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={digit}
                      onChange={(event) => updateOtpDigit(index, event.target.value)}
                      onKeyDown={(event) => handleOtpKeyDown(index, event)}
                      aria-label={`OTP digit ${index + 1}`}
                      className="login-field h-12 w-10 text-center text-lg font-semibold tracking-widest sm:w-11"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isPending || otpValue.length !== 6 || !otpChallenge?.password}
                  className="login-action inline-flex w-full items-center justify-center gap-2 bg-[var(--primary)] px-4 text-white transition-colors hover:bg-[var(--primary-strong)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ boxShadow: "0 2px 8px rgba(12,92,56,0.16)" }}
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {isPending ? "Verifying…" : "Verify & Sign In"}
                </button>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpChallenge(null);
                      pendingCredentialsRef.current = null;
                      setOtpDigits(["", "", "", "", "", ""]);
                      setResendMessage(null);
                      setResendError(null);
                    }}
                    className="text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--foreground)]"
                  >
                    Back to sign in
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isResending || resendCountdown > 0}
                    className="text-sm font-medium text-[var(--primary)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
                  >
                    {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : isResending ? "Sending…" : "Resend OTP"}
                  </button>
                </div>
              </form>
            ) : (
              <form action={handlePasswordStepSubmit} className="space-y-4">
                {disabledAccountNotice && (
                  <div
                    role="alert"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                  >
                    Your account has been disabled. Please contact the system administrator.
                  </div>
                )}

                {sessionExpiredNotice && (
                  <div
                    role="alert"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                  >
                    Your session is no longer valid. Please sign in again.
                  </div>
                )}

                {state?.error && !state.requiresOtp && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {state.error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-sm font-medium text-[var(--foreground)]">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
                      aria-hidden="true"
                    />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      defaultValue={initialEmail}
                      required
                      className="login-field block w-full py-2.5 pl-10 pr-4"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
                      aria-hidden="true"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      className="login-field block w-full py-2.5 pl-10 pr-11"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-[#9ca3af] transition-colors hover:text-[#6b7280] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#9ca3af] focus-visible:ring-offset-1 rounded-r-[var(--radius-control)]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      name="rememberMe"
                      value="true"
                      className="h-4 w-4 rounded"
                      style={{ accentColor: "var(--primary)" }}
                    />
                    <span className="text-sm text-[var(--ink-muted)]">Remember me</span>
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-[var(--primary)] transition-colors hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="login-action inline-flex w-full items-center justify-center gap-2 bg-[var(--primary)] px-4 text-white transition-colors hover:bg-[var(--primary-strong)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ boxShadow: "0 2px 8px rgba(12,92,56,0.16)" }}
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  {isPending ? "Signing in…" : "Sign In"}
                </button>
              </form>
            )}

            {!showOtpStep && (
              <>
                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a09585]">or</span>
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                </div>

                <form action={googleSignInAction}>
                  <button
                    type="submit"
                    className="login-action inline-flex w-full items-center justify-center gap-3 border bg-white px-4 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <Image
                      src="/google2.png"
                      alt=""
                      aria-hidden="true"
                      width={18}
                      height={18}
                      className="h-[18px] w-[18px] object-contain"
                    />
                    Continue with Google
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-[var(--ink-muted)]">
                  Don&apos;t have an account?{" "}
                  <Link href="/register" className="font-semibold text-[var(--primary)] transition-colors hover:underline">
                    Register as Applicant
                  </Link>
                </p>
              </>
            )}
          </div>

          <div
            className="mt-4 flex items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-center"
            style={{ borderColor: "var(--border-color)", backgroundColor: "rgba(255,255,255,0.8)" }}
          >
            <Headphones className="h-4 w-4 flex-shrink-0 text-[var(--primary)]" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
              Need account assistance?{" "}
              <a
                href="mailto:support@bplo.gov.ph"
                className="font-semibold text-[var(--primary)] transition-colors hover:underline"
              >
                support@bplo.gov.ph
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

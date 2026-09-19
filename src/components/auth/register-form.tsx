"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, Phone, User, ShieldCheck, RotateCcw } from "lucide-react";
import { FormField } from "@/components/ui/form-field";
import { InfoBanner } from "@/components/ui/info-banner";
import { autoCapitalizeWords } from "@/lib/text-input";
import { PASSWORD_POLICY_HINT, validatePasswordPolicy } from "@/lib/password-policy";
import { PH_MOBILE_HINT, handlePhMobileBeforeInput, handlePhMobileKeyDown, phMobileFieldError, sanitizePhMobileInput } from "@/lib/ph-mobile";

// ── Step types ────────────────────────────────────────────────────────────────
type Step =
  | "form"        // Step 1: fill registration details
  | "otp"         // Step 2: enter OTP
  | "success";    // Step 3: done

type AsyncState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

interface FormData {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  email: string;
  contactNumber: string;
  password: string;
  confirmPassword: string;
}

const inputClassName =
  "block w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]";

const inputWithToggleClassName =
  "block w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-9 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]";

// ── Shared card wrapper ───────────────────────────────────────────────────────
function CardShell({ subtitle, title, children }: { subtitle: string; title: string; children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex w-full max-w-lg max-h-[calc(100dvh-1.5rem)] flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl backdrop-blur-md">
        <div className="shrink-0 bg-[var(--primary)] px-5 py-3 text-center text-white sm:px-6 sm:py-3.5">
          <div className="mb-2 flex justify-center">
            <Image
              src="/images/logo.png"
              alt="Municipality of Enrique B. Magalona Logo"
              width={40}
              height={40}
              className="h-10 w-10 object-contain drop-shadow"
            />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-soft)]">
            Municipality of Enrique B. Magalona
          </p>
          <h1 className="mt-1 text-lg font-bold leading-tight text-white sm:text-xl">{title}</h1>
          <p className="mt-0.5 text-xs text-[var(--primary-soft)] sm:text-sm">{subtitle}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-4 py-2 sm:px-5">
          <p className="text-center text-[10px] leading-snug text-slate-500">
            © 2026 Municipality of Enrique B. Magalona - BPLO ·{" "}
            <a
              href="mailto:support@bplo.gov.ph"
              className="font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]"
            >
              support@bplo.gov.ph
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Details" },
    { n: 2, label: "Verify" },
    { n: 3, label: "Done" },
  ] as const;

  return (
    <div className="mb-3 flex items-center justify-center gap-1.5">
      {steps.map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                current === n
                  ? "bg-[var(--primary)] text-white"
                  : current > n
                  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {current > n ? "✓" : n}
            </div>
            <span className={`text-[9px] font-medium ${current === n ? "text-[var(--primary)]" : "text-slate-400"}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mb-3 h-0.5 w-8 rounded-full transition-colors ${
                current > n ? "bg-[var(--primary)]" : "bg-slate-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function RegisterForm() {
  const [step, setStep] = useState<Step>("form");
  const [formState, setFormState] = useState<AsyncState>({ status: "idle" });
  const [otpState, setOtpState] = useState<AsyncState>({ status: "idle" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [canResend, setCanResend] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Saved form data carried across steps
  const [savedData, setSavedData] = useState<FormData | null>(null);

  // ── Start resend countdown ─────────────────────────────────────────────────
  function startCountdown() {
    setCanResend(false);
    setResendCountdown(60);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // ── OTP digit refs for auto-focus ─────────────────────────────────────────
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setOtp(next);
    digitRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  const otpValue = otp.join("");

  async function postJsonWithTimeout(
    url: string,
    body: unknown,
    timeoutMs = 25_000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Step 1: send OTP then move to step 2 ──────────────────────────────────
  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormState({ status: "loading" });

    const form = e.currentTarget;
    const data: FormData = {
      firstName: (form.elements.namedItem("firstName") as HTMLInputElement).value,
      middleName: (form.elements.namedItem("middleName") as HTMLInputElement).value,
      lastName: (form.elements.namedItem("lastName") as HTMLInputElement).value,
      suffix: (form.elements.namedItem("suffix") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      contactNumber: (form.elements.namedItem("contactNumber") as HTMLInputElement).value,
      password: (form.elements.namedItem("password") as HTMLInputElement).value,
      confirmPassword: (form.elements.namedItem("confirmPassword") as HTMLInputElement).value,
    };

    // Client-side password checks before sending
    const contactError = phMobileFieldError(data.contactNumber);
    if (contactError) {
      setFormState({ status: "error", message: contactError });
      return;
    }

    const passwordPolicyError = validatePasswordPolicy(data.password);
    if (passwordPolicyError) {
      setFormState({ status: "error", message: passwordPolicyError });
      return;
    }

    if (data.password !== data.confirmPassword) {
      setFormState({ status: "error", message: "Passwords do not match." });
      return;
    }

    try {
      const res = await postJsonWithTimeout("/api/auth/register/send-otp", {
        email: data.email,
      });

      const json = await res.json();

      if (!res.ok) {
        setFormState({ status: "error", message: json.error ?? "Failed to send OTP. Please try again." });
        return;
      }

      // OTP sent — save form data and proceed to OTP step
      setSavedData(data);
      setOtp(["", "", "", "", "", ""]);
      setOtpState({ status: "idle" });
      setFormState({ status: "idle" });
      startCountdown();
      setStep("otp");
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      setFormState({
        status: "error",
        message: timedOut
          ? "The request timed out. The server may be waking up — wait a moment and try again."
          : "A network error occurred. Please try again.",
      });
    }
  }

  // ── Step 2a: verify OTP, then create account ───────────────────────────────
  async function handleOtpSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (otpValue.length !== 6) {
      setOtpState({ status: "error", message: "Please enter all 6 digits of your OTP." });
      return;
    }

    setOtpState({ status: "loading" });

    if (!savedData) {
      setOtpState({ status: "error", message: "Registration details were lost. Please restart the form." });
      setStep("form");
      return;
    }

    const email = savedData.email;

    try {
      // 1. Verify OTP
      const verifyRes = await fetch("/api/auth/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpValue }),
      });

      const verifyJson = await verifyRes.json();

      if (!verifyRes.ok) {
        setOtpState({ status: "error", message: verifyJson.error ?? "OTP verification failed." });
        return;
      }

      // 2. Create account (OTP is now verified server-side)
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savedData),
      });

      const registerJson = await registerRes.json();

      if (!registerRes.ok) {
        setOtpState({ status: "error", message: registerJson.error ?? "Registration failed. Please try again." });
        return;
      }

      setOtpState({ status: "idle" });
      setStep("success");
    } catch {
      setOtpState({ status: "error", message: "A network error occurred. Please try again." });
    }
  }

  // ── Step 2b: resend OTP ────────────────────────────────────────────────────
  async function handleResend() {
    if (!canResend) return;
    if (!savedData) {
      setOtpState({ status: "error", message: "Registration details were lost. Please restart the form." });
      setStep("form");
      return;
    }

    setOtpState({ status: "loading" });

    try {
      const res = await postJsonWithTimeout("/api/auth/register/send-otp", {
        email: savedData.email,
      });

      const json = await res.json();

      if (!res.ok) {
        setOtpState({ status: "error", message: json.error ?? "Failed to resend OTP." });
        return;
      }

      setOtp(["", "", "", "", "", ""]);
      setOtpState({ status: "idle" });
      startCountdown();
      digitRefs.current[0]?.focus();
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      setOtpState({
        status: "error",
        message: timedOut
          ? "The request timed out. Wait a moment and try resending."
          : "A network error occurred. Please try again.",
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — Step 3: Success
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "success") {
    return (
      <CardShell title="Registration Successful" subtitle="Your applicant account is ready for sign in.">
        <div className="p-5 sm:p-6">
          <InfoBanner
            title="Your account is ready"
            description="Your applicant account has been created. You can now sign in."
            variant="success"
          />
          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--primary)] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)]"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </CardShell>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — Step 2: OTP Entry
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "otp") {
    const isLoading = otpState.status === "loading";

    return (
      <CardShell title="Verify Your Email" subtitle="Enter the 6-digit OTP sent to your email.">
        <div className="p-5 sm:p-6">
          <StepIndicator current={2} />

          {otpState.status === "error" && (
            <InfoBanner title="Verification issue" description={otpState.message} variant="danger" />
          )}

          <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:text-sm">
            <ShieldCheck className="mb-0.5 inline-block h-4 w-4 text-[var(--primary)]" />{" "}
            We sent a 6-digit OTP to{" "}
            <span className="font-semibold text-slate-800">{savedData?.email}</span>.
            Check your inbox and spam folder.
          </div>

          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div className="flex justify-center gap-1.5 sm:gap-2" onPaste={handleDigitPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { digitRefs.current[i] = el; }}
                  id={`otp-digit-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={isLoading}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                  className="h-11 w-9 rounded-lg border border-slate-200 bg-slate-50 text-center text-xl font-bold text-slate-900 outline-none transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50 sm:h-12 sm:w-10 sm:text-2xl"
                  aria-label={`OTP digit ${i + 1}`}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={isLoading || otpValue.length !== 6}
              className="w-full rounded-xl border border-[var(--primary)] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)] disabled:opacity-60"
            >
              {isLoading ? "Verifying…" : "Verify & Create Account"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-slate-600 sm:text-sm">
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading}
                className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Resend OTP
              </button>
            ) : (
              <span className="text-slate-400">
                Resend OTP in <span className="font-semibold text-slate-600">{resendCountdown}s</span>
              </span>
            )}
          </div>

          <div className="mt-2 text-center text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => { setStep("form"); setFormState({ status: "idle" }); }}
              className="text-slate-500 hover:text-[var(--primary)]"
            >
              ← Back to registration form
            </button>
          </div>
        </div>
      </CardShell>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — Step 1: Registration Form
  // ══════════════════════════════════════════════════════════════════════════
  const isLoading = formState.status === "loading";

  return (
    <CardShell title="Create Account" subtitle="Register as an applicant to start filing permits.">
      <div className="p-4 sm:p-5">
        <StepIndicator current={1} />

        <form onSubmit={handleFormSubmit} className="space-y-2.5" noValidate>
          {formState.status === "error" && (
            <InfoBanner title="Registration issue" description={formState.message} variant="danger" />
          )}

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <FormField label="First Name" htmlFor="firstName" required>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  aria-label="First Name"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  required
                  defaultValue={savedData?.firstName ?? ""}
                  onInput={(event) => {
                    const target = event.currentTarget;
                    const next = autoCapitalizeWords(target.value);
                    if (next !== target.value) target.value = next;
                  }}
                  className={inputClassName}
                  placeholder="Juan"
                />
              </div>
            </FormField>

            <FormField label="Middle Name" htmlFor="middleName">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="middleName"
                  name="middleName"
                  type="text"
                  aria-label="Middle Name"
                  autoComplete="additional-name"
                  autoCapitalize="words"
                  defaultValue={savedData?.middleName ?? ""}
                  onInput={(event) => {
                    const target = event.currentTarget;
                    const next = autoCapitalizeWords(target.value);
                    if (next !== target.value) target.value = next;
                  }}
                  className={inputClassName}
                  placeholder="Optional"
                />
              </div>
            </FormField>

            <FormField label="Last Name" htmlFor="lastName" required>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  aria-label="Last Name"
                  autoComplete="family-name"
                  autoCapitalize="words"
                  required
                  defaultValue={savedData?.lastName ?? ""}
                  onInput={(event) => {
                    const target = event.currentTarget;
                    const next = autoCapitalizeWords(target.value);
                    if (next !== target.value) target.value = next;
                  }}
                  className={inputClassName}
                  placeholder="Dela Cruz"
                />
              </div>
            </FormField>

            <FormField label="Suffix" htmlFor="suffix">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="suffix"
                  name="suffix"
                  type="text"
                  aria-label="Suffix"
                  autoComplete="honorific-suffix"
                  autoCapitalize="words"
                  defaultValue={savedData?.suffix ?? ""}
                  onInput={(event) => {
                    const target = event.currentTarget;
                    const next = autoCapitalizeWords(target.value);
                    if (next !== target.value) target.value = next;
                  }}
                  className={inputClassName}
                  placeholder="Jr. / Sr. / III"
                />
              </div>
            </FormField>
          </div>

          <FormField label="Email Address" htmlFor="email" required>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                <Mail className="h-4 w-4 text-slate-400" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                aria-label="Email"
                autoComplete="email"
                required
                defaultValue={savedData?.email ?? ""}
                className={inputClassName}
                placeholder="your.email@example.com"
              />
            </div>
          </FormField>

          <FormField label="Contact Number" htmlFor="contactNumber" hint={PH_MOBILE_HINT} required>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                <Phone className="h-4 w-4 text-slate-400" />
              </div>
              <input
                id="contactNumber"
                name="contactNumber"
                type="tel"
                inputMode="numeric"
                aria-label="Contact Number"
                autoComplete="tel-national"
                required
                pattern="^09\d{9}$"
                maxLength={11}
                defaultValue={savedData?.contactNumber ?? ""}
                className={inputClassName}
                placeholder="09XXXXXXXXX"
                onKeyDown={(event) => handlePhMobileKeyDown(event)}
                onBeforeInput={(event) =>
                  handlePhMobileBeforeInput(event.nativeEvent as InputEvent)
                }
                onPaste={(event) => {
                  event.preventDefault();
                  event.currentTarget.value = sanitizePhMobileInput(
                    event.clipboardData.getData("text")
                  );
                }}
                onInput={(event) => {
                  const target = event.currentTarget;
                  target.value = sanitizePhMobileInput(target.value);
                }}
              />
            </div>
          </FormField>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <FormField label="Password" htmlFor="password" hint={PASSWORD_POLICY_HINT} required>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  aria-label="Password"
                  required
                  minLength={8}
                  className={inputWithToggleClassName}
                  placeholder="Password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-slate-400 transition-colors hover:text-[var(--primary)]" />
                  ) : (
                    <Eye className="h-4 w-4 text-slate-400 transition-colors hover:text-[var(--primary)]" />
                  )}
                </button>
              </div>
            </FormField>

            <FormField label="Confirm Password" htmlFor="confirmPassword" required>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  aria-label="Confirm Password"
                  required
                  minLength={8}
                  className={inputWithToggleClassName}
                  placeholder="Confirm"
                />
                <button
                  type="button"
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4 text-slate-400 transition-colors hover:text-[var(--primary)]" />
                  ) : (
                    <Eye className="h-4 w-4 text-slate-400 transition-colors hover:text-[var(--primary)]" />
                  )}
                </button>
              </div>
            </FormField>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 w-full rounded-xl border border-[var(--primary)] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)] disabled:opacity-60"
          >
            {isLoading ? "Sending OTP…" : "Send Verification OTP"}
          </button>
        </form>

        <div className="mt-3 text-center">
          <p className="text-xs text-slate-700 sm:text-sm">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-[var(--primary)] hover:text-[var(--primary-strong)]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </CardShell>
  );
}

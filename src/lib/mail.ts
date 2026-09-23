import nodemailer from "nodemailer";
import { Resend } from "resend";

const SMTP_TIMEOUT_MS = 12_000;

function normalizeGmailAppPassword(): string | undefined {
  return process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "").trim() || undefined;
}

function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

function getResendFromAddress(): string {
  const configured = process.env.RESEND_FROM?.trim();
  if (configured) return configured;

  const gmail = process.env.GMAIL_USER?.trim();
  if (gmail) return gmail;

  return "onboarding@resend.dev";
}

// Gmail SMTP — works locally; Render free tier blocks outbound SMTP ports 587/465.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: normalizeGmailAppPassword(),
  },
  connectionTimeout: SMTP_TIMEOUT_MS,
  greetingTimeout: SMTP_TIMEOUT_MS,
  socketTimeout: SMTP_TIMEOUT_MS,
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative improves deliverability (HTML-only mail is spam-prone). */
  text?: string;
}

export function isEmailConfigured(): boolean {
  if (getResendApiKey()) return true;
  return Boolean(process.env.GMAIL_USER?.trim() && normalizeGmailAppPassword());
}

export function getEmailTransportLabel(): "resend" | "gmail-smtp" | "none" {
  if (getResendApiKey()) return "resend";
  if (isEmailConfigured()) return "gmail-smtp";
  return "none";
}

function resolveFromAddress(): string {
  const address = process.env.GMAIL_USER?.trim();
  if (!address) {
    throw new Error("GMAIL_USER is not configured");
  }

  // Display name must match the authenticated mailbox to avoid From spoofing flags.
  const displayName =
    process.env.MAIL_FROM_NAME?.trim() || "Municipality of Enrique B. Magalona BPLO";
  return `"${displayName.replace(/"/g, "")}" <${address}>`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendViaResend({ to, subject, html, text }: EmailOptions): Promise<{ messageId?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const from = getResendFromAddress();
  const result = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    text: text?.trim() || htmlToPlainText(html),
    replyTo: process.env.MAIL_REPLY_TO?.trim() || process.env.GMAIL_USER?.trim() || undefined,
  });

  if (result.error) {
    console.error("Resend API error:", result.error);
    throw new Error(result.error.message || "Failed to send email via Resend.");
  }

  console.log("Email sent via Resend:", result.data?.id);
  return { messageId: result.data?.id };
}

async function sendViaGmailSmtp({ to, subject, html, text }: EmailOptions): Promise<{ messageId?: string }> {
  const info = await transporter.sendMail({
    from: resolveFromAddress(),
    to,
    subject,
    text: text?.trim() || htmlToPlainText(html),
    html,
    replyTo: process.env.MAIL_REPLY_TO?.trim() || process.env.GMAIL_USER?.trim(),
  });

  console.log("Email sent via Gmail SMTP:", info.messageId);
  return { messageId: info.messageId };
}

function isSmtpBlockedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNREFUSED" ||
    code === "ENETUNREACH" ||
    message.includes("Timeout") ||
    message.includes("timeout")
  );
}

/**
 * Send email via Resend (HTTPS, Render-safe) or Gmail SMTP (local dev).
 */
export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<{ messageId?: string }> {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY (production) or GMAIL_USER + GMAIL_APP_PASSWORD (local)."
    );
  }

  try {
    if (getResendApiKey()) {
      return await sendViaResend({ to, subject, html, text });
    }
    return await sendViaGmailSmtp({ to, subject, html, text });
  } catch (error) {
    console.error("Error sending email:", error);
    if (isSmtpBlockedError(error)) {
      throw new Error(
        "Email could not be sent: SMTP is blocked on this host (Render free tier). Set RESEND_API_KEY in environment variables."
      );
    }
    throw new Error("Failed to send email. Please try again later.");
  }
}

/**
 * Generate password reset OTP email HTML
 */
export function generatePasswordResetEmailHtml(
  otp: string,
  expirationMinutes: number
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .card {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 3px solid #0b8754;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0;
            color: #0b8754;
            font-size: 24px;
          }
          .otp-box {
            background-color: #e8f5e9;
            border: 2px solid #0b8754;
            border-radius: 6px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .otp-code {
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 4px;
            color: #0b8754;
            font-family: 'Courier New', monospace;
          }
          .info {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .warning {
            background-color: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #666;
            margin-top: 20px;
            border-top: 1px solid #ddd;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>Business Permit Online System — Password Reset</h1>
            </div>
            
            <p>Hello,</p>
            
            <p>We received a request to reset your Business Permit Online System account password. Use the OTP code below to proceed with your password reset:</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            
            <div class="info">
              <strong>⏱️ Valid for ${expirationMinutes} minutes</strong>
            </div>
            
            <p style="margin: 15px 0;">
              <strong>Important security notes:</strong>
            </p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Never share this code with anyone</li>
              <li>Business Permit Online System staff will never ask for this code</li>
              <li>After ${expirationMinutes} minutes, this code will expire</li>
              <li>If you did not request this, please ignore this email and your account remains secure</li>
            </ul>
            
            <div class="warning">
              <strong>⚠️ Did not request this?</strong><br>
              If you did not request a password reset, no action is needed. Your account is safe and this code cannot be used without your confirmation.
            </div>
            
              <p style="margin: 20px 0; font-size: 14px; color: #666;">
              For security reasons, do not reply to this email. If you need help, contact Business Permit Online System support directly.
            </p>
            
            <div class="footer">
              <p>&copy; 2026 Business Permit Online System. All rights reserved.</p>
              <p>This is an automated message - please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate registration OTP email HTML
 */
export function generateRegistrationOtpEmailHtml(
  otp: string,
  expirationMinutes: number
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .card {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 3px solid #0b8754;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0;
            color: #0b8754;
            font-size: 24px;
          }
          .otp-box {
            background-color: #e8f5e9;
            border: 2px solid #0b8754;
            border-radius: 6px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .otp-code {
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 4px;
            color: #0b8754;
            font-family: 'Courier New', monospace;
          }
          .info {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .warning {
            background-color: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #666;
            margin-top: 20px;
            border-top: 1px solid #ddd;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>Business Permit Online System — Account Verification</h1>
            </div>

            <p>Hello,</p>

            <p>You are registering a new applicant account with the Business Permit Online System. Use the OTP code below to verify your email address and complete your registration:</p>

            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>

            <div class="info">
              <strong>\u23f1\ufe0f Valid for ${expirationMinutes} minutes</strong>
            </div>

            <p style="margin: 15px 0;">
              <strong>Important security notes:</strong>
            </p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Never share this code with anyone</li>
              <li>Business Permit Online System staff will never ask for this code</li>
              <li>After ${expirationMinutes} minutes, this code will expire</li>
              <li>If you did not request this, please ignore this email</li>
            </ul>

            <div class="warning">
              <strong>\u26a0\ufe0f Did not request this?</strong><br>
              If you did not attempt to register an account, no action is needed. Simply ignore this email.
            </div>

            <p style="margin: 20px 0; font-size: 14px; color: #666;">
              For security reasons, do not reply to this email. If you need help, contact Business Permit Online System support directly.
            </p>

            <div class="footer">
              <p>&copy; 2026 Municipality of Enrique B. Magalona - BPLO. All rights reserved.</p>
              <p>This is an automated message - please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate Super Admin / IT Administrator login OTP email HTML
 */
export function generateSuperAdminLoginOtpEmailHtml(
  otp: string,
  expirationMinutes: number
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .card {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 3px solid #0b8754;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0;
            color: #0b8754;
            font-size: 22px;
          }
          .otp-box {
            background-color: #e8f5e9;
            border: 2px solid #0b8754;
            border-radius: 6px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .otp-code {
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 4px;
            color: #0b8754;
            font-family: 'Courier New', monospace;
          }
          .info {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .warning {
            background-color: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #666;
            margin-top: 20px;
            border-top: 1px solid #ddd;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>Business Permit Online System — IT Administrator Login</h1>
            </div>

            <p>Hello,</p>

            <p>A sign-in attempt was made for the IT Administrator account. Use the one-time password (OTP) below to complete login:</p>

            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>

            <div class="info">
              <strong>Valid for ${expirationMinutes} minutes</strong>
            </div>

            <p style="margin: 15px 0;">
              <strong>Important security notes:</strong>
            </p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Never share this code with anyone</li>
              <li>Business Permit Online System staff will never ask for this code</li>
              <li>After ${expirationMinutes} minutes, this code will expire</li>
              <li>If you did not attempt to sign in, change your password immediately</li>
            </ul>

            <div class="warning">
              <strong>Did not request this?</strong><br>
              If you did not attempt to sign in as IT Administrator, secure the account and contact municipal IT support.
            </div>

            <div class="footer">
              <p>&copy; 2026 Municipality of Enrique B. Magalona - BPLO. All rights reserved.</p>
              <p>This is an automated message - please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateRenewalEmailHtml(input: {
  heading: string;
  intro: string;
  businessName: string;
  permitNumber: string | null;
  expirationDateLabel: string;
  renewUrl: string;
  supportEmail: string;
}): string {
  const permitDisplay = input.permitNumber ? escapeHtml(input.permitNumber) : "Not available";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 560px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .card {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 3px solid #0b8754;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0;
            color: #0b8754;
            font-size: 22px;
          }
          .details {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 16px;
            margin: 20px 0;
          }
          .details p {
            margin: 6px 0;
          }
          .cta {
            text-align: center;
            margin: 24px 0;
          }
          .cta a {
            display: inline-block;
            background-color: #0b8754;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: 600;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #666;
            margin-top: 20px;
            border-top: 1px solid #ddd;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>${escapeHtml(input.heading)}</h1>
            </div>

            <p>Hello,</p>
            <p>${escapeHtml(input.intro)}</p>

            <div class="details">
              <p><strong>Business name:</strong> ${escapeHtml(input.businessName)}</p>
              <p><strong>Permit number:</strong> ${permitDisplay}</p>
              <p><strong>Renewal deadline:</strong> ${escapeHtml(input.expirationDateLabel)}</p>
            </div>

            <p>Sign in to the Business Permit Online System to submit your renewal application.</p>

            <div class="cta">
              <a href="${escapeHtml(input.renewUrl)}">Open Business Permit Online System</a>
            </div>

            <p style="font-size: 14px; color: #666;">
              If you need assistance, contact BPLO at
              <a href="mailto:${escapeHtml(input.supportEmail)}">${escapeHtml(input.supportEmail)}</a>.
            </p>

            <div class="footer">
              <p>&copy; 2026 Municipality of Enrique B. Magalona - BPLO. All rights reserved.</p>
              <p>This is an automated message - please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export interface PaymentReminderEmailInput {
  applicantName: string;
  businessName: string;
  applicationNumber: string;
  transactionNumber: string; // OR number
  amountPaid: number;
  paymentDate: string;
  verifiedDate: string;
  remarks?: string | null;
  trackingUrl: string;
  supportEmail?: string;
}

export function generatePaymentReminderEmailHtml(input: PaymentReminderEmailInput): string {
  const applicant = escapeHtml(input.applicantName || "Valued Taxpayer");
  const business = escapeHtml(input.businessName || "Registered Business");
  const appNum = escapeHtml(input.applicationNumber);
  const orNum = escapeHtml(input.transactionNumber);
  const amountStr = `₱ ${input.amountPaid.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const payDate = escapeHtml(input.paymentDate);
  const verDate = escapeHtml(input.verifiedDate);
  const trackingUrl = escapeHtml(input.trackingUrl);
  const supportEmail = escapeHtml(input.supportEmail || "bplo@ebmagalona.gov.ph");
  const remarksSection = input.remarks?.trim()
    ? `<tr>
        <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; width: 38%;">BPLO Remarks</td>
        <td style="padding: 10px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${escapeHtml(input.remarks.trim())}</td>
      </tr>`
    : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            background-color: #f1f5f9;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 580px;
            margin: 24px auto;
            padding: 0 16px;
          }
          .card {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 32px 28px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            border: 1px solid #e2e8f0;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #0b8754;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .lgu-title {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
            color: #64748b;
            margin: 0 0 4px 0;
          }
          .header h1 {
            margin: 0;
            color: #0b8754;
            font-size: 22px;
            font-weight: 800;
          }
          .badge-wrap {
            text-align: center;
            margin: 20px 0;
          }
          .badge {
            display: inline-block;
            background-color: #dcfce7;
            color: #15803d;
            border: 1px solid #86efac;
            border-radius: 9999px;
            padding: 6px 18px;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .receipt-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background-color: #f8fafc;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
            font-size: 14px;
          }
          .notice-box {
            background-color: #f0fdf4;
            border-left: 4px solid #16a34a;
            border-radius: 6px;
            padding: 16px;
            margin: 24px 0;
          }
          .notice-title {
            font-weight: 700;
            color: #166534;
            font-size: 14px;
            margin: 0 0 8px 0;
          }
          .notice-list {
            margin: 0;
            padding-left: 20px;
            color: #14532d;
            font-size: 13.5px;
          }
          .notice-list li {
            margin-bottom: 6px;
          }
          .cta-wrap {
            text-align: center;
            margin: 28px 0;
          }
          .cta-btn {
            display: inline-block;
            background-color: #0b8754;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 30px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 15px;
            box-shadow: 0 2px 6px rgba(11, 135, 84, 0.3);
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #64748b;
            margin-top: 28px;
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <p class="lgu-title">Municipality of Enrique B. Magalona</p>
              <h1>BPLO Business Permit Online System</h1>
            </div>

            <div class="badge-wrap">
              <span class="badge">✔ PAYMENT VERIFIED</span>
            </div>

            <p style="margin: 0 0 12px 0;">Hello <strong>${applicant}</strong>,</p>
            <p style="margin: 0 0 16px 0; color: #334155;">
              Your payment reference for <strong>${business}</strong> has been officially verified and recorded by the Business Permit and Licensing Office (BPLO).
            </p>

            <table class="receipt-table">
              <tr>
                <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; width: 38%;">Business Name</td>
                <td style="padding: 10px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${business}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0;">Application Ref</td>
                <td style="padding: 10px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${appNum}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0;">Official Receipt (OR) No.</td>
                <td style="padding: 10px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0; font-weight: 700; font-family: 'Courier New', monospace;">${orNum}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0;">Total Amount Paid</td>
                <td style="padding: 10px 12px; color: #0b8754; border-bottom: 1px solid #e2e8f0; font-weight: 700; font-size: 15px;">${amountStr}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0;">Payment Date</td>
                <td style="padding: 10px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${payDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0;">Verified Date</td>
                <td style="padding: 10px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${verDate}</td>
              </tr>
              ${remarksSection}
            </table>

            <div class="notice-box">
              <p class="notice-title">📌 Important Reminders & Claiming Instructions:</p>
              <ul class="notice-list">
                <li>Your application has advanced to permit preparation and release scheduling.</li>
                <li>When claiming your printed Business Permit at the BPLO office, please present your original <strong>Official Receipt (OR #${orNum})</strong> and a <strong>valid ID</strong>.</li>
                <li>If an authorized representative will claim the document, please provide a signed Authorization Letter and valid IDs for both parties.</li>
              </ul>
            </div>

            <div class="cta-wrap">
              <a href="${trackingUrl}" class="cta-btn">View Application Status</a>
            </div>

            <p style="font-size: 13px; color: #64748b; margin-top: 16px;">
              Questions? Contact the BPLO Municipal Office at <a href="mailto:${supportEmail}" style="color: #0b8754;">${supportEmail}</a>.
            </p>

            <div class="footer">
              <p>&copy; 2026 Municipality of Enrique B. Magalona - BPLO. All rights reserved.</p>
              <p>This is an automated transactional notification. Please do not reply directly to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

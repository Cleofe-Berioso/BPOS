"use client";

import Image from "next/image";
import type { ClosureCertificatePrintData } from "@/lib/printable-documents";

interface ClosureCertificateTemplateProps {
  certificate: ClosureCertificatePrintData;
}

function dateLabel(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function dateDay(value: string | null): string {
  if (!value) return "[Day]";
  return new Date(value).toLocaleDateString("en-PH", { day: "numeric" });
}

function dateMonthYear(value: string | null): string {
  if (!value) return "[Month Year]";
  return new Date(value).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
}

function getCertificateYear(dateIssued: string | null): string {
  if (!dateIssued) return new Date().getFullYear().toString();
  return new Date(dateIssued).getFullYear().toString();
}

function printDateLabel(): string {
  return new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

export function ClosureCertificateTemplate({ certificate }: ClosureCertificateTemplateProps) {
  const certYear = getCertificateYear(certificate.dateIssued);
  const municipalityName = certificate.heading.municipality || "[Municipality Name]";

  return (
    <section className="mx-auto w-full max-w-[860px] bg-white px-3 py-4 text-black sm:px-4 print:max-w-none print:px-0 print:py-0">
      {/* No-Print Banner */}
      <div className="no-print mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Business Closure Certificate preview. Use the print button below to print or save as PDF.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-black px-3 py-1.5 text-sm font-semibold text-black"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Main Certificate Container */}
      <article className="relative overflow-hidden rounded-[16px] border-[3px] border-red-700 bg-white text-black print:rounded-none print:border-2">
        {/* Decorative top wave design */}
        <div className="absolute left-0 right-0 top-0 h-12 bg-gradient-to-r from-red-700 via-red-600 to-red-700 opacity-90 print:opacity-100" />
        <svg
          className="absolute left-0 right-0 top-10 h-6 w-full"
          viewBox="0 0 1000 120"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 0 60 Q 250 0 500 60 T 1000 60 L 1000 120 L 0 120 Z"
            fill="none"
            stroke="rgb(185, 28, 28)"
            strokeWidth="2"
            opacity="0.8"
          />
        </svg>

        {/* Large faint watermark */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]">
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black" />
          <div className="absolute left-1/2 top-1/2 flex h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/60">
            <Image
              src="/images/logo.png"
              alt="Municipal seal watermark"
              width={220}
              height={220}
              className="h-[220px] w-[220px] object-contain"
            />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 px-6 pb-8 pt-16 sm:px-10 sm:pt-20">
          {/* Header with logos */}
          <header className="mb-8">
            <div className="grid grid-cols-[76px_1fr_76px] items-center gap-2 sm:grid-cols-[92px_1fr_92px] sm:gap-4">
              {/* Left Logo */}
              <div className="flex justify-start">
                <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border border-slate-300 bg-white p-1 shadow-sm sm:h-[92px] sm:w-[92px]">
                  <Image
                    src="/images/logo.png"
                    alt="Municipality seal"
                    width={88}
                    height={88}
                    className="h-full w-full object-contain"
                    priority
                  />
                </div>
              </div>

              {/* Center heading */}
              <div className="text-center">
                <p className="text-[12px] font-medium leading-tight text-slate-800 sm:text-[14px]">
                  {certificate.heading.republic}
                </p>
                <p className="mt-0.5 text-[12px] font-medium leading-tight text-slate-800 sm:text-[14px]">
                  {certificate.heading.province}
                </p>
                <p className="mt-1.5 text-[20px] font-black uppercase leading-tight tracking-[0.02em] text-black sm:text-[24px]">
                  {certificate.heading.municipality}
                </p>
                <p className="mt-1 text-[12px] font-bold uppercase leading-tight tracking-[0.05em] text-red-700 sm:text-[13px]">
                  {certificate.heading.office}
                </p>
              </div>

              {/* Symmetrical spacer to keep center heading optically centered */}
              <div aria-hidden="true" className="w-[76px] sm:w-[92px]" />
            </div>

            {/* Main title */}
            <div className="mt-6 border-b-2 border-red-700 pb-2.5 text-center">
              <h1 className="text-[30px] font-black uppercase leading-tight tracking-wide text-red-700 sm:text-[38px]">
                Business Closure Certificate
              </h1>
            </div>

            {/* Series year */}
            <div className="mt-2 text-center">
              <p className="text-[14px] font-bold uppercase tracking-wider text-red-700 sm:text-[15px]">
                Series of Year {certYear}
              </p>
            </div>
          </header>

          {/* Certificate Body */}
          <section className="space-y-5 text-justify text-[14px] leading-relaxed sm:text-[15px]">
            {/* Paragraph 1 */}
            <p>
              This is to certify that the business/trade name <span className="font-bold">{certificate.businessName || "[Business Name]"}</span>,
              owned by <span className="font-bold">{certificate.ownerOrPresident || "[Owner/Applicant Full Name]"}</span>, with business address at{" "}
              <span className="font-bold">{certificate.businessAddress || "[Business Address]"}</span>, has filed and completed a Business
              Closure Application through the Business Permit Online System.
            </p>

            {/* Paragraph 2 */}
            <p>
              Based on the submitted closure request and verification of records, the above-mentioned business has ceased operation effective{" "}
              <span className="font-bold">{dateLabel(certificate.effectiveClosureDate) || "[Closure Effective Date]"}</span>.
            </p>

            {/* Paragraph 3 */}
            <p>
              This certification is issued upon the request of the party concerned for legal, record, and municipal business permit purposes.
            </p>

            {/* Paragraph 4 */}
            <p>
              In view of the foregoing, approval of the business closure is hereby rendered.
            </p>

            {/* Closing Statement */}
            <div className="mt-6 text-center text-[14px] font-semibold">
              <p>
                Done this <span className="font-bold">{dateDay(certificate.dateIssued)}</span> day of{" "}
                <span className="font-bold">{dateMonthYear(certificate.dateIssued)}</span> at{" "}
                <span className="font-bold">{municipalityName}</span>, {certificate.heading.province}, Philippines.
              </p>
            </div>
          </section>

          {/* BPLO Office Section */}
          <section className="mt-10 flex justify-end sm:mt-12">
            <div className="w-full max-w-[280px] text-center">
              <div className="mb-2 h-16 border-b border-black sm:h-20" />
              <p className="text-[15px] font-bold text-black sm:text-[16px]">
                {certificate.signatories.departmentHeadOfBplo || "Gracee"}
              </p>
              <p className="mt-0.5 text-[12px] font-semibold uppercase tracking-wider text-slate-800 sm:text-[13px]">
                Department Head of BPLO
              </p>
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-8 space-y-1 border-t-2 border-red-200 pt-4 text-center text-[12px] leading-snug">
            <p className="text-[13px] font-semibold">Generated by Business Permit Online System</p>
            <p className="text-[12px]">Date Printed: {printDateLabel()}</p>
            <p className="text-[11px] text-slate-600">Certificate Number: {certificate.certificateNumber || "-"}</p>
            <p className="text-[10px] text-slate-500">Application Number: {certificate.applicationNumber || "-"}</p>
          </footer>
        </div>
      </article>

      {/* Print Styles */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          .no-print,
          nav,
          aside,
          [data-app-chrome],
          [data-navigation],
          [data-sidebar] {
            display: none !important;
          }

          section {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          article {
            border-radius: 0 !important;
            padding: 12mm !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </section>
  );
}

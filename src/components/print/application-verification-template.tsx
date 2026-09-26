"use client";

import Image from "next/image";
import type { BusinessInfo } from "@/lib/applicant-types";

interface ApplicationVerificationTemplateProps {
  info: BusinessInfo;
  applicationTypeLabel: string;
  requiredDocuments: string[];
  uploadedDocumentNames: string[];
  onClose: () => void;
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase();
}

function VerificationField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-b border-slate-200 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-black">{value?.trim() ? value : "-"}</p>
    </div>
  );
}

function VerificationSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="border-b-2 border-black pb-1 text-sm font-bold uppercase tracking-wide text-black">
        {title}
      </h2>
      <div className="mt-1 grid gap-x-6 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ApplicationVerificationTemplate({
  info,
  applicationTypeLabel,
  requiredDocuments,
  uploadedDocumentNames,
  onClose,
}: ApplicationVerificationTemplateProps) {
  const uploadedSet = new Set(uploadedDocumentNames.map(normalizeForCompare));
  const employeeSummary = [info.totalEmployees, info.maleEmployees, info.femaleEmployees]
    .some((v) => v?.trim())
    ? `${info.totalEmployees || "0"} total (${info.maleEmployees || "0"} male / ${info.femaleEmployees || "0"} female)`
    : "-";

  return (
    <div className="verification-print-modal fixed inset-0 z-[999] overflow-y-auto bg-black/50 p-3 sm:p-6">
      <div className="mx-auto w-full max-w-[820px] rounded-2xl bg-white text-black shadow-2xl print:rounded-none print:shadow-none">
        <div className="no-print flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            Back
          </button>
          <p className="text-sm font-semibold text-slate-700">Application Verification Form</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-black px-3 py-1.5 text-sm font-semibold text-black"
          >
            Print
          </button>
        </div>

        <article className="px-5 py-5 sm:px-8 sm:py-6">
          <header className="border-b-2 border-black pb-4 text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center">
              <Image src="/images/logo.png" alt="Municipality seal" width={56} height={56} className="h-14 w-14 object-contain" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Municipality of Enrique B. Magalona
            </p>
            <h1 className="mt-1 text-lg font-bold uppercase text-black">Application Verification Form</h1>
            <p className="mt-1 text-sm font-semibold text-slate-700">{applicationTypeLabel}</p>
            <p className="mt-1 text-xs italic text-slate-500">
              For applicant verification purposes only. This is not an official permit, receipt, or assessment.
            </p>
          </header>

          <VerificationSection title="Business Identity">
            <VerificationField label="Business Type" value={info.businessType} />
            <VerificationField label="Registration Number" value={info.registrationNumber} />
            <VerificationField label="TIN" value={info.tin} />
            <VerificationField label="Business Name" value={info.businessName} />
            <VerificationField label="Trade Name" value={info.tradeName} />
            <VerificationField label="Owner / Responsible Person" value={info.ownerName} />
            <VerificationField label="Sex" value={info.sex} />
            <VerificationField label="Nationality" value={info.nationality} />
          </VerificationSection>

          <VerificationSection title="Contact Information">
            <VerificationField label="Email Address" value={info.email} />
            <VerificationField label="Mobile Number" value={info.phone} />
            <VerificationField label="Telephone Number" value={info.telephone} />
          </VerificationSection>

          <VerificationSection title="Address Information">
            <VerificationField label="Main Office Address" value={info.mainOfficeAddress} />
            <VerificationField label="Main Office Zip Code" value={info.mainOfficeZipCode} />
            <VerificationField label="Business Address" value={info.businessAddress} />
            <VerificationField label="Business Zip Code" value={info.businessZipCode || "6118"} />
          </VerificationSection>

          <VerificationSection title="Operations and Staffing">
            <VerificationField label="Business Activity" value={info.businessActivity} />
            <VerificationField label="Line of Business" value={info.lineOfBusiness} />
            <VerificationField label="Business Area (sqm)" value={info.businessArea} />
            <VerificationField label="Total Floor Area (sqm)" value={info.totalFloorArea} />
            <VerificationField label="Employees" value={employeeSummary} />
            <VerificationField label="Employees within Municipality" value={info.employeesWithinMunicipality} />
            <VerificationField
              label="Delivery Vehicles"
              value={
                [info.deliveryVanTruck ? `${info.deliveryVanTruck} van/truck` : "", info.deliveryMotorcycle ? `${info.deliveryMotorcycle} motorcycle` : ""]
                  .filter(Boolean)
                  .join(", ") || "-"
              }
            />
            <VerificationField
              label="Business Classification"
              value={
                [
                  info.isMarket ? "Market Business" : "",
                  info.isAgriculture ? "Agriculture-related" : "",
                  info.isLiquorOrTobacco ? "Liquor/Tobacco Business" : "",
                ]
                  .filter(Boolean)
                  .join(", ") || "None declared"
              }
            />
          </VerificationSection>

          <VerificationSection title="Property and Tax Basis">
            <VerificationField label="Property Ownership" value={info.propertyOwnership} />
            <VerificationField label="Tax Declaration Number" value={info.taxDeclarationNumber} />
            <VerificationField label="Property Identification Number" value={info.propertyIdentificationNumber} />
            <VerificationField
              label="Payment Receipt"
              value={
                info.paymentReceiptFileName ||
                (info as any).paymentReceipt ||
                (info as any).orNumber ||
                "None uploaded"
              }
            />
            <VerificationField label="Asset Size / Capitalization" value={info.assetSize} />
            <VerificationField label="Capital Investment" value={info.capitalInvestment} />
            <VerificationField label="Gross Profit / Gross Receipts" value={info.grossProfit} />
            <VerificationField
              label="Tax Incentives from Government Entity"
              value={
                info.hasTaxIncentives === "YES"
                  ? `Yes — ${info.taxIncentives?.trim() || "Details not specified"}`
                  : info.hasTaxIncentives === "NO"
                    ? "No"
                    : "-"
              }
            />
          </VerificationSection>

          <VerificationSection title="Payment Preference">
            <VerificationField
              label="Mode of Payment"
              value={
                info.paymentFrequency === "ANNUAL"
                  ? "Annual"
                  : info.paymentFrequency === "BI_ANNUAL"
                    ? "Bi-Annual"
                    : "Quarterly"
              }
            />
          </VerificationSection>

          <section className="mt-5">
            <h2 className="border-b-2 border-black pb-1 text-sm font-bold uppercase tracking-wide text-black">
              Required Documents
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {requiredDocuments.map((doc) => {
                const isUploaded = uploadedSet.has(normalizeForCompare(doc));
                return (
                  <li key={doc} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block h-3.5 w-3.5 flex-shrink-0 border border-black text-center text-[10px] leading-[13px]">
                      {isUploaded ? "X" : ""}
                    </span>
                    <span>{doc}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <footer className="mt-6 border-t border-slate-300 pt-3 text-xs text-slate-600">
            <p>
              Generated by the Business Permit Online System for applicant self-verification. Review all entries
              carefully before final submission; incorrect details may delay processing.
            </p>
            <p className="mt-1">Printed on: {new Date().toLocaleString()}</p>
          </footer>
        </article>

        <div className="no-print flex items-center justify-start border-t border-slate-200 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            Back to Review and Submit
          </button>
        </div>
      </div>

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

          body * {
            visibility: hidden;
          }

          .verification-print-modal,
          .verification-print-modal * {
            visibility: visible;
          }

          .verification-print-modal {
            position: absolute;
            inset: 0;
            background: #ffffff !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .verification-print-modal .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

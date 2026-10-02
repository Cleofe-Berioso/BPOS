"use client";

import { useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";

interface ReportOption {
  id: string;
  name: string;
  description: string;
  category: string;
  printUrl: string;
}

const REPORT_OPTIONS: ReportOption[] = [
  {
    id: "applications",
    name: "Application Summary Report",
    description: "All business permit applications with type, current stage, owner, and filing dates.",
    category: "Workflow & Applications",
    printUrl: "/superadmin/reports/print/applications",
  },
  {
    id: "business-registry",
    name: "Business Registry Masterlist",
    description: "Comprehensive registry of all registered businesses, permit numbers, validity, and status.",
    category: "Business Registry",
    printUrl: "/superadmin/reports/print/business-registry",
  },
  {
    id: "monthly-summary",
    name: "Monthly Executive Summary",
    description: "Executive KPIs, monthly filing volume, revenue total, and compliance signals.",
    category: "Executive Briefings",
    printUrl: "/superadmin/reports/print/monthly-summary",
  },
  {
    id: "closures",
    name: "Business Closure Report",
    description: "Applications to retire/close business operations, including certificate release tracking.",
    category: "Business Registry",
    printUrl: "/superadmin/reports/print/closures",
  },
  {
    id: "inspections",
    name: "Inspection Compliance Report",
    description: "JIT inspection findings, compliance decisions, and Department Head verifications.",
    category: "Compliance & Safety",
    printUrl: "/superadmin/reports/print/inspections",
  },
  {
    id: "audit-trail",
    name: "System Audit Trail",
    description: "Chronological log of actor actions, role activities, and status transitions across modules.",
    category: "Security & Auditing",
    printUrl: "/superadmin/reports/print/audit-trail",
  },
  {
    id: "sms",
    name: "SMS Delivery Log",
    description: "Audit log of automated SMS notices sent to applicants with delivery statuses.",
    category: "Communications",
    printUrl: "/superadmin/reports/print/sms",
  },
];

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function SuperAdminReportExportCard() {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  const [selectedReport, setSelectedReport] = useState<string>("applications");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [applicationType, setApplicationType] = useState<string>("");
  const [barangay, setBarangay] = useState<string>("");
  const [businessType, setBusinessType] = useState<string>("");
  const [complianceStatus, setComplianceStatus] = useState<string>("");
  const [actorRole, setActorRole] = useState<string>("");
  const [auditModule, setAuditModule] = useState<string>("");
  const [month, setMonth] = useState<string>(String(currentMonth));
  const [year, setYear] = useState<string>(String(currentYear));
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const activeReport = REPORT_OPTIONS.find((r) => r.id === selectedReport) ?? REPORT_OPTIONS[0];

  function buildExportUrl(reportId = selectedReport) {
    const params = new URLSearchParams();
    params.set("reportType", reportId);

    if (reportId === "monthly-summary") {
      params.set("month", month);
      params.set("year", year);
    } else {
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      if (reportId === "applications") {
        if (status) params.set("status", status);
        if (applicationType) params.set("applicationType", applicationType);
      } else if (reportId === "business-registry") {
        if (barangay) params.set("barangay", barangay);
        if (businessType) params.set("businessType", businessType);
        if (status) params.set("status", status);
      } else if (reportId === "closures") {
        if (status) params.set("status", status);
      } else if (reportId === "inspections") {
        if (complianceStatus) params.set("complianceStatus", complianceStatus);
      } else if (reportId === "audit-trail") {
        if (actorRole) params.set("actorRole", actorRole);
        if (auditModule) params.set("module", auditModule);
      } else if (reportId === "sms") {
        if (status) params.set("status", status);
      }
    }

    return `/api/superadmin/reports/export?${params.toString()}`;
  }

  const handleDownload = async (urlOverride?: string, customSuccessMessage?: string) => {
    const targetUrl = urlOverride || buildExportUrl();
    setIsExporting(true);
    setExportSuccess(null);

    try {
      // Trigger download via hidden anchor
      const link = document.createElement("a");
      link.href = targetUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportSuccess(customSuccessMessage || `CSV file generated successfully! Check your browser downloads.`);
      setTimeout(() => setExportSuccess(null), 6000);
    } catch (err) {
      console.error("Export download failed", err);
      alert("Failed to download CSV. Please check your connection and try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SectionCard
      title="Generate & Export CSV Reports"
      description="Download clean, structured, and understandable report files in CSV format. Formatted for instant opening in Microsoft Excel, Google Sheets, or any office suite."
    >
      <div className="space-y-6">
        {/* Quick Instant Downloads Strip */}
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-muted,#f8fafc)] p-4 dark:bg-neutral-900/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
            <span>Quick 1-Click Downloads (Latest Complete Data)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDownload("/api/superadmin/reports/export?reportType=applications", "All Applications CSV downloaded!")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-surface)] transition-colors shadow-xs"
            >
              <FileText className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
              <span>Applications Summary</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload("/api/superadmin/reports/export?reportType=business-registry", "Business Registry Masterlist CSV downloaded!")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-surface)] transition-colors shadow-xs"
            >
              <Building2 className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
              <span>Business Registry</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload(`/api/superadmin/reports/export?reportType=monthly-summary&month=${currentMonth}&year=${currentYear}`, `Executive Summary for this month downloaded!`)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-surface)] transition-colors shadow-xs"
            >
              <BarChart3 className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
              <span>Current Month Executive Summary</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload("/api/superadmin/reports/export?reportType=audit-trail", "Audit Trail CSV downloaded!")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-surface)] transition-colors shadow-xs"
            >
              <Shield className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
              <span>System Audit Trail</span>
            </button>
          </div>
        </div>

        {/* Custom Filtered Report Generator Form */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. Report Type Selector */}
          <div className="space-y-1.5">
            <label htmlFor="report-type" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
              1. Select Report Type <span className="text-red-500">*</span>
            </label>
            <select
              id="report-type"
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
            >
              {REPORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name} ({opt.category})
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              {activeReport.description}
            </p>
          </div>

          {/* 2. Dynamic Filter Section */}
          {selectedReport === "monthly-summary" ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="filter-month" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Target Month <span className="text-red-500">*</span>
                </label>
                <select
                  id="filter-month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="filter-year" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Target Year <span className="text-red-500">*</span>
                </label>
                <input
                  id="filter-year"
                  type="number"
                  min="2020"
                  max="2035"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </>
          ) : (
            <>
              {/* Date From */}
              <div className="space-y-1.5">
                <label htmlFor="filter-from" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Date From (Optional)
                </label>
                <input
                  id="filter-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Date To */}
              <div className="space-y-1.5">
                <label htmlFor="filter-to" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Date To (Optional)
                </label>
                <input
                  id="filter-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </>
          )}

          {/* Additional Filter 1 */}
          {selectedReport === "applications" && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="filter-app-type" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Application Type
                </label>
                <select
                  id="filter-app-type"
                  value={applicationType}
                  onChange={(e) => setApplicationType(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="">All Application Types</option>
                  <option value="NEW">New Business Registration</option>
                  <option value="RENEWAL">Business Permit Renewal</option>
                  <option value="CLOSURE">Business Closure / Retirement</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="filter-app-status" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Workflow Status
                </label>
                <select
                  id="filter-app-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="">All Statuses</option>
                  <option value="SUBMITTED">Submitted (Pending Review)</option>
                  <option value="UNDER_REVIEW">Under Review (BPLO)</option>
                  <option value="ASSESSED">Assessed</option>
                  <option value="APPROVED_FOR_PAYMENT">Approved for Payment</option>
                  <option value="PAID">Paid</option>
                  <option value="RELEASED">Released (Completed)</option>
                  <option value="RETURNED_FOR_CORRECTION">Returned for Correction</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </>
          )}

          {selectedReport === "business-registry" && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="filter-barangay" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Barangay Filter
                </label>
                <input
                  id="filter-barangay"
                  type="text"
                  placeholder="e.g. Poblacion 1, Alicante..."
                  value={barangay}
                  onChange={(e) => setBarangay(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="filter-biz-status" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Operating Status
                </label>
                <select
                  id="filter-biz-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="">All Operating Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            </>
          )}

          {selectedReport === "inspections" && (
            <div className="space-y-1.5">
              <label htmlFor="filter-compliance" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                Compliance Result
              </label>
              <select
                id="filter-compliance"
                value={complianceStatus}
                onChange={(e) => setComplianceStatus(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
              >
                <option value="">All Compliance Findings</option>
                <option value="COMPLIANT">Compliant</option>
                <option value="NON_COMPLIANT">Non-Compliant</option>
                <option value="PENDING_REVIEW">Pending Review</option>
              </select>
            </div>
          )}

          {selectedReport === "audit-trail" && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="filter-actor-role" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Actor Role
                </label>
                <select
                  id="filter-actor-role"
                  value={actorRole}
                  onChange={(e) => setActorRole(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="">All Roles</option>
                  <option value="BPLO">BPLO Staff</option>
                  <option value="SUPER_ADMIN">IT Administrator</option>
                  <option value="DEPARTMENT_HEAD">Department Head</option>
                  <option value="JIT">JIT Inspector</option>
                  <option value="APPLICANT">Applicant</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="filter-module" className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                  Module
                </label>
                <select
                  id="filter-module"
                  value={auditModule}
                  onChange={(e) => setAuditModule(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="">All Modules</option>
                  <option value="APPLICATION">Application Processing</option>
                  <option value="INSPECTION">Inspections</option>
                  <option value="PAYMENT">Payments & Assessments</option>
                  <option value="PERMIT">Permits & Certificates</option>
                  <option value="USER">User Management</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleDownload()}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--foreground)] text-[var(--surface)] hover:opacity-90 px-4 py-2.5 text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--surface)]" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4 text-[var(--surface)]" aria-hidden="true" />
              )}
              <span>{isExporting ? "Generating CSV..." : "Generate & Download CSV"}</span>
            </button>

            <a
              href={activeReport.printUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--muted-surface)] px-3 py-2.5 text-xs font-medium text-[var(--foreground)] transition-colors"
            >
              <Eye className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
              <span>Preview Printable View ↗</span>
            </a>
          </div>

          <div className="text-xs text-[var(--ink-muted)]">
            <span>Includes UTF-8 BOM encoding for seamless Microsoft Excel rendering</span>
          </div>
        </div>

        {/* Success Alert Banner */}
        {exportSuccess && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="font-medium">{exportSuccess}</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

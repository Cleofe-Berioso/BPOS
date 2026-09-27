import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/superadmin-api";
import {
  getApplicationSummaryReport,
  getBusinessRegistryReport,
  getBusinessClosureReport,
  getInspectionComplianceReport,
  getAuditTrailReport,
  getSmsDeliveryReport,
  getMonthlySummaryReport,
  type AppSummaryReportFilters,
  type BusinessRegistryReportFilters,
  type BusinessClosureReportFilters,
  type InspectionComplianceReportFilters,
  type AuditTrailReportFilters,
  type SmsDeliveryReportFilters,
} from "@/lib/superadmin-data";
import { listSuperAdminBusinessLocations } from "@/lib/business-location";
import {
  formatReportTimestamp,
  formatReportDateRange,
  formatReportCurrency,
  labelApplicationType,
  reportPercentOf,
  resolveReportMonthYear,
} from "@/lib/printable-reports";
import { buildCsvContent, escapeCsvCell, type CsvColumn } from "@/lib/csv-export";

function todayDateString(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized access to superadmin reports." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get("reportType") || "applications";
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const status = searchParams.get("status") || undefined;
  const applicationType = searchParams.get("applicationType") || undefined;
  const barangay = searchParams.get("barangay") || undefined;
  const businessType = searchParams.get("businessType") || undefined;
  const complianceStatus = searchParams.get("complianceStatus") || undefined;
  const inspectionStatus = searchParams.get("inspectionStatus") || undefined;
  const actorRole = searchParams.get("actorRole") || undefined;
  const auditModule = searchParams.get("module") || undefined;
  const monthParam = searchParams.get("month") || undefined;
  const yearParam = searchParams.get("year") || undefined;

  const adminName = session.user?.name ?? "IT Administrator";
  const generatedAt = formatReportTimestamp(new Date());
  const dateRangeLabel = formatReportDateRange(from, to);

  let csvContent = "";
  let filename = `ebpls-report-${todayDateString()}.csv`;

  try {
    switch (reportType) {
      case "applications": {
        const filters: AppSummaryReportFilters = { from, to, status, applicationType };
        const rows = await getApplicationSummaryReport(filters);

        const columns: CsvColumn<(typeof rows)[number]>[] = [
          { key: "applicationNumber", label: "Application Number" },
          { key: "businessName", label: "Business Name" },
          {
            key: "applicationType",
            label: "Application Type",
            format: (v) => labelApplicationType(String(v)),
          },
          { key: "status", label: "Current Status" },
          { key: "ownerName", label: "Owner / Applicant Name" },
          { key: "submittedDate", label: "Date Submitted" },
          { key: "lastUpdated", label: "Last Updated" },
        ];

        csvContent = buildCsvContent(columns, rows, {
          reportTitle: "Application Summary Report",
          generatedAt,
          generatedBy: adminName,
          dateRange: dateRangeLabel,
        });
        filename = `ebpls-application-summary-${todayDateString()}.csv`;
        break;
      }

      case "business-registry": {
        const filters: BusinessRegistryReportFilters = { barangay, businessType, status };
        const rows = await getBusinessRegistryReport(filters);

        const columns: CsvColumn<(typeof rows)[number]>[] = [
          { key: "businessName", label: "Business Name" },
          { key: "tradeName", label: "Trade Name" },
          { key: "owner", label: "Owner Name" },
          { key: "businessType", label: "Business Organization Type" },
          { key: "lineOfBusiness", label: "Line of Business" },
          { key: "address", label: "Barangay / Address" },
          { key: "permitNumber", label: "Permit Number" },
          { key: "permitValidity", label: "Permit Expiration Date" },
          { key: "businessStatus", label: "Operating Status" },
        ];

        csvContent = buildCsvContent(columns, rows, {
          reportTitle: "Business Registry Masterlist Report",
          generatedAt,
          generatedBy: adminName,
          dateRange: barangay ? `Filtered by Brgy. ${barangay}` : "All Barangays",
        });
        filename = `ebpls-business-registry-${todayDateString()}.csv`;
        break;
      }

      case "closures": {
        const filters: BusinessClosureReportFilters = { from, to, status };
        const rows = await getBusinessClosureReport(filters);

        const columns: CsvColumn<(typeof rows)[number]>[] = [
          { key: "applicationNumber", label: "Closure Application Number" },
          { key: "businessName", label: "Business Name" },
          { key: "owner", label: "Owner Name" },
          { key: "closureStatus", label: "Closure Status" },
          { key: "closureCertStatus", label: "Closure Certificate Status" },
          { key: "submittedDate", label: "Date Filed" },
          { key: "releasedDate", label: "Certificate Released Date" },
        ];

        csvContent = buildCsvContent(columns, rows, {
          reportTitle: "Business Closure Report",
          generatedAt,
          generatedBy: adminName,
          dateRange: dateRangeLabel,
        });
        filename = `ebpls-business-closures-${todayDateString()}.csv`;
        break;
      }

      case "inspections": {
        const filters: InspectionComplianceReportFilters = {
          from,
          to,
          complianceStatus,
          inspectionStatus,
        };
        const rows = await getInspectionComplianceReport(filters);

        const columns: CsvColumn<(typeof rows)[number]>[] = [
          { key: "date", label: "Inspection Date" },
          { key: "businessName", label: "Business Name" },
          { key: "applicationNumber", label: "Application Number" },
          { key: "inspector", label: "Assigned JIT Inspector" },
          { key: "complianceStatus", label: "Compliance Result" },
          { key: "inspectionStatus", label: "Inspection Status" },
          { key: "decidedBy", label: "Decided By" },
          { key: "decidedAt", label: "Decision Date" },
        ];

        csvContent = buildCsvContent(columns, rows, {
          reportTitle: "Inspection Compliance Report",
          generatedAt,
          generatedBy: adminName,
          dateRange: dateRangeLabel,
        });
        filename = `ebpls-inspection-compliance-${todayDateString()}.csv`;
        break;
      }

      case "audit-trail": {
        const filters: AuditTrailReportFilters = {
          from,
          to,
          actorRole,
          module: auditModule,
        };
        const rows = await getAuditTrailReport(filters);

        const columns: CsvColumn<(typeof rows)[number]>[] = [
          { key: "date", label: "Date & Time" },
          { key: "actorName", label: "Actor / User" },
          { key: "actorRole", label: "Actor Role" },
          { key: "action", label: "Action Taken" },
          { key: "module", label: "System Module" },
          { key: "entityType", label: "Entity Type" },
          { key: "description", label: "Description / Details" },
          { key: "beforeStatus", label: "Status Before" },
          { key: "afterStatus", label: "Status After" },
        ];

        csvContent = buildCsvContent(columns, rows, {
          reportTitle: "System Audit Trail Report",
          generatedAt,
          generatedBy: adminName,
          dateRange: dateRangeLabel,
        });
        filename = `ebpls-audit-trail-${todayDateString()}.csv`;
        break;
      }

      case "sms": {
        const filters: SmsDeliveryReportFilters = { from, to, status };
        const rows = await getSmsDeliveryReport(filters);

        const columns: CsvColumn<(typeof rows)[number]>[] = [
          { key: "date", label: "Date & Time" },
          { key: "applicationNumber", label: "Application Number" },
          { key: "maskedPhone", label: "Recipient Phone (Masked)" },
          { key: "provider", label: "SMS Provider Gateway" },
          { key: "status", label: "Delivery Status" },
          { key: "messageBody", label: "Notification Message" },
        ];

        csvContent = buildCsvContent(columns, rows, {
          reportTitle: "SMS Delivery & Notification Log",
          generatedAt,
          generatedBy: adminName,
          dateRange: dateRangeLabel,
        });
        filename = `ebpls-sms-delivery-log-${todayDateString()}.csv`;
        break;
      }

      case "business-locations": {
        const allLocations = await listSuperAdminBusinessLocations();
        const filteredLocations = allLocations.filter((loc) => {
          if (barangay && loc.barangay && !loc.barangay.toLowerCase().includes(barangay.toLowerCase())) {
            return false;
          }
          if (status && loc.status !== status) {
            return false;
          }
          return true;
        });

        const columns: CsvColumn<(typeof filteredLocations)[number]>[] = [
          { key: "businessName", label: "Business Name" },
          { key: "tradeName", label: "Trade Name" },
          { key: "applicationNumber", label: "Application Number" },
          { key: "applicantName", label: "Applicant Name" },
          { key: "barangay", label: "Barangay" },
          { key: "address", label: "Street Address" },
          { key: "latitude", label: "Latitude (GPS)" },
          { key: "longitude", label: "Longitude (GPS)" },
          { key: "businessCategoryLabel", label: "Business Category" },
          { key: "status", label: "Location Status" },
          { key: "applicationStatus", label: "Application Status" },
          { key: "permitOrCertificateNumber", label: "Permit / Certificate No." },
          { key: "updatedAt", label: "Last Verified / Updated" },
        ];

        csvContent = buildCsvContent(columns, filteredLocations, {
          reportTitle: "Business Location Mapping Report",
          generatedAt,
          generatedBy: adminName,
          dateRange: barangay ? `Brgy. ${barangay}` : "All Barangays",
        });
        filename = `ebpls-business-locations-${todayDateString()}.csv`;
        break;
      }

      case "monthly-summary": {
        const { month, year } = resolveReportMonthYear({
          month: monthParam,
          year: yearParam,
        });
        const summary = await getMonthlySummaryReport(month, year);

        // Build a multi-section, highly readable executive CSV document
        const lines: string[] = [
          `"# REPORT: Monthly Executive Summary Report"`,
          `"# MUNICIPALITY: Municipality of Enrique B. Magalona (BPLO)"`,
          `"# PERIOD: ${summary.periodLabel}"`,
          `"# GENERATED AT: ${generatedAt}"`,
          `"# GENERATED BY: ${adminName}"`,
          "",
          `"=== SECTION 1: KEY PERFORMANCE INDICATORS ==="`,
          `"Indicator / Metric","Value","Meaning & Operational Scope"`,
          `"Total Applications Submitted",${summary.applicationsSubmitted},"All application types submitted during this month"`,
          `"Business Permits Released",${summary.permitsReleased},"Official Business Permits released to compliant businesses"`,
          `"Closure Certificates Released",${summary.closureCertificatesReleased},"Certificates of Business Retirement/Closure issued"`,
          `"Closure Filings Received",${summary.closuresSubmitted},"Applications to retire or close business operations"`,
          `"Inspections Conducted",${summary.inspectionsConducted},"On-site inspections performed by Joint Inspection Team"`,
          `"Compliant Inspections",${summary.compliantInspections},"Inspections meeting all safety, health, and fire standards"`,
          `"Non-Compliant Inspections",${summary.nonCompliantInspections},"Inspections flagged for violations or corrections"`,
          `"Pending Inspection Reviews",${summary.pendingInspectionReview},"Inspections awaiting Department Head action"`,
          `"Verified Payments Count",${summary.verifiedPayments},"Validated payments with verified Official Receipt proof"`,
          `"Total Verified Revenue",${escapeCsvCell(formatReportCurrency(summary.verifiedPaymentAmount))},"Total verified fees collected by treasury"`,
          `"New User Accounts Created",${summary.newUsers},"New applicant accounts registered during this month"`,
          `"BPLO Administrative Actions",${summary.bploActions},"Document approvals, verifications, and status changes by staff"`,
          `"Audit Trail Events Recorded",${summary.auditEvents},"System accountability entries logged across all modules"`,
          `"SMS Notifications Sent",${summary.smsSent},"Application alerts successfully delivered to applicants"`,
          `"SMS Notifications Failed",${summary.smsFailed},"Alerts that could not be delivered"`,
          "",
          `"=== SECTION 2: APPLICATION WORKLOAD BY TYPE ==="`,
          `"Application Type","Volume","Share of Month","Operational Implication"`,
          ...summary.applicationsByType.map((t) => {
            const share = reportPercentOf(t.count, summary.applicationsSubmitted);
            const implication =
              t.type === "NEW"
                ? "First-time registrations requiring full document validation and GIS pinning"
                : t.type === "RENEWAL"
                  ? "Recurring assessment, tax calculation, and renewal validation"
                  : "Retirement filings requiring tax clearance and closure validation";
            return `${escapeCsvCell(labelApplicationType(t.type))},${t.count},${escapeCsvCell(share)},${escapeCsvCell(implication)}`;
          }),
          "",
          `"=== SECTION 3: APPLICATIONS BY STAGE / STATUS ==="`,
          `"Status / Stage","Volume","Interpretation"`,
          ...summary.applicationsByStatus.map((s) => {
            return `${escapeCsvCell(s.status)},${s.count},"Applications currently recorded at this stage"`;
          }),
        ];

        csvContent = "\uFEFF" + lines.join("\r\n");
        const paddedMonth = String(month).padStart(2, "0");
        filename = `ebpls-monthly-summary-${year}-${paddedMonth}.csv`;
        break;
      }

      default: {
        return NextResponse.json(
          { error: `Unknown report type: ${reportType}` },
          { status: 400 }
        );
      }
    }

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("[Report CSV Export Error]", error);
    return NextResponse.json(
      { error: "Failed to generate CSV report. Please try again." },
      { status: 500 }
    );
  }
}

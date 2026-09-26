import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { getBploApplicationDetail } from "@/lib/bplo-applications";
import { formatPersonName } from "@/lib/person-name";
import { resolveApplicantProfileImageUrl } from "@/lib/profile-image-url";
import { StatusBadge } from "@/components/applicant/status-badge";
import { StatusTracker } from "@/components/applicant/status-tracker";
import { BploApplicationReviewSection } from "@/components/bplo/bplo-application-review-section";
import type { ApplicationStatus, BusinessInfo } from "@/lib/applicant-types";
import { DetailHeader } from "@/components/ui/detail-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { Timeline } from "@/components/ui/timeline";
import { actionButtonStyles } from "@/components/ui/action-button";
import {
  bploPanelClass,
  bploSummaryLabelClass,
  bploSummaryTileClass,
  bploSummaryValueClass,
  bploWarningPanelClass,
} from "@/components/bplo/bplo-ui-styles";
import { UserAvatar } from "@/components/ui/user-avatar";

interface PageProps {
  params: Promise<{ applicationId: string }>;
}

const PROFILE_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 30;

const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));

function readText(formData: Record<string, unknown>, keys: string[], fallback = "-") {
  for (const key of keys) {
    const value = formData[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function readFlag(formData: Record<string, unknown>, key: string) {
  const value = formData[key];
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return "-";
}


function getStatusGuidance(status: string): { meaning: string; nextStep: string } {
  if (status === "Draft") {
    return {
      meaning: "This application is still in draft and not yet in the BPLO review flow.",
      nextStep: "No BPLO review action is expected yet.",
    };
  }

  if (status === "Submitted") {
    return {
      meaning: "The application has been filed and is waiting for BPLO review start.",
      nextStep: "Move to Under Review or issue a return/reject decision when applicable.",
    };
  }

  if (status === "Under Review") {
    return {
      meaning: "The application is currently in BPLO review stage.",
      nextStep: "Send to Department Head Review, or return/reject with remarks if needed.",
    };
  }

  if (status === "Department Head Review") {
    return {
      meaning: "BPLO review is complete. The application is waiting in the Department Head approval queue.",
      nextStep: "No further BPLO review action is needed here. Department Head decides approve, return, or reject.",
    };
  }

  if (status === "Department Head Approved") {
    return {
      meaning: "Department Head approved this application for fee assessment.",
      nextStep: "Continue in Fees & Assessment to prepare the Tax Order of Payment.",
    };
  }

  if (status === "Assessed") {
    return {
      meaning: "Review stage is complete and the application was assessed.",
      nextStep: "Proceed through assessment and payment preparation modules.",
    };
  }

  if (status === "Approved for Payment") {
    return {
      meaning: "The application is approved for payment processing.",
      nextStep: "Monitor payment verification module for submitted payment references.",
    };
  }

  if (status === "Paid") {
    return {
      meaning: "Payment was recorded and the application is beyond review decision stage.",
      nextStep: "Continue permit issuance workflow in its assigned module.",
    };
  }

  if (status === "For Release") {
    return {
      meaning: "Permit or certificate preparation is completed and queued for release.",
      nextStep: "Finalize release processing in permit issuance module.",
    };
  }

  if (status === "Released") {
    return {
      meaning: "Application reached release completion.",
      nextStep: "No additional BPLO review decision is required on this page.",
    };
  }

  if (status === "Returned for Correction") {
    return {
      meaning: "The application was returned for applicant corrections.",
      nextStep: "Wait for applicant resubmission and monitor queue updates.",
    };
  }

  if (status === "Rejected") {
    return {
      meaning: "The application was rejected during BPLO review.",
      nextStep: "No further review-stage transition is expected.",
    };
  }

  return {
    meaning: "This record has an active workflow status.",
    nextStep: "Follow the current workflow stage guidance.",
  };
}

export default async function BploApplicationDetailPage({ params }: PageProps) {
  const { applicationId } = await params;
  const application = await getBploApplicationDetail(applicationId);

  if (!application) {
    notFound();
  }

  const formData = application.formData as Record<string, unknown>;
  const profilePictureUrl = await resolveApplicantProfileImageUrl(application.applicant.profileImageStoragePath, {
    expiresInSeconds: PROFILE_IMAGE_SIGNED_URL_TTL_SECONDS,
  });
  const statusGuidance = getStatusGuidance(application.status);
  const latestRemarks = application.history.find(
    (item: any) => typeof item.remarks === "string" && item.remarks.trim().length > 0
  );
  const applicantName = formatPersonName({
    firstName: application.applicant.firstName,
    middleName: application.applicant.middleName,
    lastName: application.applicant.lastName,
    suffix: application.applicant.suffix,
    fallbackName: application.applicant.name,
  });
  const applicantContactNumber = readText(formData, ["phone"], application.businessPhone ?? "No contact number provided.");
  const ownerName = readText(formData, ["ownerName"]);
  const ownerFirstName = readText(formData, ["ownerFirstName"], "");
  const ownerMiddleName = readText(formData, ["ownerMiddleName"], "");
  const ownerSurname = readText(formData, ["ownerSurname"], "");

  const latitude = typeof formData.businessLatitude === "number" ? formData.businessLatitude : null;
  const longitude = typeof formData.businessLongitude === "number" ? formData.businessLongitude : null;

  return (
    <section className="ui-page-stack">
      <DetailHeader
        title="Application Review"
        subtitle={application.applicationNumber}
        badge={<StatusBadge status={application.status as ApplicationStatus} />}
        actions={
          <Link href="/bplo/applications" className={actionButtonStyles("secondary", "sm")}>
            Back to Queue
          </Link>
        }
      />

      <SectionCard contentClassName="py-4 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex shrink-0 justify-center sm:justify-start">
              <UserAvatar
                src={profilePictureUrl}
                name={applicantName}
                size="lg"
                className="h-28 w-28 shadow-sm sm:h-32 sm:w-32"
              />
            </div>

            <div className="min-w-0 space-y-3 text-center sm:text-left">
              <p className="ui-caption font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Applicant</p>
              <div className="space-y-1.5">
                <h3 className="text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">{applicantName}</h3>
                <p className="text-sm text-[var(--ink-muted)]">{application.businessName}</p>
              </div>
              <div className="space-y-2 text-sm text-[var(--ink-muted)]">
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <Mail className="h-4 w-4 text-[var(--ink-muted)]" />
                  <span className="break-all">{application.applicant.email}</span>
                </div>
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <Phone className="h-4 w-4 text-[var(--ink-muted)]" />
                  <span>{applicantContactNumber}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:w-[26rem] lg:grid-cols-2 lg:self-stretch">
            <div className={bploSummaryTileClass}>
              <p className={bploSummaryLabelClass}>Application Number</p>
              <p className={bploSummaryValueClass}>{application.applicationNumber}</p>
            </div>
            <div className={bploSummaryTileClass}>
              <p className={bploSummaryLabelClass}>Application Type</p>
              <p className={bploSummaryValueClass}>{application.applicationType}</p>
            </div>
            <div className={bploSummaryTileClass}>
              <p className={bploSummaryLabelClass}>Date Submitted</p>
              <p className={bploSummaryValueClass}>
                {application.submittedAt ? formatDateTime(application.submittedAt) : "-"}
              </p>
            </div>
            <div className={bploSummaryTileClass}>
              <p className={bploSummaryLabelClass}>Current Status</p>
              <div className="mt-2">
                <StatusBadge status={application.status as ApplicationStatus} />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Current Status" description="Current workflow meaning and expected next step.">
        <div className="space-y-4">
          <div className={bploPanelClass}>
            <p>
              <span className="font-semibold text-[var(--foreground)]">Status meaning:</span> {statusGuidance.meaning}
            </p>
            <p className="mt-2">
              <span className="font-semibold text-[var(--foreground)]">Expected next step:</span> {statusGuidance.nextStep}
            </p>
          </div>
          <StatusTracker
            status={application.status as ApplicationStatus}
            applicationType={application.applicationType}
          />
        </div>
      </SectionCard>

      <BploApplicationReviewSection
        applicationId={application.id}
        currentStatus={application.status}
        applicationType={application.applicationType}
        formData={application.formData as unknown as BusinessInfo}
        documents={application.documents}
      />

      <SectionCard title="Remarks" description="Latest BPLO remarks and comment trail context.">
        {latestRemarks ? (
          <div className={bploWarningPanelClass}>
            <p className="text-sm text-[var(--foreground)]">{latestRemarks.remarks}</p>
            <p className="mt-2 ui-caption">
              {latestRemarks.actorName}
              {latestRemarks.actorRole ? ` / ${latestRemarks.actorRole}` : ""} - {new Date(latestRemarks.createdAt).toLocaleString("en-PH")}
            </p>
          </div>
        ) : (
          <EmptyState title="No remarks yet" description="Remarks will appear here when BPLO records comments in review history." />
        )}
      </SectionCard>

      <SectionCard title="Submitted Information" description="Complete read-only snapshot of submitted data for BPLO review.">
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Applicant / Owner Information" description="Filed owner identity and contact details.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              {ownerFirstName || ownerMiddleName || ownerSurname ? (
                <>
                  <p><strong>First Name:</strong> {ownerFirstName || "-"}</p>
                  <p><strong>Middle Name:</strong> {ownerMiddleName || "-"}</p>
                  <p><strong>Surname:</strong> {ownerSurname || "-"}</p>
                </>
              ) : (
                <p><strong>Owner / President:</strong> {ownerName}</p>
              )}
              <p><strong>Sex:</strong> {readText(formData, ["sex"])}</p>
              <p><strong>Nationality:</strong> {readText(formData, ["nationality"])}</p>
              <p><strong>Email:</strong> {readText(formData, ["email"])}</p>
              <p><strong>Phone:</strong> {readText(formData, ["phone"])}</p>
            </div>
          </SectionCard>

          <SectionCard title="Business Identity" description="Registration and business identity fields.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Business Name:</strong> {readText(formData, ["businessName"], application.businessName)}</p>
              <p><strong>Trade Name:</strong> {readText(formData, ["tradeName"])}</p>
              <p><strong>Business Type:</strong> {readText(formData, ["businessType"])}</p>
              <p><strong>Registration Type:</strong> {readText(formData, ["businessType"])}</p>
              <p><strong>Registration Number:</strong> {readText(formData, ["registrationNumber"])}</p>
              <p><strong>TIN:</strong> {readText(formData, ["tin"])}</p>
              <p><strong>Business Activity:</strong> {readText(formData, ["businessActivity"])}</p>
              <p><strong>Main / Branch:</strong> {readText(formData, ["businessOperationType"])}</p>
              <p><strong>Line of Business:</strong> {readText(formData, ["lineOfBusiness"])}</p>
            </div>
          </SectionCard>

          <SectionCard title="Address and Location" description="Filed address and map pin details.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Main Office Address:</strong> {readText(formData, ["mainOfficeAddress"])}</p>
              <p><strong>Main Office Zip Code:</strong> {readText(formData, ["mainOfficeZipCode"])}</p>
              <p><strong>Business Address:</strong> {readText(formData, ["businessAddress"])}</p>
              <p><strong>Business Zip Code:</strong> {readText(formData, ["businessZipCode"], "6118")}</p>
              <p><strong>Barangay:</strong> {readText(formData, ["barangay"])}</p>
              <p><strong>Street:</strong> {readText(formData, ["streetAddress"])}</p>
              <p><strong>Coordinates:</strong> {latitude != null && longitude != null ? `${latitude}, ${longitude}` : "-"}</p>
              <p><strong>Location Verification:</strong> {latitude != null && longitude != null ? "Location pinned" : "Location not pinned"}</p>
            </div>
          </SectionCard>

          <SectionCard title="Business Operation Details" description="Operational and property declarations.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Business Area:</strong> {readText(formData, ["businessArea"])}</p>
              <p><strong>Total Floor Area:</strong> {readText(formData, ["totalFloorArea"])}</p>
              <p><strong>Asset Size:</strong> {readText(formData, ["assetSize"])}</p>
              <p><strong>Property Ownership:</strong> {readText(formData, ["propertyOwnership"])}</p>
              <p><strong>Tax Declaration Number:</strong> {readText(formData, ["taxDeclarationNumber"])}</p>
              <p><strong>Property Identification Number:</strong> {readText(formData, ["propertyIdentificationNumber"])}</p>
              <p>
                <strong>Payment Receipt:</strong>{" "}
                {(() => {
                  const receiptDoc = (application.documents ?? []).find((d: any) =>
                    d.documentName?.toLowerCase().includes("payment receipt")
                  );
                  if (receiptDoc) {
                    return (
                      <a
                        href={`/api/applicant/applications/${application.id}/documents/${receiptDoc.id}/download`}
                        className="text-[var(--primary)] underline hover:text-[var(--primary-strong)]"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {receiptDoc.fileName || "View Uploaded Receipt"}
                      </a>
                    );
                  }
                  const receiptName = readText(formData, ["paymentReceiptFileName", "paymentReceipt"]);
                  return receiptName !== "-" ? receiptName : "None uploaded";
                })()}
              </p>
              <p><strong>Tax Incentives:</strong> {readText(formData, ["taxIncentives"])}</p>
              <p><strong>Market Business:</strong> {readFlag(formData, "isMarket")}</p>
              <p><strong>Agriculture-related:</strong> {readFlag(formData, "isAgriculture")}</p>
              <p><strong>Liquor/Tobacco:</strong> {readFlag(formData, "isLiquorOrTobacco")}</p>
            </div>
          </SectionCard>

          <SectionCard title="Employee Counts" description="Submitted staffing and vehicles declarations.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Total Employees:</strong> {readText(formData, ["totalEmployees"])}</p>
              <p><strong>Male Employees:</strong> {readText(formData, ["maleEmployees"])}</p>
              <p><strong>Female Employees:</strong> {readText(formData, ["femaleEmployees"])}</p>
              <p><strong>Employees within Municipality:</strong> {readText(formData, ["employeesWithinMunicipality"])}</p>
              <p><strong>Delivery Vehicles:</strong> {readText(formData, ["deliveryVehicles"])}</p>
            </div>
          </SectionCard>

          <SectionCard title="Application-specific Notes" description="Renewal and closure-specific submitted details.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Application Type:</strong> {application.applicationType}</p>

              {application.applicationType === "RENEWAL" ? (
                <p><strong>Renewal Payment Preference:</strong> {readText(formData, ["paymentFrequency"])}</p>
              ) : null}
              {application.applicationType === "NEW" ? (
                <p><strong>Capital Investment:</strong> {readText(formData, ["capitalInvestment"])}</p>
              ) : null}
              {application.applicationType === "RENEWAL" ? (
                <p><strong>Gross Profit:</strong> {readText(formData, ["grossProfit"])}</p>
              ) : null}
              {application.applicationType === "CLOSURE" ? (
                <>
                  <p>
                    <strong>Closure Type:</strong>{" "}
                    {application.closureType === "RETIREMENT"
                      ? "Retirement"
                      : application.closureType === "NON_COMPLIANT_RELATED"
                        ? "Non-compliant Related"
                        : application.closureType === "OTHERS"
                          ? application.closureTypeOtherReason?.trim()
                            ? `Others — ${application.closureTypeOtherReason.trim()}`
                            : "Others"
                          : "-"}
                  </p>
                  <p>
                    <strong>Line of Business:</strong>{" "}
                    {readText(formData, ["closureLineOfBusiness", "lineOfBusiness"])}
                  </p>
                  <p>
                    <strong>Business Activity:</strong>{" "}
                    {readText(formData, ["closureBusinessActivity", "businessActivity"])}
                  </p>
                  <p>
                    <strong>Last Date of Operation:</strong>{" "}
                    {readText(formData, ["closureLastDateOfOperation"])}
                  </p>
                </>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </SectionCard>

      <SectionCard title="History / Timeline" description="Recorded workflow activity and remarks.">
        <Timeline
          items={application.history.map((item: any) => ({
            id: item.id,
            title: `${item.fromStatus ? `${item.fromStatus} to ` : ""}${item.toStatus}`,
            description: `${item.actorName}${item.actorRole ? ` / ${item.actorRole}` : ""}${item.remarks ? ` - ${item.remarks}` : ""}`,
            timestamp: new Date(item.createdAt).toLocaleString("en-PH"),
            status: <StatusBadge status={item.toStatus as ApplicationStatus} />,
          }))}
          empty={<EmptyState title="No history yet" description="Status history will appear as this application is processed." />}
        />
      </SectionCard>
    </section>
  );
}

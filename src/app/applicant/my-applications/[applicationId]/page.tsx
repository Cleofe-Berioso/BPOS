import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveApplicantSessionContext } from "@/lib/applicant-api";
import { getApplicantApplicationDetail } from "@/lib/applications";
import { mapDocumentValidationStatusToUi, validationStatusBadgeClass } from "@/lib/document-validation";
import { StatusBadge } from "@/components/applicant/status-badge";
import { StatusTracker } from "@/components/applicant/status-tracker";
import {
  applicantListCardClass,
  applicantPanelClass,
  applicantSummaryLabelClass,
  applicantSummaryTileClass,
  applicantSummaryValueClass,
  applicantWarningPanelClass,
} from "@/components/applicant/applicant-ui-styles";
import { DetailHeader } from "@/components/ui/detail-header";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";
import { Timeline } from "@/components/ui/timeline";
import { DocumentDownloadButton } from "@/components/ui/document-download-button";
import { actionButtonStyles } from "@/components/ui/action-button";

interface PageProps {
  params: Promise<{ applicationId: string }>;
}

const formatUploadTimestamp = (date: string | Date | null | undefined) => {
  if (!date) return "Upload time unavailable";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
};

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

function formatBirthDate(value: string): string {
  if (!value || value === "-") return "-";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(parsed);
}

function getStatusSummary(status: string): { meaning: string; nextStep: string } {
  if (status === "Draft") {
    return {
      meaning: "Your application is saved as a draft and has not been submitted to BPLO yet.",
      nextStep: "Complete missing details, then submit when ready.",
    };
  }

  if (status === "Submitted") {
    return {
      meaning: "Your application has been submitted and is waiting in the BPLO queue.",
      nextStep: "Wait for BPLO to begin review.",
    };
  }

  if (status === "Under Review") {
    return {
      meaning: "BPLO is currently reviewing your submitted application.",
      nextStep: "Monitor this page for remarks or status updates.",
    };
  }

  if (status === "Assessed") {
    return {
      meaning: "BPLO assessment is complete and your application is being prepared for payment stage.",
      nextStep: "Wait for your Tax Order of Payment to become available.",
    };
  }

  if (status === "Approved for Payment") {
    return {
      meaning: "Your application is approved to proceed to payment.",
      nextStep: "Open your TOP and submit your payment reference after payment.",
    };
  }

  if (status === "Paid") {
    return {
      meaning: "Your payment was recorded and the application is moving to issuance processing.",
      nextStep: "Wait for BPLO permit or certificate preparation updates.",
    };
  }

  if (status === "For Release") {
    return {
      meaning: "Your permit or certificate is now in release stage.",
      nextStep: "Prepare to claim or complete the release follow-up as instructed.",
    };
  }

  if (status === "Released") {
    return {
      meaning: "Your permit or certificate has been released.",
      nextStep: "Submit or review Business Location details if required.",
    };
  }

  if (status === "Returned for Correction") {
    return {
      meaning: "BPLO returned your application for correction before it can continue.",
      nextStep: "Review remarks, update details or documents, and resubmit.",
    };
  }

  if (status === "Rejected") {
    return {
      meaning: "BPLO rejected this application record.",
      nextStep: "Review remarks for context and proceed based on guidance.",
    };
  }

  if (status === "Revocation Review") {
    return {
      meaning: "Your released permit is under revocation review following a non-compliant inspection.",
      nextStep: "Review the revocation notice below, contact BPLO immediately, and wait for the Department Head decision.",
    };
  }

  if (status === "Revoked") {
    return {
      meaning: "Your business permit has been revoked following the revocation review decision.",
      nextStep: "Review the revocation notice below and contact BPLO for compliance guidance and next steps.",
    };
  }

  return {
    meaning: "This application has an active workflow record.",
    nextStep: "Track updates in the history section.",
  };
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const authContext = await resolveApplicantSessionContext();
  if (!authContext.ok) notFound();

  const { applicationId } = await params;
  const application = await getApplicantApplicationDetail(authContext.applicantId, applicationId);
  if (!application) notFound();

  const formData = application.formData as Record<string, unknown>;
  const paymentReferencesRaw = Array.isArray((application.formData as Record<string, unknown>).paymentReferences)
    ? ((application.formData as Record<string, unknown>).paymentReferences as Array<Record<string, unknown>>)
    : [];
  const latestPayment = paymentReferencesRaw.length > 0 ? paymentReferencesRaw[paymentReferencesRaw.length - 1] : null;
  const statusSummary = getStatusSummary(application.status);

  const latestRemarkEntry = application.history.find(
    (item: any) => typeof item.remarks === "string" && item.remarks.trim().length > 0
  );
  const latestRevocationEntry = application.history.find(
    (item: any) => typeof item.remarks === "string" && /revoc/i.test(item.remarks)
  );
  const latestRevocationNotice = latestRevocationEntry?.remarks?.trim() ?? null;
  const latestBploRemarks = latestRemarkEntry?.remarks?.trim() ?? null;

  const showNextActionSection = [
    "Returned for Correction",
    "Approved for Payment",
    "For Release",
    "Released",
  ].includes(application.status);
  const ownerName = readText(formData, ["ownerName"]);
  const ownerFirstName = readText(formData, ["ownerFirstName"], "");
  const ownerMiddleName = readText(formData, ["ownerMiddleName"], "");
  const ownerSurname = readText(formData, ["ownerSurname"], "");

  const latitude = typeof formData.businessLatitude === "number" ? formData.businessLatitude : null;
  const longitude = typeof formData.businessLongitude === "number" ? formData.businessLongitude : null;
  const locationStatus = latitude != null && longitude != null ? "Location pinned" : "Location not pinned";

  return (
    <section className="ui-page-stack">
      <DetailHeader
        title="Application Detail"
        subtitle={application.applicationNumber}
        badge={<StatusBadge status={application.status} />}
        actions={
          <Link href="/applicant/my-applications" className={actionButtonStyles("secondary", "sm")}>
            Back to My Applications
          </Link>
        }
      />

      <SectionCard title="Status Summary" description={`Business: ${String(formData.businessName ?? "-")}`}>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className={`space-y-3 ${applicantPanelClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Current Status</p>
              <StatusBadge status={application.status} />
            </div>
            <p className="text-sm text-[var(--ink-muted)]">{statusSummary.meaning}</p>
            <p className="text-sm text-[var(--ink-muted)]">
              <span className="font-medium text-[var(--foreground)]">Expected next step:</span> {statusSummary.nextStep}
            </p>
          </div>
          <div className={`space-y-3 ${applicantPanelClass}`}>
            <p>
              <span className="font-medium text-[var(--foreground)]">Submitted:</span>{" "}
              {application.submittedAt ? new Date(application.submittedAt).toLocaleString("en-PH") : "-"}
            </p>
            <p>
              <span className="font-medium text-[var(--foreground)]">Last updated:</span>{" "}
              {new Date(application.updatedAt).toLocaleString("en-PH")}
            </p>
            <p>
              <span className="font-medium text-[var(--foreground)]">Application type:</span> {application.applicationType}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Status Workflow" description="Track current workflow progression for this application.">
        <StatusTracker status={application.status} />
      </SectionCard>

      {application.status === "Revocation Review" ? (
        <SectionCard title="Revocation Notice" description="Your permit is under revocation review.">
          <InfoBanner
            title="Permit revocation under review"
            description={
              latestRevocationNotice ??
              "Your released permit is under revocation review following a non-compliant inspection. Contact BPLO immediately and review the application history for details."
            }
            variant="warning"
          />
        </SectionCard>
      ) : null}

      {application.status === "Revoked" ? (
        <SectionCard title="Revocation Notice" description="Your business permit has been revoked.">
          <InfoBanner
            title="Business permit revoked"
            description={
              latestRevocationNotice ??
              "Your business permit has been revoked. Contact BPLO for guidance on compliance requirements and next steps."
            }
            variant="danger"
          />
        </SectionCard>
      ) : null}

      {showNextActionSection ? (
        <SectionCard title="Your Next Action" description="Guidance based on your current application status.">
          {application.status === "Returned for Correction" ? (
            <InfoBanner
              title="Correct and resubmit this application"
              description={
                latestBploRemarks
                  ? `BPLO remarks: ${latestBploRemarks}`
                  : "Review BPLO remarks, update your form and supporting documents, then resubmit."
              }
              variant="warning"
              action={
                <Link
                  href={`/applicant/application/${application.applicationType.toLowerCase()}?applicationId=${application.id}`}
                  className={actionButtonStyles("warning", "sm")}
                >
                  Correct and Resubmit
                </Link>
              }
            />
          ) : null}

          {application.status === "Approved for Payment" ? (
            <InfoBanner
              title="Proceed to payment step"
              description="Your Tax Order of Payment is available. Pay first, then submit your OR number or payment reference."
              variant="info"
              action={
                <Link href="/applicant/top" className={actionButtonStyles("primary", "sm")}>
                  View TOP / Payment
                </Link>
              }
            />
          ) : null}

          {application.status === "For Release" ? (
            <InfoBanner
              title="Waiting for release completion"
              description="Your permit or closure certificate is currently in release stage. No additional submission is required right now."
              variant="info"
            />
          ) : null}

          {application.status === "Released" ? (
            <InfoBanner
              title="Application completed"
              description="Your permit or closure certificate has been released. You may continue to Business Location if follow-up details are needed."
              variant="success"
              action={
                <div className="flex flex-wrap gap-2">
                  {application.applicationType !== "CLOSURE" &&
                  application.permitIssuance?.documentType === "BUSINESS_PERMIT" ? (
                    <Link
                      href={`/applicant/permits/${application.id}`}
                      className={actionButtonStyles("primary", "sm")}
                    >
                      View Business Permit Preview
                    </Link>
                  ) : null}
                  {application.applicationType === "CLOSURE" &&
                  application.permitIssuance?.documentType === "CLOSURE_CERTIFICATE" ? (
                    <Link
                      href={`/applicant/closure-certificates/${application.id}`}
                      className={actionButtonStyles("primary", "sm")}
                    >
                      Print Closure Certificate
                    </Link>
                  ) : null}
                </div>
              }
            />
          ) : null}
        </SectionCard>
      ) : null}

      {latestBploRemarks ? (
        <SectionCard title="BPLO Remarks" description="Latest remarks recorded for this application.">
          <div className={applicantWarningPanelClass}>
            <p className="text-sm leading-6 text-[var(--foreground)]">{latestBploRemarks}</p>
            {latestRemarkEntry?.createdAt ? (
              <p className="mt-2 ui-caption">
                Recorded on {new Date(latestRemarkEntry.createdAt).toLocaleString("en-PH")}
              </p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Submitted Information Snapshot" description="Read-only view of all filed information grouped for quick review.">
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Applicant / Owner Information" description="Filed owner identity and contact information.">
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
              <p><strong>Age:</strong> {readText(formData, ["ownerAge"])}</p>
              <p><strong>Birthdate:</strong> {formatBirthDate(readText(formData, ["birthDate"]))}</p>
              <p><strong>Sex:</strong> {readText(formData, ["sex"])}</p>
              <p><strong>Nationality:</strong> {readText(formData, ["nationality"])}</p>
              <p><strong>Email:</strong> {readText(formData, ["email"])}</p>
              <p><strong>Phone:</strong> {readText(formData, ["phone"])}</p>
            </div>
          </SectionCard>

          <SectionCard title="Business Identity" description="Registration and core business identification fields.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Business Name:</strong> {readText(formData, ["businessName"])}</p>
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

          <SectionCard title="Address and Location" description="Filed addresses and pinned map coordinates.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Main Office Address:</strong> {readText(formData, ["mainOfficeAddress"])}</p>
              <p><strong>Main Office Zip Code:</strong> {readText(formData, ["mainOfficeZipCode"])}</p>
              <p><strong>Business Address:</strong> {readText(formData, ["businessAddress"])}</p>
              <p><strong>Business Zip Code:</strong> {readText(formData, ["businessZipCode"], "6118")}</p>
              <p><strong>Barangay:</strong> {readText(formData, ["barangay"])}</p>
              <p><strong>Street:</strong> {readText(formData, ["streetAddress"])}</p>
              <p><strong>Coordinates:</strong> {latitude != null && longitude != null ? `${latitude}, ${longitude}` : "-"}</p>
              <p><strong>Location Verification:</strong> {locationStatus}</p>
            </div>
          </SectionCard>

          <SectionCard title="Business Operation Details" description="Operational and property-related declarations.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Business Area:</strong> {readText(formData, ["businessArea"])}</p>
              <p><strong>Total Floor Area:</strong> {readText(formData, ["totalFloorArea"])}</p>
              <p><strong>Asset Size:</strong> {readText(formData, ["assetSize"])}</p>
              <p><strong>Property Ownership:</strong> {readText(formData, ["propertyOwnership"])}</p>
              <p><strong>Tax Declaration Number:</strong> {readText(formData, ["taxDeclarationNumber"])}</p>
              <p><strong>Property Identification Number:</strong> {readText(formData, ["propertyIdentificationNumber"])}</p>
              <p><strong>Tax Incentives:</strong> {readText(formData, ["taxIncentives"])}</p>
              <p><strong>Market Business:</strong> {readFlag(formData, "isMarket")}</p>
              <p><strong>Agriculture-related:</strong> {readFlag(formData, "isAgriculture")}</p>
              <p><strong>Liquor/Tobacco:</strong> {readFlag(formData, "isLiquorOrTobacco")}</p>
            </div>
          </SectionCard>

          <SectionCard title="Employee Counts" description="Declared manpower and delivery headcount.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Total Employees:</strong> {readText(formData, ["totalEmployees"])}</p>
              <p><strong>Male Employees:</strong> {readText(formData, ["maleEmployees"])}</p>
              <p><strong>Female Employees:</strong> {readText(formData, ["femaleEmployees"])}</p>
              <p><strong>Employees within Municipality:</strong> {readText(formData, ["employeesWithinMunicipality"])}</p>
              <p><strong>Delivery Vehicles:</strong> {readText(formData, ["deliveryVehicles"])}</p>
            </div>
          </SectionCard>

          <SectionCard title="Application-specific Notes" description="Closure/renewal specific submitted details.">
            <div className="space-y-2 text-sm text-[var(--ink-muted)]">
              <p><strong>Application Type:</strong> {application.applicationType}</p>

              {application.applicationType === "RENEWAL" ? (
                <p><strong>Renewal Payment Preference:</strong> {readText(formData, ["paymentFrequency"])}</p>
              ) : null}
              {application.applicationType === "NEW" ? (
                <p><strong>Capital Investment:</strong> {readText(formData, ["capitalInvestment"])}</p>
              ) : null}
              {application.applicationType === "RENEWAL" ? (
                <p><strong>Gross Profit / Gross Receipts:</strong> {readText(formData, ["grossProfit"])}</p>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </SectionCard>

      <SectionCard title="Documents" description="Submitted requirements attached to this application.">
        <ul className="space-y-2 text-sm text-[var(--ink-muted)]">
          {application.documents.map((doc: any) => {
            const validationStatus = mapDocumentValidationStatusToUi(doc.validationStatus);
            return (
            <li key={doc.id} className={`flex flex-wrap items-center justify-between gap-2 ${applicantListCardClass} px-3 py-3`}>
              <div>
                <p className="font-medium text-[var(--foreground)]">
                  {doc.documentName}: {doc.fileName}
                </p>
                <p className="mt-1 ui-caption">
                  Uploaded: {formatUploadTimestamp(doc.uploadedAt)}
                </p>
                <p className="mt-1">
                  <span
                    className={`ui-badge ${validationStatusBadgeClass(validationStatus)}`}
                  >
                    {validationStatus}
                  </span>
                </p>
                {doc.validationRemarks ? (
                  <p className="mt-2 ui-caption">
                    <span className="font-semibold text-[var(--foreground)]">Reviewer remarks:</span> {doc.validationRemarks}
                  </p>
                ) : null}
              </div>
              <DocumentDownloadButton
                url={`/api/applicant/applications/${application.id}/documents/${doc.id}/download`}
                fileName={doc.fileName || doc.documentName || "document"}
              />
            </li>
          );
          })}
          {application.documents.length === 0 ? (
            <li>
              <EmptyState
                title="No uploaded documents"
                description="No records available yet for this application."
              />
            </li>
          ) : null}
        </ul>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="TOP / Payment" description="Current payment reference details in this application record.">
          {latestPayment ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Reference Number</p>
                <p className={applicantSummaryValueClass}>{String(latestPayment.transactionNumber ?? "-")}</p>
              </div>
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Payment Status</p>
                <p className={applicantSummaryValueClass}>{String(latestPayment.status ?? "-")}</p>
              </div>
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Amount Paid</p>
                <p className={applicantSummaryValueClass}>
                  {typeof latestPayment.amountPaid === "number"
                    ? `P ${latestPayment.amountPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                    : "-"}
                </p>
              </div>
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Reviewed At</p>
                <p className={applicantSummaryValueClass}>
                  {latestPayment.reviewedAt ? new Date(String(latestPayment.reviewedAt)).toLocaleString("en-PH") : "-"}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No payment reference yet"
              description="No action is required right now. TOP and payment reference details appear after BPLO assessment."
            />
          )}
        </SectionCard>

        <SectionCard title="Permit / Release" description="Permit and release information, if issuance has been completed.">
          {application.permitIssuance ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Document Type</p>
                <p className={applicantSummaryValueClass}>{application.permitIssuance.documentType}</p>
              </div>
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Document Number</p>
                <p className={applicantSummaryValueClass}>{application.permitIssuance.documentNumber}</p>
              </div>
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Issued At</p>
                <p className={applicantSummaryValueClass}>{new Date(application.permitIssuance.issuedAt).toLocaleString("en-PH")}</p>
              </div>
              <div className={applicantSummaryTileClass}>
                <p className={applicantSummaryLabelClass}>Released At</p>
                <p className={applicantSummaryValueClass}>{application.permitIssuance.releasedAt ? new Date(application.permitIssuance.releasedAt).toLocaleString("en-PH") : "-"}</p>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No permit record yet"
              description="Permit or closure certificate metadata appears after BPLO preparation and release stages."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Timeline / History" description="Status and remarks recorded as the application moves through workflow.">
        <Timeline
          items={application.history.map((item: any) => ({
            id: item.id,
            title: `${item.fromStatus ? `${item.fromStatus} to ` : ""}${item.toStatus}`,
            description: item.remarks ?? "No remarks provided.",
            timestamp: new Date(item.createdAt).toLocaleString("en-PH"),
            status: <StatusBadge status={item.toStatus} />,
          }))}
          empty={<EmptyState title="No history yet" description="Status history will appear as this application is processed." />}
        />
      </SectionCard>
    </section>
  );
}

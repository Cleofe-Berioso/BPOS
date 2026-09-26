import Link from "next/link";
import { notFound } from "next/navigation";
import {
  superadminDocumentCardClass,
  superadminReadOnlyFieldClass,
  superadminStatusPillClass,
  superadminSummaryLabelClass,
  superadminSummaryTileClass,
  superadminSummaryValueClass,
} from "@/components/superadmin/superadmin-ui-styles";
import { DetailHeader } from "@/components/ui/detail-header";
import { EmptyState } from "@/components/ui/empty-state";
import { RoleBadge } from "@/components/ui/role-badge";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";
import { actionButtonStyles } from "@/components/ui/action-button";
import type { ApplicationStatus } from "@/lib/applicant-types";
import { getSuperAdminApplicationDetail } from "@/lib/superadmin-data";

interface PageProps {
  params: Promise<{ applicationId: string }>;
}

function currency(value: number) {
  return `P ${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function smallPill(label: string, tone: "muted" | "success" | "warning" | "danger" = "muted") {
  return <span className={superadminStatusPillClass(tone)}>{label}</span>;
}

function labelValue(label: string, value: string) {
  return (
    <div>
      <p className={superadminReadOnlyFieldClass}>{label}</p>
      <p className={superadminSummaryValueClass}>{value}</p>
    </div>
  );
}

export default async function SuperAdminApplicationDetailPage({ params }: PageProps) {
  const { applicationId } = await params;
  const app = await getSuperAdminApplicationDetail(applicationId);
  if (!app) notFound();

  const latestRemark = app.history.find(
    (item) => typeof item.remarks === "string" && item.remarks.trim().length > 0
  );

  return (
    <section className="ui-page-stack">
      <DetailHeader
        title="Application Audit Detail"
        subtitle="Read-only audit view of the selected application for monitoring and compliance."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Audit View Only" />}
        actions={
          <Link href="/superadmin/applications" className={actionButtonStyles("secondary", "sm")}>
            Back to Applications
          </Link>
        }
      />

      <SectionCard
        title="Application Summary"
        description={app.application.applicationNumber}
        action={<StatusBadge status={app.application.status as ApplicationStatus} />}
      >
        <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          <div className={superadminSummaryTileClass}>
            <p className={superadminSummaryLabelClass}>Application Number</p>
            <p className={superadminSummaryValueClass}>{app.application.applicationNumber}</p>
          </div>
          <div className={superadminSummaryTileClass}>
            <p className={superadminSummaryLabelClass}>Business Name</p>
            <p className={superadminSummaryValueClass}>{app.businessInfo.businessName}</p>
          </div>
          <div className={superadminSummaryTileClass}>
            <p className={superadminSummaryLabelClass}>Applicant</p>
            <p className={superadminSummaryValueClass}>{app.applicant.name}</p>
            <p className="ui-caption">{app.applicant.email}</p>
          </div>
          <div className={superadminSummaryTileClass}>
            <p className={superadminSummaryLabelClass}>Application Type</p>
            <p className={superadminSummaryValueClass}>{app.application.applicationType}</p>
          </div>
          <div className={superadminSummaryTileClass}>
            <p className={superadminSummaryLabelClass}>Date Submitted</p>
            <p className={superadminSummaryValueClass}>
              {app.application.submittedAt
                ? new Date(app.application.submittedAt).toLocaleString("en-PH")
                : "-"}
            </p>
          </div>
          <div className={superadminSummaryTileClass}>
            <p className={superadminSummaryLabelClass}>Current Status</p>
            <div className="mt-1">
              <StatusBadge status={app.application.status as ApplicationStatus} />
            </div>
          </div>
          <div className={superadminSummaryTileClass}>
            <p className={superadminSummaryLabelClass}>Last Updated</p>
            <p className={superadminSummaryValueClass}>
              {new Date(app.application.updatedAt).toLocaleString("en-PH")}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Status Timeline / History"
        description="Recorded workflow activity for read-only monitoring and audit review."
      >
        <Timeline
          items={app.history.map((item) => ({
            id: item.id,
            title: `${item.fromStatus ? `${item.fromStatus} to ` : ""}${item.toStatus}`,
            description: `${item.actorEmail ? item.actorEmail : "System"}${item.remarks ? ` - ${item.remarks}` : ""}`,
            timestamp: new Date(item.createdAt).toLocaleString("en-PH"),
            status:
              item.actorRole === "APPLICANT" ||
              item.actorRole === "BPLO" ||
              item.actorRole === "SUPER_ADMIN" ? (
                <RoleBadge roleType={item.actorRole} />
              ) : (
                smallPill(item.actorRole ?? "SYSTEM")
              ),
          }))}
          empty={
            <EmptyState
              title="No history records"
              description="This section will populate as workflow events are recorded."
            />
          }
        />
      </SectionCard>

      <SectionCard title="Remarks" description="Latest BPLO remarks and activity context.">
        {latestRemark ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--warning-soft)] p-3.5 sm:p-4">
            <p className="text-sm text-[var(--foreground)]">{latestRemark.remarks}</p>
            <p className="mt-2 ui-caption">
              {latestRemark.actorEmail ? latestRemark.actorEmail : "System"}
              {latestRemark.actorRole ? ` / ${latestRemark.actorRole}` : ""} - {new Date(latestRemark.createdAt).toLocaleString("en-PH")}
            </p>
          </div>
        ) : (
          <EmptyState
            title="No remarks recorded"
            description="Remarks will appear here when activity notes are added during workflow processing."
          />
        )}
      </SectionCard>

      <SectionCard title="Documents" description="Uploaded files and document metadata for audit review.">
        {app.documents.length === 0 ? (
          <EmptyState
            title="No documents uploaded"
            description="This section will populate as application documents are uploaded and processed."
          />
        ) : (
          <div className="grid gap-3">
            {app.documents.map((doc) => {
              const validationStatus = doc.validationStatus ?? "Pending Review";
              return (
              <div key={doc.id} className={superadminDocumentCardClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{doc.documentName}</p>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">{doc.fileName}</p>
                    <p className="mt-1 ui-caption">Validation: {validationStatus}</p>
                    {doc.validationRemarks ? (
                      <p className="mt-1 ui-caption">Remarks: {doc.validationRemarks}</p>
                    ) : null}
                  </div>
                  <a
                    href={`/api/superadmin/applications/${app.application.id}/documents/${doc.id}/preview`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={actionButtonStyles("secondary", "sm")}
                  >
                    Preview
                  </a>
                </div>
                <p className="mt-2 ui-caption">
                  {doc.mimeType} • {doc.sizeBytes.toLocaleString("en-PH")} bytes •{" "}
                  {new Date(doc.uploadedAt).toLocaleString("en-PH")}
                </p>
              </div>
            );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Full Application Details" description="Complete filed business information captured during application.">
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Applicant Information" description="Account and contact details linked to this application.">
            <div className="grid gap-4">
              {labelValue("Applicant Name", app.applicant.name)}
              {labelValue("Applicant Email", app.applicant.email)}
            </div>
          </SectionCard>

          <SectionCard title="Applicant / Owner Information" description="Submitted owner identity and contact details.">
            <div className="grid gap-4 md:grid-cols-2">
              {labelValue("Owner First Name", app.businessInfo.ownerFirstName)}
              {labelValue("Owner Middle Name", app.businessInfo.ownerMiddleName)}
              {labelValue("Owner Surname", app.businessInfo.ownerSurname)}
              {labelValue("Owner / President Name", app.businessInfo.ownerName)}
              {labelValue("Owner Age", app.businessInfo.ownerAge)}
              {labelValue("Sex", app.businessInfo.sex)}
              {labelValue("Nationality", app.businessInfo.nationality)}
              {labelValue("Business Email", app.businessInfo.email)}
              {labelValue("Phone", app.businessInfo.phone)}
            </div>
          </SectionCard>

          <SectionCard title="Business Identity" description="Submitted business identity and registration details.">
            <div className="grid gap-4 md:grid-cols-2">
              {labelValue("Business Name", app.businessInfo.businessName)}
              {labelValue("Trade Name", app.businessInfo.tradeName)}
              {labelValue("Business Type", app.businessInfo.businessType)}
              {labelValue("Registration Type", app.businessInfo.businessType)}
              {labelValue("Registration Number", app.businessInfo.registrationNumber)}
              {labelValue("TIN", app.businessInfo.tin)}
              {labelValue("Business Activity", app.businessInfo.businessActivity)}
              {labelValue("Main / Branch", app.businessInfo.businessOperationType)}
              {labelValue("Line of Business", app.businessInfo.lineOfBusiness)}
            </div>
          </SectionCard>

          <SectionCard title="Address and Location" description="Submitted address and location fields.">
            <div className="grid gap-4 md:grid-cols-2">
              {labelValue("Main Office Address", app.businessInfo.mainOfficeAddress)}
              {labelValue("Business Address", app.businessInfo.businessAddress)}
              {labelValue("Barangay", app.businessInfo.barangay)}
              {labelValue("Street", app.businessInfo.streetAddress)}
              {labelValue("Latitude", app.businessInfo.businessLatitude)}
              {labelValue("Longitude", app.businessInfo.businessLongitude)}
              {labelValue(
                "Location Verification",
                app.businessInfo.businessLatitude !== "-" && app.businessInfo.businessLongitude !== "-"
                  ? "Location pinned"
                  : "Location not pinned"
              )}
            </div>
          </SectionCard>

          <SectionCard title="Business Operation Details" description="Operational and property declarations.">
            <div className="grid gap-4 md:grid-cols-2">
              {labelValue("Business Area", app.businessInfo.businessArea)}
              {labelValue("Total Floor Area", app.businessInfo.totalFloorArea)}
              {labelValue("Asset Size", app.businessInfo.assetSize)}
              {labelValue("Property Ownership", app.businessInfo.propertyOwnership)}
              {labelValue("Tax Declaration Number", app.businessInfo.taxDeclarationNumber)}
              {labelValue("Property Identification Number", app.businessInfo.propertyIdentificationNumber)}
              {labelValue("OR Number", app.businessInfo.orNumber)}
              {labelValue("Tax Incentives", app.businessInfo.taxIncentives)}
              {labelValue("Market Business", app.businessInfo.isMarket)}
              {labelValue("Agriculture-related", app.businessInfo.isAgriculture)}
              {labelValue("Liquor/Tobacco", app.businessInfo.isLiquorOrTobacco)}
            </div>
          </SectionCard>

          <SectionCard title="Employee Counts" description="Staffing and delivery declarations.">
            <div className="grid gap-4 md:grid-cols-2">
              {labelValue("Total Employees", app.businessInfo.totalEmployees)}
              {labelValue("Male Employees", app.businessInfo.maleEmployees)}
              {labelValue("Female Employees", app.businessInfo.femaleEmployees)}
              {labelValue("Employees within Municipality", app.businessInfo.employeesWithinMunicipality)}
              {labelValue("Delivery Vehicles", app.businessInfo.deliveryVehicles)}
            </div>
          </SectionCard>

          <SectionCard title="Application-specific Notes" description="Renewal and closure specific fields.">
            <div className="grid gap-4 md:grid-cols-2">
              {labelValue("Application Type", app.application.applicationType)}
              {labelValue("Payment Preference", app.businessInfo.paymentFrequency)}
              {app.application.applicationType === "CLOSURE"
                ? labelValue("Closure Reason", app.businessInfo.closureReason)
                : null}
            </div>
          </SectionCard>
        </div>
      </SectionCard>

      <SectionCard title="Audit Log" description="Assessment, payment, and permit issuance records for compliance review.">
        <div className="grid gap-4">
          <SectionCard
            title="Fee Assessment / TOP"
            description="Assessment output and tax order of payment details generated in the BPLO flow."
            action={
              app.feeAssessment.status
                ? smallPill(
                    app.feeAssessment.status,
                    app.feeAssessment.status === "GENERATED" ? "success" : "warning"
                  )
                : undefined
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              {labelValue("TOP Number", app.feeAssessment.assessmentNumber ?? "-")}
              {labelValue("Mode of Payment", app.feeAssessment.paymentFrequency ?? "-")}
              {labelValue("Total Amount", currency(app.feeAssessment.totalAmount))}
              {labelValue("Generated At", app.feeAssessment.generatedAt ? new Date(app.feeAssessment.generatedAt).toLocaleString("en-PH") : "-")}
              {labelValue("Mayor's Permit Fee", currency(app.feeAssessment.mayorsPermitFee))}
              {labelValue("Regulatory Fees", currency(app.feeAssessment.regulatoryFees))}
              {labelValue("Additional Charges", currency(app.feeAssessment.additionalCharges))}
              {labelValue("Penalties", currency(app.feeAssessment.penalties))}
              {labelValue("Surcharge", currency(app.feeAssessment.surcharge))}
              {labelValue("Interest", currency(app.feeAssessment.interest))}
              {labelValue("Closure Certificate Fee", currency(app.feeAssessment.closureCertificateFee))}
              {labelValue("Arrears", currency(app.feeAssessment.arrears))}
              {labelValue("Other Charges", currency(app.feeAssessment.otherCharges))}
              {labelValue("Remarks", app.feeAssessment.remarks ?? "-")}
            </div>
          </SectionCard>

          <SectionCard title="Payment Reference" description="Latest payment submission and verification outcome linked to this application.">
            {app.paymentReference ? (
              <div className="grid gap-4 md:grid-cols-2">
                {labelValue("Reference Number", app.paymentReference.transactionNumber)}
                <div>
                  <p className={superadminReadOnlyFieldClass}>Payment Status</p>
                  <div className="mt-1">
                    {smallPill(
                      app.paymentReference.status,
                      app.paymentReference.status === "VERIFIED"
                        ? "success"
                        : app.paymentReference.status === "REJECTED"
                          ? "danger"
                          : "warning"
                    )}
                  </div>
                </div>
                {labelValue("Amount Paid", currency(app.paymentReference.amountPaid))}
                {labelValue("Submitted At", new Date(app.paymentReference.submittedAt).toLocaleString("en-PH"))}
                {labelValue(
                  "Reviewed At",
                  app.paymentReference.reviewedAt
                    ? new Date(app.paymentReference.reviewedAt).toLocaleString("en-PH")
                    : "-"
                )}
                {labelValue("Reviewer Remarks", app.paymentReference.reviewerRemarks ?? "-")}
              </div>
            ) : (
              <EmptyState
                title="No payment reference recorded"
                description="This section will populate after the applicant submits a payment reference."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Permit Issuance Status"
            description="Read-only permit or closure certificate metadata from the issuance stage."
          >
            {app.permitIssuance ? (
              <div className="grid gap-4 md:grid-cols-2">
                {labelValue("Document Type", app.permitIssuance.documentType)}
                {labelValue("Document Number", app.permitIssuance.documentNumber)}
                <div>
                  <p className={superadminReadOnlyFieldClass}>Issuance Status</p>
                  <div className="mt-1">
                    {smallPill(
                      app.permitIssuance.status,
                      app.permitIssuance.status === "RELEASED"
                        ? "success"
                        : app.permitIssuance.status === "FOR_RELEASE"
                          ? "warning"
                          : "muted"
                    )}
                  </div>
                </div>
                {labelValue("Issued At", new Date(app.permitIssuance.issuedAt).toLocaleString("en-PH"))}
                {labelValue(
                  "Released At",
                  app.permitIssuance.releasedAt
                    ? new Date(app.permitIssuance.releasedAt).toLocaleString("en-PH")
                    : "-"
                )}
                {labelValue("Prepared By", app.permitIssuance.preparedBy ?? "-")}
                {labelValue("Released By", app.permitIssuance.releasedBy ?? "-")}
                {labelValue("Remarks", app.permitIssuance.remarks ?? "-")}
              </div>
            ) : (
              <EmptyState
                title="No permit issuance record"
                description="This section will populate after the application reaches permit preparation and release."
              />
            )}
          </SectionCard>
        </div>
      </SectionCard>
    </section>
  );
}

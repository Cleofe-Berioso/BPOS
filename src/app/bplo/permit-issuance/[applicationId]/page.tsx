import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBploSession } from "@/lib/bplo-api";
import {
  getPermitIssuanceDetail,
  preparePermitIssuance,
  releasePermitIssuance,
} from "@/lib/bplo-permit-issuance";
import { canBploPrintDocument, getPrintableDocumentType } from "@/lib/printable-documents";
import {
  bploHighlightPanelClass,
  bploPanelClass,
  bploSummaryLabelClass,
  bploSummaryTileClass,
  bploSummaryValueClass,
} from "@/components/bplo/bplo-ui-styles";
import { mapPaymentStatusToUi } from "@/lib/application-mappers";
import { DetailHeader } from "@/components/ui/detail-header";
import { InfoBanner } from "@/components/ui/info-banner";
import { RoleBadge } from "@/components/ui/role-badge";
import { SectionCard } from "@/components/ui/section-card";
import { actionButtonStyles } from "@/components/ui/action-button";

interface PageProps {
  params: Promise<{ applicationId: string }>;
  searchParams?: Promise<{ action?: string }>;
}

function dateOnly(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-PH");
}

function money(value: number): string {
  return `₱ ${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function SummaryTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className={bploSummaryTileClass}>
      <p className={bploSummaryLabelClass}>{label}</p>
      <p className={bploSummaryValueClass}>{value}</p>
      {helper ? <p className="mt-1 ui-caption">{helper}</p> : null}
    </div>
  );
}

export default async function PermitIssuanceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const session = await requireBploSession();
  if (!session) notFound();

  const { applicationId } = await params;
  const qp = searchParams ? await searchParams : {};

  let actionError: string | null = null;
  if (qp.action === "prepare") {
    try {
      await preparePermitIssuance(applicationId, session.user.id, "Prepared via detail action");
    } catch (err) {
      actionError = err instanceof Error ? err.message : "Unable to prepare permit issuance.";
    }
  }

  if (qp.action === "release") {
    try {
      await releasePermitIssuance(applicationId, session.user.id, "Released via detail action");
    } catch (err) {
      actionError = err instanceof Error ? err.message : "Unable to release permit.";
    }
  }

  const detail = await getPermitIssuanceDetail(applicationId);
  if (!detail) notFound();

  const isReleased = detail.application.rawStatus === "RELEASED";
  if (isReleased) {
    actionError = null;
  }

  const printEligibility = canBploPrintDocument({
    id: detail.application.id,
    applicantId: "bplo-context",
    applicationType: detail.application.applicationType,
    status: detail.application.rawStatus,
    permitIssuance: {
      id: detail.issuance.id,
      documentNumber: detail.issuance.documentNumber,
      status: detail.issuance.status,
    },
    payment: {
      hasVerifiedPaymentReference:
        isReleased || detail.paymentSummary.paymentVerificationStatus === "VERIFIED",
    },
  });
  const printableType = getPrintableDocumentType(detail.application.applicationType);
  const isBusinessPermit = printableType === "BUSINESS_PERMIT";
  const isClosureCertificate = printableType === "BUSINESS_CLOSURE_CERTIFICATE";

  return (
    <section className="ui-page-stack">
      <DetailHeader
        title="Permit Issuance Detail"
        subtitle={detail.application.applicationNumber}
        badge={<RoleBadge roleType="BPLO" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {printEligibility.canPrint && isBusinessPermit ? (
              <Link
                href={`/bplo/permit-issuance/${detail.application.id}/print`}
                className={actionButtonStyles("primary", "sm")}
              >
                Print Permit
              </Link>
            ) : null}
            {printEligibility.canPrint && isClosureCertificate ? (
              <Link
                href={`/bplo/permit-issuance/${detail.application.id}/closure-print`}
                className={actionButtonStyles("primary", "sm")}
              >
                Print Certificate
              </Link>
            ) : null}
            <Link href="/bplo/permit-issuance" className={actionButtonStyles("secondary", "sm")}>
              Back to Permit Issuance
            </Link>
          </div>
        }
      />

      {actionError ? (
        <InfoBanner
          title="Permit action could not be completed"
          description={actionError}
          variant="danger"
        />
      ) : null}

      <InfoBanner
        title={`Current workflow status: ${detail.application.status}`}
        variant={detail.application.rawStatus === "RELEASED" ? "success" : detail.application.rawStatus === "FOR_RELEASE" ? "warning" : "info"}
      />

      <SectionCard title="Application Summary" description={`${detail.application.businessName} • ${detail.application.applicationType}`}>
        <div className="grid gap-2 text-sm text-[var(--ink-muted)] md:grid-cols-2">
          <p>Application Number: <strong>{detail.application.applicationNumber}</strong></p>
          <p>Application Type: <strong>{detail.application.applicationType}</strong></p>
          <p>Current Status: <strong>{detail.application.status}</strong></p>
          <p>Applicant: <strong>{detail.application.applicantName}</strong> ({detail.application.applicantEmail})</p>
          <p>Business Name: <strong>{detail.application.businessName}</strong></p>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Business Information">
          <div className="grid gap-2 text-sm text-[var(--ink-muted)] md:grid-cols-2">
            <p>Business Type: <strong>{detail.businessInfo.businessType}</strong></p>
            <p>Registration Number: <strong>{detail.businessInfo.registrationNumber}</strong></p>
            <p>TIN: <strong>{detail.businessInfo.tin}</strong></p>
            <p>Business Name: <strong>{detail.businessInfo.businessName}</strong></p>
            <p>Trade Name: <strong>{detail.businessInfo.tradeName}</strong></p>
            <p>Owner / President: <strong>{detail.businessInfo.ownerName}</strong></p>
            <p className="md:col-span-2">Business Address: <strong>{detail.businessInfo.businessAddress}</strong></p>
          </div>
        </SectionCard>

        <SectionCard title="Payment Summary">
          <div className="grid gap-2 text-sm text-[var(--ink-muted)] md:grid-cols-2">
            <p>TOP Number: <strong>{detail.paymentSummary.topNumber ?? "-"}</strong></p>
            <p>Total Amount Paid: <strong>{money(detail.paymentSummary.totalAmountPaid)}</strong></p>
            <p>Payment Ref / OR: <strong>{detail.paymentSummary.paymentReferenceNumber ?? "-"}</strong></p>
            <p>Payment Verification: <strong>{mapPaymentStatusToUi(detail.paymentSummary.paymentVerificationStatus)}</strong></p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Generated Document Preview" description={detail.preview.subtitle}>
        <div className={`${bploHighlightPanelClass} border-[var(--info)] bg-[var(--info-soft)]`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-[var(--foreground)]">{detail.preview.title}</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {detail.issuance.documentNumber
                  ? `Document No.: ${detail.issuance.documentNumber} • Status: ${detail.issuance.status ?? detail.application.status}`
                  : "Preview document details and output before printing."}
              </p>
            </div>
            {isBusinessPermit && printEligibility.canPrint ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/bplo/permit-issuance/${detail.application.id}/print`}
                  className={actionButtonStyles("primary", "sm")}
                >
                  Print Permit
                </Link>
                <Link
                  href={`/bplo/permit-issuance/${detail.application.id}/print`}
                  className={actionButtonStyles("secondary", "sm")}
                >
                  View Permit Preview
                </Link>
              </div>
            ) : null}
            {isClosureCertificate && printEligibility.canPrint ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/bplo/permit-issuance/${detail.application.id}/closure-print`}
                  className={actionButtonStyles("primary", "sm")}
                >
                  Print Certificate
                </Link>
                <Link
                  href={`/bplo/permit-issuance/${detail.application.id}/closure-print`}
                  className={actionButtonStyles("secondary", "sm")}
                >
                  View Certificate Preview
                </Link>
              </div>
            ) : null}
          </div>

          {detail.issuance.documentNumber ? (
            <div className="mt-4 grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--surface)] p-3 text-xs sm:grid-cols-2 md:grid-cols-4">
              <div>
                <span className="font-semibold text-[var(--ink-muted)]">Permit Number</span>
                <p className="font-mono text-sm font-bold text-[var(--foreground)]">{detail.issuance.documentNumber}</p>
              </div>
              <div>
                <span className="font-semibold text-[var(--ink-muted)]">Business Name</span>
                <p className="font-medium text-[var(--foreground)]">{detail.application.businessName}</p>
              </div>
              <div>
                <span className="font-semibold text-[var(--ink-muted)]">Document Type</span>
                <p className="font-medium text-[var(--foreground)]">{detail.issuance.documentType ?? "-"}</p>
              </div>
              <div>
                <span className="font-semibold text-[var(--ink-muted)]">Validity Period</span>
                <p className="font-medium text-[var(--foreground)]">{detail.issuance.validityPeriod ?? "-"}</p>
              </div>
            </div>
          ) : null}

          {isBusinessPermit && !printEligibility.canPrint ? (
            <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
              Print permit option will be enabled as soon as the permit is prepared and issued.
            </p>
          ) : null}
          {isClosureCertificate && !printEligibility.canPrint ? (
            <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
              Print certificate option will be enabled as soon as the certificate is prepared and issued.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Permit / Certificate Metadata">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Document Type" value={detail.issuance.documentType ?? "-"} />
          <SummaryTile label="Permit / Certificate Number" value={detail.issuance.documentNumber ?? "-"} />
          <SummaryTile label="Issue Date" value={dateOnly(detail.issuance.issueDate)} />
          <SummaryTile label="Validity Period" value={detail.issuance.validityPeriod ?? "-"} />
          <SummaryTile label="Prepared By" value={detail.issuance.preparedBy ?? "-"} />
          <SummaryTile label="Released Date" value={dateOnly(detail.issuance.releasedDate)} />
          <SummaryTile label="Released By" value={detail.issuance.releasedBy ?? "-"} />
          <SummaryTile label="Issuance Status" value={detail.issuance.status ?? "-"} />
          <div className={`${bploPanelClass} md:col-span-2 xl:col-span-4`}>
            <p className={bploSummaryLabelClass}>Remarks</p>
            <p className={bploSummaryValueClass}>{detail.issuance.remarks ?? "-"}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Issuance Actions" description="Use the next available issuance step shown below. Existing permit issuance route behavior remains unchanged.">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="grid gap-3">
            <SummaryTile
              label="Current Workflow State"
              value={detail.application.status}
              helper="Determines which permit issuance action is currently available."
            />
            <SummaryTile
              label="Document Type"
              value={detail.issuance.documentType ?? "-"}
              helper="Set automatically by the existing issuance logic."
            />
            <SummaryTile
              label="Payment Verification"
              value={mapPaymentStatusToUi(detail.paymentSummary.paymentVerificationStatus)}
              helper="Reference point before prepare or release."
            />
          </div>

          <div className="space-y-4">
            <InfoBanner
              title="Action panel"
              description="Only the next valid action is shown according to the current application status."
              variant="readOnly"
            />

            {detail.application.rawStatus === "PAID" ? (
              <>
                <InfoBanner
                  title="Ready for preparation"
                  description="Preparing will create or update the permit or certificate record and move the application to For Release under the existing workflow."
                  variant="info"
                />
                <form method="get" className="flex flex-wrap gap-2">
                  <input type="hidden" name="action" value="prepare" />
                  <button type="submit" className={actionButtonStyles("primary", "md")}>
                    {detail.application.applicationType === "CLOSURE"
                      ? "Prepare Certificate"
                      : "Prepare Permit"}
                  </button>
                </form>
              </>
            ) : null}

            {detail.application.rawStatus === "FOR_RELEASE" ? (
              <>
                <InfoBanner
                  title="Ready for release"
                  description="The permit has been prepared and issued. You may view and print the permit, or officially mark it released."
                  variant="warning"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <form method="get">
                    <input type="hidden" name="action" value="release" />
                    <button type="submit" className={actionButtonStyles("warning", "md")}>
                      Release Permit
                    </button>
                  </form>
                  {isBusinessPermit && printEligibility.canPrint ? (
                    <Link
                      href={`/bplo/permit-issuance/${detail.application.id}/print`}
                      className={actionButtonStyles("primary", "md")}
                    >
                      Print Permit
                    </Link>
                  ) : null}
                  {isClosureCertificate && printEligibility.canPrint ? (
                    <Link
                      href={`/bplo/permit-issuance/${detail.application.id}/closure-print`}
                      className={actionButtonStyles("primary", "md")}
                    >
                      Print Certificate
                    </Link>
                  ) : null}
                </div>
              </>
            ) : null}

            {detail.application.rawStatus === "RELEASED" ? (
              <>
                <InfoBanner
                  title="Permit released"
                  description="This permit has been officially released. You may view or print the official permit at any time."
                  variant="success"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {isBusinessPermit && printEligibility.canPrint ? (
                    <Link
                      href={`/bplo/permit-issuance/${detail.application.id}/print`}
                      className={actionButtonStyles("primary", "md")}
                    >
                      Print Permit
                    </Link>
                  ) : null}
                  {isClosureCertificate && printEligibility.canPrint ? (
                    <Link
                      href={`/bplo/permit-issuance/${detail.application.id}/closure-print`}
                      className={actionButtonStyles("primary", "md")}
                    >
                      Print Certificate
                    </Link>
                  ) : null}
                </div>
              </>
            ) : null}

            {detail.application.rawStatus !== "PAID" &&
            detail.application.rawStatus !== "FOR_RELEASE" &&
            detail.application.rawStatus !== "RELEASED" ? (
              <InfoBanner
                title="No action is required right now"
                description="This application will show the next issuance button only when it reaches the proper workflow stage."
                variant="readOnly"
              />
            ) : null}
          </div>
        </div>
      </SectionCard>
    </section>
  );
}

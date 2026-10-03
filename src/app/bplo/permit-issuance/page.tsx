import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBploSession } from "@/lib/bplo-api";
import { listPermitIssuanceBucketPaginated } from "@/lib/bplo-permit-issuance";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveDataTable } from "@/components/ui/responsive-data-table";
import { RoleBadge } from "@/components/ui/role-badge";
import { actionButtonStyles } from "@/components/ui/action-button";
import {
  bploEmptyStateClass,
  bploMobileRecordCardClass,
  bploTableClass,
  bploTypeBadgeClass,
  paymentStatusBadgeClass,
} from "@/components/bplo/bplo-ui-styles";
import { mapPaymentStatusToUi } from "@/lib/application-mappers";

const TYPE_LABEL: Record<string, string> = {
  NEW: "New",
  RENEWAL: "Renewal",
  CLOSURE: "Closure",
};

function dateOnly(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-PH");
}

interface PageProps {
  searchParams: Promise<{
    pageSize?: string;
    blockedPage?: string;
    paidPage?: string;
    forReleasePage?: string;
    releasedPage?: string;
  }>;
}

export default async function BploPermitIssuancePage({ searchParams }: PageProps) {
  const session = await requireBploSession();
  if (!session) notFound();

  const params = await searchParams;
  const pagination = { pageSize: params.pageSize };

  const [blockedResult, paidResult, forReleaseResult, releasedResult] = await Promise.all([
    listPermitIssuanceBucketPaginated("blocked", { page: params.blockedPage, ...pagination }),
    listPermitIssuanceBucketPaginated("paid", { page: params.paidPage, ...pagination }),
    listPermitIssuanceBucketPaginated("forRelease", { page: params.forReleasePage, ...pagination }),
    listPermitIssuanceBucketPaginated("released", { page: params.releasedPage, ...pagination }),
  ]);

  const data = {
    blocked: blockedResult.records,
    paid: paidResult.records,
    forRelease: forReleaseResult.records,
    released: releasedResult.records,
  };

  const baseQueryParams = { pageSize: params.pageSize };

  return (
    <section className="ui-page-stack">
      <PageHeader
        eyebrow="BPLO"
        title="Permit Issuance"
        badge={<RoleBadge roleType="BPLO" />}
      />

      <div className="space-y-4">
        <ResponsiveDataTable
          title={`Blocked / Awaiting Payment (${blockedResult.totalCount})`}
          description="Applications that cannot be prepared yet because required payment is missing, pending verification, or not yet eligible."
          switchAt="xl"
          table={
            data.blocked.length === 0 ? (
              <div className={bploEmptyStateClass}>No blocked applications at the moment.</div>
            ) : (
              <table className={bploTableClass}>
                <thead>
                  <tr>
                    <th>Application Number</th>
                    <th>Business Name</th>
                    <th>Payment Status</th>
                    <th>Release Payment</th>
                    <th>Amount Paid</th>
                    <th>Block Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.blocked.map((row) => (
                    <tr key={row.applicationId}>
                      <td className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</td>
                      <td className="font-medium text-[var(--foreground)]">{row.businessName}</td>
                      <td>
                        <span className={paymentStatusBadgeClass(row.paymentStatus ?? "")}>
                          {row.paymentStatus ? mapPaymentStatusToUi(row.paymentStatus) : "No Payment Reference"}
                        </span>
                      </td>
                      <td className="text-[var(--ink-muted)]">₱ {row.requiredReleasePayment.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td className="text-[var(--ink-muted)]">₱ {row.amountPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      <td className="text-[var(--ink-muted)]">{row.blockingReason ?? "Awaiting payment action"}</td>
                      <td>
                        <button type="button" disabled className={actionButtonStyles("secondary", "sm")}>
                          Awaiting Payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
          mobile={
            data.blocked.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No blocked applications at the moment.</div>
            ) : (
              <div className="space-y-3 p-4">
                {data.blocked.map((row) => (
                  <article key={row.applicationId} className={bploMobileRecordCardClass}>
                    <p className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{row.businessName}</p>
                    <p className="mt-1 ui-caption">
                      Payment:{" "}
                      <span className={paymentStatusBadgeClass(row.paymentStatus ?? "")}>
                        {row.paymentStatus ? mapPaymentStatusToUi(row.paymentStatus) : "No Payment Reference"}
                      </span>
                    </p>
                    <p className="ui-caption">Required Release Payment: ₱ {row.requiredReleasePayment.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                    <p className="ui-caption">Amount Paid: ₱ {row.amountPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">{row.blockingReason ?? "Awaiting payment action"}</p>
                    <div className="mt-3">
                      <button type="button" disabled className={actionButtonStyles("secondary", "sm")}>
                        Awaiting Payment
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          }
        />

        <PaginationControls
          basePath="/bplo/permit-issuance"
          queryParams={{ ...baseQueryParams, blockedPage: params.blockedPage, paidPage: params.paidPage, forReleasePage: params.forReleasePage, releasedPage: params.releasedPage }}
          pageParamKey="blockedPage"
          page={blockedResult.page}
          pageSize={blockedResult.pageSize}
          totalCount={blockedResult.totalCount}
          totalPages={blockedResult.totalPages}
          recordLabel="blocked applications"
        />

        <ResponsiveDataTable
          title={`Paid Applications (${paidResult.totalCount})`}
          description="Verified payments waiting for permit or certificate preparation."
          switchAt="xl"
          table={
            data.paid.length === 0 ? (
              <div className={bploEmptyStateClass}>No records available yet in this section. Paid applications will appear here once payment verification is completed.</div>
            ) : (
            <table className={bploTableClass}>
              <thead>
                <tr>
                  <th>Application Number</th>
                  <th>Business Name</th>
                  <th>Applicant</th>
                  <th>Application Type</th>
                  <th>TOP Number</th>
                  <th>Payment Status</th>
                  <th>Date Paid</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.paid.map((row) => (
                  <tr key={row.applicationId}>
                    <td className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</td>
                    <td className="font-medium text-[var(--foreground)]">{row.businessName}</td>
                    <td className="text-[var(--ink-muted)]">
                      <p>{row.applicantName}</p>
                      <p className="ui-caption">{row.applicantEmail}</p>
                    </td>
                    <td>
                      <span className={bploTypeBadgeClass}>
                        {TYPE_LABEL[row.applicationType] ?? row.applicationType}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-[var(--ink-muted)]">{row.topNumber ?? "-"}</td>
                    <td>
                      <span className={paymentStatusBadgeClass(row.paymentStatus ?? "VERIFIED")}>
                        {mapPaymentStatusToUi(row.paymentStatus)}
                      </span>
                    </td>
                    <td className="text-[var(--ink-muted)]">{dateOnly(row.datePaid)}</td>
                    <td>
                      <Link href={`/bplo/permit-issuance/${row.applicationId}`} className={actionButtonStyles("primary", "sm")}>
                        {row.applicationType === "CLOSURE" ? "Prepare Certificate" : "Prepare Permit"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )
          }
          mobile={
            data.paid.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No records available yet in this section.</div>
            ) : (
              <div className="space-y-3 p-4">
                {data.paid.map((row) => (
                  <article key={row.applicationId} className={bploMobileRecordCardClass}>
                    <p className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{row.businessName}</p>
                    <p className="ui-caption">{TYPE_LABEL[row.applicationType] ?? row.applicationType} • Paid: {dateOnly(row.datePaid)}</p>
                    <div className="mt-3">
                      <Link href={`/bplo/permit-issuance/${row.applicationId}`} className={actionButtonStyles("primary", "sm")}>
                        {row.applicationType === "CLOSURE" ? "Prepare Certificate" : "Prepare Permit"}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )
          }
        />

        <PaginationControls
          basePath="/bplo/permit-issuance"
          queryParams={{ ...baseQueryParams, blockedPage: params.blockedPage, paidPage: params.paidPage, forReleasePage: params.forReleasePage, releasedPage: params.releasedPage }}
          pageParamKey="paidPage"
          page={paidResult.page}
          pageSize={paidResult.pageSize}
          totalCount={paidResult.totalCount}
          totalPages={paidResult.totalPages}
          recordLabel="paid applications"
        />

        <ResponsiveDataTable
          title={`For Release (${forReleaseResult.totalCount})`}
          description="Prepared documents waiting to be marked as released."
          switchAt="xl"
          table={
            data.forRelease.length === 0 ? (
              <div className={bploEmptyStateClass}>No records available yet in this section. Prepared permits and certificates will appear here when ready for release.</div>
            ) : (
            <table className={bploTableClass}>
              <thead>
                <tr>
                  <th>Application Number</th>
                  <th>Business Name</th>
                  <th>Application Type</th>
                  <th>Permit / Certificate Number</th>
                  <th>Prepared Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.forRelease.map((row) => (
                  <tr key={row.applicationId}>
                    <td className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</td>
                    <td className="font-medium text-[var(--foreground)]">{row.businessName}</td>
                    <td>
                      <span className={bploTypeBadgeClass}>
                        {TYPE_LABEL[row.applicationType] ?? row.applicationType}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-[var(--ink-muted)]">{row.documentNumber ?? "-"}</td>
                    <td className="text-[var(--ink-muted)]">{dateOnly(row.preparedDate)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={row.applicationType === "CLOSURE" ? `/bplo/permit-issuance/${row.applicationId}/closure-print` : `/bplo/permit-issuance/${row.applicationId}/print`}
                          className={actionButtonStyles("primary", "sm")}
                        >
                          Print
                        </Link>
                        <Link href={`/bplo/permit-issuance/${row.applicationId}`} className={actionButtonStyles("warning", "sm")}>
                          Release
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )
          }
          mobile={
            data.forRelease.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No records available yet in this section.</div>
            ) : (
              <div className="space-y-3 p-4">
                {data.forRelease.map((row) => (
                  <article key={row.applicationId} className={bploMobileRecordCardClass}>
                    <p className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{row.businessName}</p>
                    <p className="ui-caption">{TYPE_LABEL[row.applicationType] ?? row.applicationType} • Prepared: {dateOnly(row.preparedDate)}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={row.applicationType === "CLOSURE" ? `/bplo/permit-issuance/${row.applicationId}/closure-print` : `/bplo/permit-issuance/${row.applicationId}/print`}
                        className={actionButtonStyles("primary", "sm")}
                      >
                        Print Permit
                      </Link>
                      <Link href={`/bplo/permit-issuance/${row.applicationId}`} className={actionButtonStyles("warning", "sm")}>
                        Release
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )
          }
        />

        <PaginationControls
          basePath="/bplo/permit-issuance"
          queryParams={{ ...baseQueryParams, blockedPage: params.blockedPage, paidPage: params.paidPage, forReleasePage: params.forReleasePage, releasedPage: params.releasedPage }}
          pageParamKey="forReleasePage"
          page={forReleaseResult.page}
          pageSize={forReleaseResult.pageSize}
          totalCount={forReleaseResult.totalCount}
          totalPages={forReleaseResult.totalPages}
          recordLabel="for-release applications"
        />

        <ResponsiveDataTable
          title={`Released (${releasedResult.totalCount})`}
          description="Completed permit and certificate release records."
          switchAt="xl"
          table={
            data.released.length === 0 ? (
              <div className={bploEmptyStateClass}>No records available yet in this section. Released permits and certificates will appear here for reference.</div>
            ) : (
            <table className={bploTableClass}>
              <thead>
                <tr>
                  <th>Application Number</th>
                  <th>Business Name</th>
                  <th>Application Type</th>
                  <th>Permit / Certificate Number</th>
                  <th>Released Date</th>
                  <th>Released By</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.released.map((row) => (
                  <tr key={row.applicationId}>
                    <td className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</td>
                    <td className="font-medium text-[var(--foreground)]">{row.businessName}</td>
                    <td>
                      <span className={bploTypeBadgeClass}>
                        {TYPE_LABEL[row.applicationType] ?? row.applicationType}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-[var(--ink-muted)]">{row.documentNumber ?? "-"}</td>
                    <td className="text-[var(--ink-muted)]">{dateOnly(row.releasedDate)}</td>
                    <td className="text-[var(--ink-muted)]">{row.releasedBy ?? "-"}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={row.applicationType === "CLOSURE" ? `/bplo/permit-issuance/${row.applicationId}/closure-print` : `/bplo/permit-issuance/${row.applicationId}/print`}
                          className={actionButtonStyles("primary", "sm")}
                        >
                          Print
                        </Link>
                        <Link href={`/bplo/permit-issuance/${row.applicationId}`} className={actionButtonStyles("secondary", "sm")}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )
          }
          mobile={
            data.released.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No records available yet in this section.</div>
            ) : (
              <div className="space-y-3 p-4">
                {data.released.map((row) => (
                  <article key={row.applicationId} className={bploMobileRecordCardClass}>
                    <p className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{row.businessName}</p>
                    <p className="ui-caption">{TYPE_LABEL[row.applicationType] ?? row.applicationType} • Released: {dateOnly(row.releasedDate)}</p>
                    <p className="ui-caption">By: {row.releasedBy ?? "-"}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={row.applicationType === "CLOSURE" ? `/bplo/permit-issuance/${row.applicationId}/closure-print` : `/bplo/permit-issuance/${row.applicationId}/print`}
                        className={actionButtonStyles("primary", "sm")}
                      >
                        Print Permit
                      </Link>
                      <Link href={`/bplo/permit-issuance/${row.applicationId}`} className={actionButtonStyles("secondary", "sm")}>View</Link>
                    </div>
                  </article>
                ))}
              </div>
            )
          }
        />

        <PaginationControls
          basePath="/bplo/permit-issuance"
          queryParams={{ ...baseQueryParams, blockedPage: params.blockedPage, paidPage: params.paidPage, forReleasePage: params.forReleasePage, releasedPage: params.releasedPage }}
          pageParamKey="releasedPage"
          page={releasedResult.page}
          pageSize={releasedResult.pageSize}
          totalCount={releasedResult.totalCount}
          totalPages={releasedResult.totalPages}
          recordLabel="released applications"
        />
      </div>
    </section>
  );
}

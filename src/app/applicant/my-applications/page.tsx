import Link from "next/link";
import { resolveApplicantSessionContext } from "@/lib/applicant-api";
import {
  getApplicantLatestApplication,
  listApplicantApplicationsPaginated,
} from "@/lib/applications";
import { StatusBadge } from "@/components/applicant/status-badge";
import { applicantMobileRecordCardClass, applicantTableClass } from "@/components/applicant/applicant-ui-styles";
import { StatusTracker } from "@/components/applicant/status-tracker";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ResponsiveDataTable } from "@/components/ui/responsive-data-table";
import { RoleBadge } from "@/components/ui/role-badge";
import { SectionCard } from "@/components/ui/section-card";
import { actionButtonStyles } from "@/components/ui/action-button";

interface PageProps {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}

export default async function MyApplicationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const authContext = await resolveApplicantSessionContext();

  const applicationResult = authContext.ok
    ? await listApplicantApplicationsPaginated(authContext.applicantId, params)
    : {
        records: [],
        totalCount: 0,
        page: 1,
        pageSize: 25 as const,
        totalPages: 1,
      };

  const latest = authContext.ok ? await getApplicantLatestApplication(authContext.applicantId) : null;
  const applications = applicationResult.records;

  const queryParams = {
    page: params.page,
    pageSize: params.pageSize,
  };

  return (
    <section className="ui-page-stack">
      <PageHeader
        eyebrow="Applicant"
        title="My Applications"
        description="Track all applications from submission through release. Returned and rejected records remain visible for reference."
        badge={<RoleBadge roleType="APPLICANT" />}
        actions={
          <Link href="/applicant/application" className={actionButtonStyles("secondary", "sm")}>
            New filing
          </Link>
        }
      />

      {latest ? (
        <SectionCard
          title="Current Workflow Status"
          description={`${latest.applicationNumber} • ${latest.businessName}`}
          action={<StatusBadge status={latest.status} />}
        >
          <StatusTracker status={latest.status} applicationType={latest.applicationType as any} />
        </SectionCard>
      ) : (
        <EmptyState
          title="No records available yet"
          description="This section will populate as applications are processed. Start a new, renewal, or closure filing to begin."
          action={
            <Link href="/applicant/application" className={actionButtonStyles("primary", "sm")}>
              Start application
            </Link>
          }
        />
      )}

      <ResponsiveDataTable
        title="Application Records"
        description={`${applicationResult.totalCount} application${applicationResult.totalCount === 1 ? "" : "s"} on file.`}
        table={
          <table className={applicantTableClass}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Application Number</th>
                <th>Business Name</th>
                <th>Application Type</th>
                <th>Date Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((row) => (
                <tr key={row.id}>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="font-medium">{row.applicationNumber}</td>
                  <td>{row.businessName}</td>
                  <td>{row.applicationType}</td>
                  <td className="text-[var(--ink-muted)]">{row.dateSubmitted}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/applicant/my-applications/${row.id}`} className={actionButtonStyles("secondary", "sm")}>
                        View
                      </Link>
                      {row.status === "Draft" ? (
                        <Link
                          href={`/applicant/application/${row.applicationType.toLowerCase()}?applicationId=${row.id}`}
                          className={actionButtonStyles("primary", "sm")}
                        >
                          Edit
                        </Link>
                      ) : null}
                      {row.status === "Returned for Correction" ? (
                        <Link
                          href={`/applicant/application/${row.applicationType.toLowerCase()}?applicationId=${row.id}`}
                          className={actionButtonStyles("warning", "sm")}
                        >
                          Correct and Resubmit
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {applications.length === 0 ? (
                <tr>
                  <td className="py-6 text-[var(--ink-muted)]" colSpan={6}>
                    No records available yet. This table will populate as applications are processed.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        }
        mobile={
          applications.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No records available yet"
                description="This section will populate as applications are processed."
              />
            </div>
          ) : (
            <div className="space-y-2.5 p-3 sm:p-3.5">
              {applications.map((row) => (
                <article key={row.id} className={applicantMobileRecordCardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)] break-words">{row.businessName}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-[var(--ink-muted)]">{row.applicationType}</p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={row.status} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">Submitted: {row.dateSubmitted}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/applicant/my-applications/${row.id}`}
                      className={`${actionButtonStyles("secondary", "sm")} flex-1 sm:flex-initial justify-center text-center`}
                    >
                      View
                    </Link>
                    {row.status === "Draft" ? (
                      <Link
                        href={`/applicant/application/${row.applicationType.toLowerCase()}?applicationId=${row.id}`}
                        className={`${actionButtonStyles("primary", "sm")} flex-1 sm:flex-initial justify-center text-center`}
                      >
                        Edit
                      </Link>
                    ) : null}
                    {row.status === "Returned for Correction" ? (
                      <Link
                        href={`/applicant/application/${row.applicationType.toLowerCase()}?applicationId=${row.id}`}
                        className={`${actionButtonStyles("warning", "sm")} w-full sm:w-auto justify-center text-center`}
                      >
                        Correct and Resubmit
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )
        }
      />

      <PaginationControls
        basePath="/applicant/my-applications"
        queryParams={queryParams}
        page={applicationResult.page}
        pageSize={applicationResult.pageSize}
        totalCount={applicationResult.totalCount}
        totalPages={applicationResult.totalPages}
        recordLabel="applications"
        sortHint="Newest applications appear first."
      />
    </section>
  );
}

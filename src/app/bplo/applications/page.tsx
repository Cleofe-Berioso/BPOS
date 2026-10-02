import Link from "next/link";
import { listBploApplicationsPaginated } from "@/lib/bplo-applications";
import { resolveApplicantProfileImageUrl } from "@/lib/profile-image-url";
import { StatusBadge } from "@/components/applicant/status-badge";
import type { ApplicationStatus } from "@/lib/applicant-types";
import {
  bploFormControlClass,
  bploMobileRecordCardClass,
  bploTableClass,
} from "@/components/bplo/bplo-ui-styles";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { actionButtonStyles } from "@/components/ui/action-button";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { UserAvatar } from "@/components/ui/user-avatar";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    type?: "ALL" | "NEW" | "RENEWAL" | "CLOSURE";
    status?: "ALL" | "SUBMITTED" | "UNDER_REVIEW" | "RETURNED_FOR_CORRECTION";
    page?: string;
    pageSize?: string;
  }>;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

export default async function BploApplicationsQueuePage({ searchParams }: PageProps) {
  const filters = await searchParams;
  const queueResult = await listBploApplicationsPaginated(
    {
      search: filters.search,
      type: filters.type ?? "ALL",
      status: filters.status ?? "ALL",
    },
    { page: filters.page, pageSize: filters.pageSize }
  );

  const rowsWithPics = await Promise.all(
    queueResult.records.map(async (row) => {
      const profilePictureUrl = await resolveApplicantProfileImageUrl(row.applicantProfilePicturePath, {
        expiresInSeconds: 300,
      });
      return { ...row, profilePictureUrl };
    })
  );

  const hasActiveFilters = filters.search || filters.type !== "ALL" || filters.status !== "ALL";
  const queryParams = {
    search: filters.search,
    type: filters.type !== "ALL" ? filters.type : undefined,
    status: filters.status !== "ALL" ? filters.status : undefined,
    page: filters.page,
    pageSize: filters.pageSize,
  };

  return (
    <section className="ui-page-stack">
      <PageHeader
        eyebrow="BPLO"
        title="Applications Queue"
        badge={<RoleBadge roleType="BPLO" />}
      />

      <SectionCard
        title="Queue Filters"
        description="Search by application number, applicant, business name, type, or review-stage workflow status."
      >
        <form method="GET" className="space-y-4">
          <div>
            <input
              id="bplo-applications-search"
              type="search"
              name="search"
              defaultValue={filters.search ?? ""}
              placeholder="Search business, applicant, or application no."
              aria-label="Search applications"
              className={bploFormControlClass}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1 sm:w-auto sm:flex-none">
              <label className="ui-caption mb-1.5 block font-medium" htmlFor="bplo-applications-type">
                Application Type
              </label>
              <select
                id="bplo-applications-type"
                name="type"
                defaultValue={filters.type ?? "ALL"}
                className={`${bploFormControlClass} sm:w-48`}
              >
                <option value="ALL">All Types</option>
                <option value="NEW">New</option>
                <option value="RENEWAL">Renewal</option>
                <option value="CLOSURE">Closure</option>
              </select>
            </div>

            <div className="min-w-0 flex-1 sm:w-auto sm:flex-none">
              <label className="ui-caption mb-1.5 block font-medium" htmlFor="bplo-applications-status">
                Workflow Status
              </label>
              <select
                id="bplo-applications-status"
                name="status"
                defaultValue={filters.status ?? "ALL"}
                className={`${bploFormControlClass} sm:w-48`}
              >
                <option value="ALL">All Statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="RETURNED_FOR_CORRECTION">Returned for Correction</option>
              </select>
            </div>

            <div className="flex gap-2 sm:gap-2">
              <button type="submit" className={actionButtonStyles("primary", "md", "flex-1 sm:flex-none")}>
                Search
              </button>
              {hasActiveFilters && (
                <Link href="/bplo/applications" className={actionButtonStyles("secondary", "md", "flex-1 sm:flex-none")}>
                  Reset Filters
                </Link>
              )}
            </div>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Review Queue"
        description={`${queueResult.totalCount} application${queueResult.totalCount === 1 ? "" : "s"} match your filters.`}
      >
        {rowsWithPics.length === 0 ? (
          <EmptyState
            title="No applications found."
            description="Try adjusting the search keyword, application type, or workflow status."
            action={
              hasActiveFilters ? (
                <Link href="/bplo/applications" className={actionButtonStyles("secondary", "sm")}>
                  Reset Filters
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className={bploTableClass}>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Application Number</th>
                    <th>Business Name</th>
                    <th>Applicant</th>
                    <th>Type</th>
                    <th>Date Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithPics.map((row) => (
                    <tr key={row.id}>
                      <td className="align-middle">
                        <StatusBadge status={row.status as ApplicationStatus} />
                      </td>
                      <td className="font-mono text-xs text-[var(--foreground)]">{row.applicationNumber}</td>
                      <td className="font-medium text-[var(--foreground)]">{row.businessName}</td>
                      <td className="text-[var(--ink-muted)]">
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            src={row.profilePictureUrl}
                            name={row.applicantName || row.applicantEmail}
                            size="sm"
                          />
                          <span>{row.applicantName || row.applicantEmail}</span>
                        </div>
                      </td>
                      <td className="text-[var(--ink-muted)]">{row.applicationType}</td>
                      <td className="text-[var(--ink-muted)]">{formatDate(row.dateSubmitted)}</td>
                      <td>
                        <Link href={`/bplo/applications/${row.id}`} className={actionButtonStyles("secondary", "sm")}>
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 xl:hidden">
              {rowsWithPics.map((row) => (
                <article key={row.id} className={`${bploMobileRecordCardClass} space-y-3`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-grow">
                      <p className="truncate font-mono text-xs text-[var(--ink-muted)]">{row.applicationNumber}</p>
                      <p className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">{row.businessName}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <StatusBadge status={row.status as ApplicationStatus} />
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-[var(--ink-muted)]">
                    <div className="flex items-center gap-1.5">
                      <UserAvatar
                        src={row.profilePictureUrl}
                        name={row.applicantName || row.applicantEmail}
                        size="sm"
                        className="h-6 w-6 text-[10px]"
                      />
                      <span><span className="font-medium">Applicant:</span> {row.applicantName || row.applicantEmail}</span>
                    </div>
                    <p><span className="font-medium">Type:</span> {row.applicationType}</p>
                    <p><span className="font-medium">Submitted:</span> {formatDate(row.dateSubmitted)}</p>
                  </div>
                  <div className="pt-2">
                    <Link href={`/bplo/applications/${row.id}`} className={actionButtonStyles("secondary", "sm", "w-full")}>
                      Review
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <PaginationControls
        basePath="/bplo/applications"
        queryParams={queryParams}
        page={queueResult.page}
        pageSize={queueResult.pageSize}
        totalCount={queueResult.totalCount}
        totalPages={queueResult.totalPages}
        recordLabel="applications"
        sortHint="Newest submissions appear first."
      />
    </section>
  );
}

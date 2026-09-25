import Link from "next/link";
import {
  superadminAuditPillClass,
  superadminFormControlClass,
  superadminMobileRecordCardClass,
  superadminPanelClass,
  superadminTableClass,
} from "@/components/superadmin/superadmin-ui-styles";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { RoleBadge } from "@/components/ui/role-badge";
import { ResponsiveDataTable } from "@/components/ui/responsive-data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { actionButtonStyles } from "@/components/ui/action-button";
import {
  getSuperAdminActivityFilterOptions,
  listSuperAdminActivities,
  type SuperAdminActivityRow,
} from "@/lib/superadmin-data";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    actorRole?: "ALL" | "APPLICANT" | "BPLO" | "DEPARTMENT_HEAD" | "JIT" | "SUPER_ADMIN" | "SYSTEM";
    module?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
    applicationNumber?: string;
    page?: string;
  }>;
}

function actorRoleLabel(role: string): string {
  if (role === "DEPARTMENT_HEAD") return "Department Head";
  if (role === "SUPER_ADMIN") return "IT Administrator";
  if (role === "JIT") return "JIT Inspector Portal";
  if (role === "BPLO") return "BPLO";
  if (role === "APPLICANT") return "Applicant";
  if (role === "SYSTEM") return "System";
  return role;
}

function prettyLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function systemRolePill(value: string) {
  return <span className={`${superadminAuditPillClass} uppercase tracking-wide`}>{value}</span>;
}

function auditValuePill(value: string | null) {
  if (!value) {
    return <span className="text-[var(--ink-muted)]">-</span>;
  }

  return <span className={`${superadminAuditPillClass} uppercase tracking-wide`}>{value}</span>;
}

function buildActivitiesHref(
  params: Awaited<PageProps["searchParams"]>,
  overrides: Record<string, string | null | undefined>
): string {
  const nextParams = new URLSearchParams();

  const entries = {
    search: params.search,
    actorRole: params.actorRole,
    module: params.module,
    action: params.action,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    applicationNumber: params.applicationNumber,
    page: params.page,
    ...overrides,
  };

  for (const [key, value] of Object.entries(entries)) {
    if (!value || value === "" || (key === "page" && value === "1")) {
      continue;
    }
    nextParams.set(key, value);
  }

  const query = nextParams.toString();
  return query ? `/superadmin/activities?${query}` : "/superadmin/activities";
}

function renderActorRole(role: string) {
  if (role === "APPLICANT" || role === "BPLO" || role === "SUPER_ADMIN") {
    return <RoleBadge roleType={role} label={actorRoleLabel(role)} />;
  }

  return systemRolePill(actorRoleLabel(role));
}

function renderRecordReference(row: SuperAdminActivityRow) {
  if (!row.recordReference && !row.applicationNumber) {
    return <span className="text-[var(--ink-muted)]">-</span>;
  }

  const showApplicationNumber = row.applicationNumber && row.applicationNumber !== row.recordReference ? row.applicationNumber : null;

  return (
    <div className="space-y-1">
      <p className="font-medium text-[var(--foreground)]">{row.recordReference ?? row.applicationNumber}</p>
      {showApplicationNumber ? <p className="ui-caption">App No.: {showApplicationNumber}</p> : null}
    </div>
  );
}

function PaginationControls({
  params,
  page,
  pageSize,
  totalCount,
  totalPages,
}: {
  params: Awaited<PageProps["searchParams"]>;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}) {
  if (totalCount === 0) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <section className="app-surface flex flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          Showing {start}-{end} of {totalCount} audit trail records
        </p>
        <p className="ui-caption">Newest records appear first.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {page > 1 ? (
          <Link href={buildActivitiesHref(params, { page: String(page - 1) })} className={actionButtonStyles("secondary", "sm")}>
            Previous
          </Link>
        ) : (
          <span className={`${actionButtonStyles("secondary", "sm")} pointer-events-none opacity-50`}>Previous</span>
        )}
        <span className={`${superadminPanelClass} px-3 py-2 font-medium`}>
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildActivitiesHref(params, { page: String(page + 1) })} className={actionButtonStyles("secondary", "sm")}>
            Next
          </Link>
        ) : (
          <span className={`${actionButtonStyles("secondary", "sm")} pointer-events-none opacity-50`}>Next</span>
        )}
      </div>
    </section>
  );
}

export default async function SuperAdminActivitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const pageSize = 25;

  const [activityResult, filterOptions] = await Promise.all([
    listSuperAdminActivities({
      searchKeyword: params.search,
      actorRole: params.actorRole ?? "ALL",
      module: params.module,
      action: params.action,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      applicationNumber: params.applicationNumber,
      page,
      pageSize,
    }),
    getSuperAdminActivityFilterOptions(),
  ]);

  const rows = activityResult.records;
  const description =
    activityResult.totalCount === 0
      ? "No audit trail records matched the current filters."
      : `Showing ${rows.length} record${rows.length === 1 ? "" : "s"} from ${activityResult.totalCount} total match${activityResult.totalCount === 1 ? "" : "es"}.`;

  return (
    <section className="ui-page-stack">
      <PageHeader
        title="Audit Trail"
        description="Read-only system-wide audit log for monitoring actions across application, payment, permit, inspection, settings, user management, document, revocation, and SMS modules."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Audit Viewer" />}
      />

      <FilterBar
        title="Audit Trail Filters"
        description="Filter by keyword, actor role, module, action type, date range, and application number."
        contentClassName="block"
      >
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="search"
            name="search"
            defaultValue={params.search ?? ""}
            placeholder="Search actor, module, action, entity, or description"
            aria-label="Search audit trail"
            className={superadminFormControlClass}
          />
          <select
            name="actorRole"
            defaultValue={params.actorRole ?? "ALL"}
            aria-label="Filter by actor role"
            className={superadminFormControlClass}
          >
            <option value="ALL">All Actor Roles</option>
            <option value="APPLICANT">Applicant</option>
            <option value="BPLO">BPLO</option>
            <option value="DEPARTMENT_HEAD">Department Head</option>
            <option value="JIT">JIT Inspector Portal</option>
            <option value="SUPER_ADMIN">IT Administrator</option>
            <option value="SYSTEM">System</option>
          </select>
          <select
            name="module"
            defaultValue={params.module ?? ""}
            aria-label="Filter by module"
            className={superadminFormControlClass}
          >
            <option value="">All Modules</option>
            {filterOptions.modules.map((module) => (
              <option key={module} value={module}>
                {prettyLabel(module)}
              </option>
            ))}
          </select>
          <select
            name="action"
            defaultValue={params.action ?? ""}
            aria-label="Filter by action"
            className={superadminFormControlClass}
          >
            <option value="">All Actions</option>
            {filterOptions.actions.map((action) => (
              <option key={action} value={action}>
                {prettyLabel(action)}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="dateFrom"
            defaultValue={params.dateFrom ?? ""}
            aria-label="Filter from date"
            className={superadminFormControlClass}
          />
          <input
            type="date"
            name="dateTo"
            defaultValue={params.dateTo ?? ""}
            aria-label="Filter to date"
            className={superadminFormControlClass}
          />
          <input
            name="applicationNumber"
            defaultValue={params.applicationNumber ?? ""}
            placeholder="Filter by application number"
            aria-label="Filter by application number"
            className={superadminFormControlClass}
          />
          <div className="flex flex-wrap gap-2 xl:items-center">
            <button type="submit" className={actionButtonStyles("readOnly", "sm")}>
              Search
            </button>
            <Link href="/superadmin/activities" className={actionButtonStyles("secondary", "sm")}>
              Reset Filters
            </Link>
          </div>
        </form>
      </FilterBar>

      <ResponsiveDataTable
        title="Audit Trail Records"
        description={description}
        switchAt="xl"
        table={rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No audit trail records found." description="Try adjusting the current filters." />
          </div>
        ) : (
          <table className={superadminTableClass}>
            <thead>
              <tr>
                <th className="px-4 py-3 font-semibold">Date / Time</th>
                <th className="px-4 py-3 font-semibold">Actor Name</th>
                <th className="px-4 py-3 font-semibold">Actor Role</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">Entity Type</th>
                <th className="px-4 py-3 font-semibold">Affected Record / App No.</th>
                <th className="px-4 py-3 font-semibold">Before Status</th>
                <th className="px-4 py-3 font-semibold">After Status</th>
                <th className="px-4 py-3 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
                    {new Date(row.dateTime).toLocaleString("en-PH")}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">{row.actorName}</td>
                  <td className="px-4 py-3">{renderActorRole(row.actorRole)}</td>
                  <td className="px-4 py-3 text-[var(--ink-muted)]">{row.action}</td>
                  <td className="px-4 py-3 text-[var(--ink-muted)]">{row.module}</td>
                  <td className="px-4 py-3 text-[var(--ink-muted)]">{row.entityType}</td>
                  <td className="px-4 py-3 text-[var(--ink-muted)]">{renderRecordReference(row)}</td>
                  <td className="px-4 py-3">{auditValuePill(row.beforeStatus)}</td>
                  <td className="px-4 py-3">{auditValuePill(row.afterStatus)}</td>
                  <td className="max-w-sm px-4 py-3 text-[var(--ink-muted)]">{row.description ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        mobile={rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No audit trail records found." description="Try adjusting the current filters." />
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {rows.map((row) => (
              <article key={row.id} className={superadminMobileRecordCardClass}>
                <p className="ui-caption">{new Date(row.dateTime).toLocaleString("en-PH")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {renderActorRole(row.actorRole)}
                  <span className="text-sm font-semibold text-[var(--foreground)]">{row.actorName}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-[var(--ink-muted)]">
                  <p>
                    <span className="font-semibold text-[var(--foreground)]">Action:</span> {row.action}
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--foreground)]">Module:</span> {row.module}
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--foreground)]">Entity Type:</span> {row.entityType}
                  </p>
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">Affected Record / App No.</p>
                    <div className="mt-1">{renderRecordReference(row)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div>
                      <p className="mb-1 font-semibold text-[var(--foreground)]">Before</p>
                      {auditValuePill(row.beforeStatus)}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-[var(--foreground)]">After</p>
                      {auditValuePill(row.afterStatus)}
                    </div>
                  </div>
                  <p>
                    <span className="font-semibold text-[var(--foreground)]">Description:</span> {row.description ?? "-"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      />

      <PaginationControls
        params={params}
        page={activityResult.page}
        pageSize={activityResult.pageSize}
        totalCount={activityResult.totalCount}
        totalPages={activityResult.totalPages}
      />
    </section>
  );
}

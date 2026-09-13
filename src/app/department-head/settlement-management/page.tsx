import { notFound } from "next/navigation";
import { SettlementManagementClient } from "@/components/department-head/settlement-management-client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";

export default async function DepartmentHeadSettlementManagementPage() {
  const session = await requireDepartmentHeadSession();
  if (!session) notFound();

  return (
    <section className="ui-page-stack ui-page-stack--workspace">
      <PageHeader
        eyebrow="Department Head"
        title="Settlement Management"
        description="View and settle eligible government-agency-related compliance cases."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Department Head" />}
      />

      <SettlementManagementClient />
    </section>
  );
}

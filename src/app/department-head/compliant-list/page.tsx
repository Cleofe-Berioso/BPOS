import { notFound } from "next/navigation";
import { CompliantListClient } from "@/components/department-head/compliant-list-client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";

export default async function DepartmentHeadCompliantListPage() {
  const session = await requireDepartmentHeadSession();
  if (!session) notFound();

  return (
    <section className="ui-page-stack ui-page-stack--workspace">
      <PageHeader
        eyebrow="Department Head"
        title="Compliant List"
        description="Read-only list of JIT inspections verified as compliant by Department Head."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Department Head" />}
      />

      <CompliantListClient />
    </section>
  );
}

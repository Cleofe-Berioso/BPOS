import { notFound } from "next/navigation";
import { RevokePermitListClient } from "@/components/department-head/revoke-permit-list-client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";

export default async function DepartmentHeadRevokePermitListPage() {
  const session = await requireDepartmentHeadSession();
  if (!session) notFound();

  return (
    <section className="ui-page-stack ui-page-stack--workspace">
      <PageHeader
        eyebrow="Department Head"
        title="Restrictions List"
        description="Businesses currently blocked from renewal because of approved revocation."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Department Head" />}
      />

      <RevokePermitListClient />
    </section>
  );
}

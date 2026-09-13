import { notFound } from "next/navigation";
import { PermitToRevokeClient } from "@/components/department-head/permit-to-revoke-client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";

export default async function DepartmentHeadPermitToRevokePage() {
  const session = await requireDepartmentHeadSession();
  if (!session) notFound();

  return (
    <section className="ui-page-stack ui-page-stack--workspace">
      <PageHeader
        eyebrow="Department Head"
        title="Flagged Cases"
        description="Review Department Head verified NON_COMPLIANT inspections and decide if revocation should proceed."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Department Head" />}
      />

      <PermitToRevokeClient />
    </section>
  );
}

import { notFound } from "next/navigation";
import { DepartmentHeadInspectionVerificationClient } from "@/components/department-head/inspection-verification-client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";

export default async function DepartmentHeadInspectionVerificationPage() {
  const session = await requireDepartmentHeadSession();
  if (!session) notFound();

  return (
    <section className="ui-page-stack ui-page-stack--workspace">
      <PageHeader
        eyebrow="Department Head"
        title="Inspection Verification"
        description="Verify JIT inspection results before cases move forward."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Department Head" />}
      />

      <DepartmentHeadInspectionVerificationClient />
    </section>
  );
}

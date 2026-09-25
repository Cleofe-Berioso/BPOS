import { notFound } from "next/navigation";
import { JitInspectBusinessClient } from "@/components/jit/jit-inspect-business-client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireJitSession } from "@/lib/jit-api";

export default async function JitInspectBusinessPage() {
  const session = await requireJitSession();
  if (!session) notFound();

  return (
    <section className="ui-page-stack">
      <PageHeader
        eyebrow="JIT Inspector Portal"
        title="Inspection Queue"
        description="Review active released businesses and log compliance findings."
        badge={<RoleBadge roleType="VIEW_ONLY" label="JIT Inspector Portal" />}
      />

      <JitInspectBusinessClient />
    </section>
  );
}

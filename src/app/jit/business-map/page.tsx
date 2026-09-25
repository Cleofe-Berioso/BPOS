import { notFound } from "next/navigation";
import { JitBusinessMapClient } from "@/components/jit/jit-business-map-client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { requireJitSession } from "@/lib/jit-api";

export default async function JitBusinessMapPage() {
  const session = await requireJitSession();
  if (!session) notFound();

  return (
    <section className="ui-page-stack">
      <PageHeader
        eyebrow="JIT Inspector Portal"
        title="Business Map"
        description="Read-only released business map for Joint Inspection Team planning and monitoring."
        badge={<RoleBadge roleType="VIEW_ONLY" label="JIT Inspector Portal" />}
      />

      <JitBusinessMapClient />
    </section>
  );
}

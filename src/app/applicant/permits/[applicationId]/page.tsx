import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessPermitTemplate } from "@/components/print/business-permit-template";
import { actionButtonStyles } from "@/components/ui/action-button";
import { requireApplicantSession } from "@/lib/applicant-api";
import { getApplicantBusinessPermitPrintAccess } from "@/lib/printable-documents";

interface PageProps {
  params: Promise<{ applicationId: string }>;
}

export default async function ApplicantPermitPrintPage({ params }: PageProps) {
  const session = await requireApplicantSession();
  if (!session) notFound();

  const { applicationId } = await params;
  const access = await getApplicantBusinessPermitPrintAccess(applicationId, session.user.id);

  if (!access.ok) {
    notFound();
  }

  return (
    <section className="space-y-4">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-[var(--ink-muted)]">Applicant permit preview only. Official printing and release remain under BPLO.</p>
        <Link href={`/applicant/my-applications/${applicationId}`} className={`${actionButtonStyles("secondary", "sm")} w-full sm:w-auto justify-center`}>
          Back to Application Detail
        </Link>
      </div>
      <div className="w-full overflow-x-auto pb-4">
        <BusinessPermitTemplate permit={access.permit} variant="applicant-preview" />
      </div>
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ClosureCertificateTemplate } from "@/components/print/closure-certificate-template";
import { actionButtonStyles } from "@/components/ui/action-button";
import { requireApplicantSession } from "@/lib/applicant-api";
import { getApplicantClosureCertificatePrintAccess } from "@/lib/printable-documents";

interface PageProps {
  params: Promise<{ applicationId: string }>;
}

export default async function ApplicantClosureCertificatePrintPage({ params }: PageProps) {
  const session = await requireApplicantSession();
  if (!session) notFound();

  const { applicationId } = await params;
  const access = await getApplicantClosureCertificatePrintAccess(applicationId, session.user.id);

  if (!access.ok) {
    notFound();
  }

  return (
    <section className="space-y-4">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-[var(--ink-muted)]">
          Applicant certificate view. You can print your released Business Closure Certificate from this page.
        </p>
        <Link href={`/applicant/my-applications/${applicationId}`} className={`${actionButtonStyles("secondary", "sm")} w-full sm:w-auto justify-center`}>
          Back to Application Detail
        </Link>
      </div>
      <div className="w-full overflow-x-auto pb-4">
        <ClosureCertificateTemplate certificate={access.certificate} />
      </div>
    </section>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getApplicationForAssessment } from "@/lib/bplo-assessment";
import { AssessmentFeeForm } from "@/components/bplo/assessment-fee-form";
import { PageHeader } from "@/components/ui/page-header";
import { actionButtonStyles } from "@/components/ui/action-button";
import { RoleBadge } from "@/components/ui/role-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { bploPanelClass } from "@/components/bplo/bplo-ui-styles";

export default async function BploAssessmentDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const detail = await getApplicationForAssessment(applicationId);

  if (!detail) {
    // Check if application exists but is no longer in an assessment-accessible status
    // (e.g., TOP has already been generated and no reassessment requested)
    const application = await prisma.businessApplication.findUnique({
      where: { businessApplicationId: applicationId },
      select: {
        businessApplicationId: true,
        applicationNumber: true,
        status: true,
        feeAssessment: { select: { status: true, reassessmentRequestedAt: true } },
      },
    });

    if (application?.feeAssessment?.status === "GENERATED" && !application.feeAssessment.reassessmentRequestedAt) {
      return (
        <section className="ui-page-stack">
          <PageHeader
            eyebrow="BPLO"
            title="Assessment & Fees"
            description="Already Processed"
            badge={<RoleBadge roleType="BPLO" />}
            actions={
              <Link href="/bplo/assessment-fees" className={actionButtonStyles("secondary", "sm")}>
                Back to List
              </Link>
            }
          />

          <SectionCard title="Assessment Status" description="This application has already been processed.">
            <div className="space-y-4">
              <EmptyState
                title="Tax Order of Payment already generated"
                description={`Application ${application.applicationNumber} has already been approved and moved to payment verification. The assessment for this application cannot be edited further.`}
              />
              <div className={bploPanelClass}>
                <p className="text-sm text-[var(--ink-muted)]">
                  <span className="font-semibold text-[var(--foreground)]">Current Status:</span> {application.status}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Next: Payment Verification
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/bplo/payment-verification"
                  className={actionButtonStyles("primary", "md")}
                >
                  Go to Payment Verification
                </Link>
                <Link
                  href="/bplo/assessment-fees"
                  className={actionButtonStyles("secondary", "md")}
                >
                  Back to Assessment Fees
                </Link>
              </div>
            </div>
          </SectionCard>
        </section>
      );
    }

    notFound();
  }

  return (
    <section className="ui-page-stack">
      <PageHeader
        eyebrow="BPLO"
        title="Assessment & Fees"
        description={`${detail.applicationNumber} — ${detail.businessName}`}
        badge={<RoleBadge roleType="BPLO" />}
        actions={
          <Link href="/bplo/assessment-fees" className={actionButtonStyles("secondary", "sm")}>
            Back to List
          </Link>
        }
      />

      {detail.assessment?.reassessmentRequestedAt ? (
        <div className="px-6">
          <span className="inline-block rounded-full border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-1 text-xs font-medium text-[var(--warning)]">
            Re-assessment Requested
          </span>
        </div>
      ) : null}

      <AssessmentFeeForm detail={detail} />
    </section>
  );
}

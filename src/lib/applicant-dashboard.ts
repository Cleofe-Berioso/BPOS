import { cache } from "react";
import { listApplicantApplications } from "@/lib/applications";
import { listApplicantReleasedBusinessLocations } from "@/lib/business-location";
import type { ApplicantApplicationRow, ApplicationStatus, ApplicationType } from "@/lib/applicant-types";

type NextActionTone = "info" | "warning";

export interface ApplicantPermitValidity {
  hasActivePermit: boolean;
  permitNumber: string | null;
  applicationNumber: string | null;
  applicationType: ApplicationType | null;
  expirationDate: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
  totalValidityDays: number | null;
}

export interface ApplicantNextAction {
  label: string;
  detail: string;
  href: string;
  cta: string;
  variant: NextActionTone;
}

export interface ApplicantLatestApplicationRow extends ApplicantApplicationRow {
  nextAction: ApplicantNextAction;
}

export interface ApplicantDashboardMetrics {
  summary: {
    totalApplications: number;
    pendingApplications: number;
    returnedApplications: number;
    processingApplications: number;
    releasedPermits: number;
    closureApplications: number;
  };
  permitValidity: ApplicantPermitValidity;
  latestApplication: ApplicantLatestApplicationRow | null;
  recentApplications: ApplicantApplicationRow[];
}

function isActivePermitRow(row: Awaited<ReturnType<typeof listApplicantReleasedBusinessLocations>>[number]): boolean {
  return Boolean(row.permitOrCertificateNumber);
}


function buildNextAction(input: {
  status: ApplicationStatus;
  applicationType: ApplicationType;
  applicationId: string;
  isClosureCertificateReady: boolean;
}): ApplicantNextAction {
  const baseHref = `/applicant/my-applications/${input.applicationId}`;

  if (input.status === "Draft") {
    return {
      label: "Continue draft application",
      detail: "Continue your draft application and submit when ready.",
      href: `/applicant/application/${input.applicationType.toLowerCase()}?applicationId=${input.applicationId}`,
      cta: "Continue draft",
      variant: "info",
    };
  }

  if (input.status === "Returned for Correction") {
    return {
      label: "Review remarks and resubmit",
      detail: "Review BPLO or Department Head remarks, fix the application, then resubmit.",
      href: `/applicant/application/${input.applicationType.toLowerCase()}?applicationId=${input.applicationId}`,
      cta: "Correct and resubmit",
      variant: "warning",
    };
  }

  if (input.status === "Approved for Payment") {
    return {
      label: "Proceed to Tax Order / payment page",
      detail: "Your Tax Order of Payment is ready. Proceed to payment to continue the workflow.",
      href: "/applicant/top",
      cta: "Open Tax Order of Payment",
      variant: "warning",
    };
  }

  if (input.status === "Paid") {
    return {
      label: "Wait for BPLO permit release",
      detail: "Payment has been verified. BPLO will prepare the permit or certificate for release.",
      href: baseHref,
      cta: "View status",
      variant: "info",
    };
  }

  if (input.status === "For Release") {
    return {
      label: "Wait for release confirmation",
      detail: "Your permit or certificate is ready for the final release step.",
      href: baseHref,
      cta: "View release status",
      variant: "info",
    };
  }

  if (input.status === "Released") {
    return {
      label: input.isClosureCertificateReady ? "View or print closure certificate" : "View or print your permit",
      detail: input.isClosureCertificateReady
        ? "Your closure certificate is ready for viewing or printing."
        : "Your permit is released and ready for viewing or printing.",
      href: input.isClosureCertificateReady
        ? `/applicant/closure-certificates/${input.applicationId}`
        : `/applicant/permits/${input.applicationId}`,
      cta: input.isClosureCertificateReady ? "Open closure certificate" : "Open permit",
      variant: "info",
    };
  }

  if (input.status === "Rejected") {
    return {
      label: "Review rejection remarks",
      detail: "Review the recorded rejection remarks for this application.",
      href: baseHref,
      cta: "View details",
      variant: "warning",
    };
  }

  return {
    label: "Track current application status",
    detail: "Open your application detail page to review the latest workflow progress.",
    href: baseHref,
    cta: "Open application",
    variant: "info",
  };
}

const getCachedApplicantDashboardMetrics = cache(async (applicantId: string): Promise<ApplicantDashboardMetrics> => {
  const [applications, releasedLocations] = await Promise.all([
    listApplicantApplications(applicantId),
    listApplicantReleasedBusinessLocations(applicantId),
  ]);

  const activePermitRow = releasedLocations.find(isActivePermitRow) ?? null;
  const expirationDate = activePermitRow?.permitValidUntil ? new Date(activePermitRow.permitValidUntil) : null;
  const now = new Date();

  const permitValidity: ApplicantPermitValidity = activePermitRow && expirationDate
    ? {
        hasActivePermit: true,
        permitNumber: activePermitRow.permitOrCertificateNumber ?? null,
        applicationNumber: activePermitRow.applicationNumber,
        applicationType: activePermitRow.applicationType,
        expirationDate: expirationDate.toISOString(),
        daysRemaining: Math.max(0, Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
        isExpired: expirationDate.getTime() < now.getTime(),
        totalValidityDays: Math.max(1, Math.ceil((expirationDate.getTime() - new Date(expirationDate.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24))),
      }
    : {
        hasActivePermit: false,
        permitNumber: null,
        applicationNumber: null,
        applicationType: null,
        expirationDate: null,
        daysRemaining: null,
        isExpired: false,
        totalValidityDays: null,
      };

  const summary = {
    totalApplications: applications.length,
    pendingApplications: applications.filter(
      (item) => !["Released", "Rejected"].includes(item.status)
    ).length,
    returnedApplications: applications.filter((item) => item.status === "Returned for Correction").length,
    processingApplications: applications.filter((item) =>
      ["Approved for Payment", "Paid", "For Release"].includes(item.status)
    ).length,
    releasedPermits: applications.filter((item) => item.status === "Released").length,
    closureApplications: applications.filter((item) => item.applicationType === "CLOSURE").length,
  };

  const latest = applications[0] ?? null;
  const latestApplication = latest
    ? {
        ...latest,
        nextAction: buildNextAction({
          status: latest.status,
          applicationType: latest.applicationType,
          applicationId: latest.id,
          isClosureCertificateReady: latest.applicationType === "CLOSURE" && latest.status === "Released",
        }),
      }
    : null;

  return {
    summary,
    permitValidity,
    latestApplication,
    recentApplications: applications.slice(0, 5),
  };
});

export async function getApplicantDashboardMetrics(applicantId: string): Promise<ApplicantDashboardMetrics> {
  return getCachedApplicantDashboardMetrics(applicantId);
}

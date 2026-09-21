import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The canonical message for all session-validity failures visible to the applicant.
export const APPLICANT_ACCOUNT_NOT_FOUND_MESSAGE =
  "Your login session is no longer valid. Please sign out and sign in again.";

export interface ApplicantSession {
  user: {
    id: string;
    email: string | null;
    name?: string | null;
    role: string;
  };
}

type ApplicantAuthContext =
  | {
      ok: true;
      session: ApplicantSession;
      applicantId: string;
      applicantEmail: string | null;
      applicantRole: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const SESSION_INVALID_MESSAGE = APPLICANT_ACCOUNT_NOT_FOUND_MESSAGE;

function logApplicantAuthResolution(data: {
  sessionUserId: string | null;
  sessionUserEmail: string | null;
  resolvedUserId: string | null;
  resolvedRole: string | null;
  usedEmailFallback: boolean;
  requiresRelogin: boolean;
}) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[ApplicantAuth] resolve", data);
  }
}

export async function resolveApplicantSessionContext(): Promise<ApplicantAuthContext> {
  const rawSession = await auth();
  if (!rawSession || typeof rawSession !== "object") {
    return { ok: false, status: 401, error: SESSION_INVALID_MESSAGE };
  }

  const sessionCandidate = rawSession as unknown as Record<string, unknown>;
  const userCandidate = sessionCandidate.user;
  if (!userCandidate || typeof userCandidate !== "object") {
    return { ok: false, status: 401, error: SESSION_INVALID_MESSAGE };
  }

  const session = rawSession as unknown as ApplicantSession;

  const sessionUserId = typeof session.user.id === "string" && session.user.id.trim()
    ? session.user.id.trim()
    : null;
  const sessionUserEmail = typeof session.user.email === "string" && session.user.email.trim()
    ? session.user.email.trim().toLowerCase()
    : null;

  if (session.user.role !== "APPLICANT") {
    logApplicantAuthResolution({
      sessionUserId,
      sessionUserEmail,
      resolvedUserId: null,
      resolvedRole: session.user.role ?? null,
      usedEmailFallback: false,
      requiresRelogin: false,
    });
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const byId = sessionUserId
    ? await prisma.user.findUnique({
        where: { userId: sessionUserId },
        select: { userId: true, email: true, role: true, isActive: true },
      })
    : null;

  const usedEmailFallback = byId === null;

  const byEmail =
    usedEmailFallback && sessionUserEmail
      ? await prisma.user.findUnique({
          where: { email: sessionUserEmail },
          select: { userId: true, email: true, role: true, isActive: true },
        })
      : null;

  const resolvedUser = byId ?? byEmail;

  const requiresRelogin = resolvedUser === null;

  logApplicantAuthResolution({
    sessionUserId,
    sessionUserEmail,
    resolvedUserId: resolvedUser?.userId ?? null,
    resolvedRole: resolvedUser?.role ?? null,
    usedEmailFallback,
    requiresRelogin,
  });

  if (!resolvedUser || resolvedUser.role !== "APPLICANT") {
    return { ok: false, status: 401, error: SESSION_INVALID_MESSAGE };
  }

  if (!resolvedUser.isActive) {
    return { ok: false, status: 403, error: "Your applicant account is disabled." };
  }

  // Normalize the in-memory session to the current database user so all
  // downstream callers see the active DB id, not the potentially-stale JWT id.
  session.user.id = resolvedUser.userId;
  session.user.email = resolvedUser.email;
  session.user.role = "APPLICANT";

  return {
    ok: true,
    session,
    applicantId: resolvedUser.userId,
    applicantEmail: resolvedUser.email,
    applicantRole: resolvedUser.role,
  };
}

export async function requireApplicantSession() {
  const resolved = await resolveApplicantSessionContext();
  if (!resolved.ok) {
    return null;
  }

  return resolved.session;
}

import { formatPersonName } from "@/lib/person-name";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateBploAccountInput = {
  name?: unknown;
  firstName?: unknown;
  middleName?: unknown;
  lastName?: unknown;
  suffix?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
};

export type CreateBploAccountParsed = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  name: string;
  email: string;
  password: string;
};

export type PolicyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

/**
 * Validates IT Administrator "Create BPLO account" request body (pure; no DB).
 */
export function parseCreateBploAccountInput(
  body: CreateBploAccountInput
): PolicyResult<CreateBploAccountParsed> {
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const middleName = typeof body.middleName === "string" ? body.middleName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const suffix = typeof body.suffix === "string" ? body.suffix.trim() : "";

  if (!firstName) {
    return { ok: false, error: "First name is required.", status: 400 };
  }
  if (!lastName) {
    return { ok: false, error: "Last name is required.", status: 400 };
  }

  const name = formatPersonName({
    firstName,
    middleName,
    lastName,
    suffix,
    fallbackName: typeof body.name === "string" ? body.name.trim() : "",
  });

  if (!name) {
    return { ok: false, error: "Full name is required.", status: 400 };
  }

  if (!body.email || typeof body.email !== "string" || body.email.trim().length === 0) {
    return { ok: false, error: "Email address is required.", status: 400 };
  }

  const email = body.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, error: "Invalid email address format.", status: 400 };
  }

  if (!body.password || typeof body.password !== "string" || body.password.length < 8) {
    return {
      ok: false,
      error: "Temporary password must be at least 8 characters.",
      status: 400,
    };
  }

  if (body.confirmPassword !== body.password) {
    return { ok: false, error: "Passwords do not match.", status: 400 };
  }

  return {
    ok: true,
    value: {
      firstName,
      middleName,
      lastName,
      suffix,
      name,
      email,
      password: body.password,
    },
  };
}

/**
 * Validates BPLO self-profile name update (admin has no dedicated edit-BPLO API;
 * this is the update path for BPLO account fields).
 */
export function parseBploProfileNameUpdate(body: {
  firstName?: unknown;
  middleName?: unknown;
  lastName?: unknown;
  suffix?: unknown;
}): PolicyResult<{
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  name: string;
}> {
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const middleName = typeof body.middleName === "string" ? body.middleName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const suffix = typeof body.suffix === "string" ? body.suffix.trim() : "";

  if (!firstName) {
    return { ok: false, error: "First name is required.", status: 400 };
  }
  if (!lastName) {
    return { ok: false, error: "Last name is required.", status: 400 };
  }

  const name = formatPersonName({
    firstName,
    middleName,
    lastName,
    suffix,
    fallbackName: `${firstName} ${lastName}`,
  });

  return {
    ok: true,
    value: { firstName, middleName, lastName, suffix, name },
  };
}

export type DisableUserDecision =
  | { action: "reject"; error: string; status: number }
  | { action: "already_disabled" }
  | { action: "disable" };

/**
 * Pure disable policy for IT Administrator user management.
 */
export function decideDisableUser(input: {
  actorId: string;
  targetId: string;
  targetExists: boolean;
  targetIsActive: boolean;
  targetRole: string;
  activeSuperAdminCount: number;
}): DisableUserDecision {
  if (!input.targetId) {
    return { action: "reject", error: "User ID is required.", status: 400 };
  }
  if (input.actorId === input.targetId) {
    return { action: "reject", error: "You cannot disable your own account.", status: 400 };
  }
  if (!input.targetExists) {
    return { action: "reject", error: "User not found.", status: 404 };
  }
  if (!input.targetIsActive) {
    return { action: "already_disabled" };
  }
  if (input.targetRole === "SUPER_ADMIN" && input.activeSuperAdminCount <= 1) {
    return {
      action: "reject",
      error: "Cannot disable the last active IT Administrator account.",
      status: 400,
    };
  }
  return { action: "disable" };
}

export type ReactivateUserDecision =
  | { action: "reject"; error: string; status: number }
  | { action: "already_active" }
  | { action: "reactivate" };

export function decideReactivateUser(input: {
  targetId: string;
  targetExists: boolean;
  targetIsActive: boolean;
}): ReactivateUserDecision {
  if (!input.targetId) {
    return { action: "reject", error: "User ID is required.", status: 400 };
  }
  if (!input.targetExists) {
    return { action: "reject", error: "User not found.", status: 404 };
  }
  if (input.targetIsActive) {
    return { action: "already_active" };
  }
  return { action: "reactivate" };
}

export function mapUserActiveStatus(isActive: boolean): "ACTIVE" | "DISABLED" {
  return isActive ? "ACTIVE" : "DISABLED";
}

/**
 * Pure validation for IT Administrator system settings saves
 * (fee amounts, interest/penalty rates, JIT portal, renewal extensions).
 */

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function clampNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export type FeeAmountValidation =
  | { ok: true; amount: number }
  | { ok: false; error: string };

export function validateFeeAmount(amount: unknown): FeeAmountValidation {
  if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
    return { ok: false, error: "Fee amount must be a non-negative number." };
  }
  return { ok: true, amount: clampNonNegativeNumber(amount) };
}

export type SystemPenaltyInput = {
  renewalSurchargePercent?: unknown;
  monthlyInterestPercent?: unknown;
  liquorTobaccoAddOnPercent?: unknown;
  powerDistributionFixedFee?: unknown;
  privatePortFixedFee?: unknown;
  renewalComplianceMinorPenalty?: unknown;
  renewalComplianceMajorPenalty?: unknown;
  renewalComplianceSeverePenalty?: unknown;
};

export type SystemPenaltyParsed = {
  renewalSurchargePercent: number;
  monthlyInterestPercent: number;
  liquorTobaccoAddOnPercent: number;
  powerDistributionFixedFee?: number;
  privatePortFixedFee?: number;
  renewalComplianceMinorPenalty?: number;
  renewalComplianceMajorPenalty?: number;
  renewalComplianceSeverePenalty?: number;
};

export type SettingsPolicyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Validates administrator save of surcharge / monthly interest / related penalties.
 */
export function parseSystemPenaltySettings(
  body: SystemPenaltyInput
): SettingsPolicyResult<SystemPenaltyParsed> {
  if (!isNonNegativeNumber(body.renewalSurchargePercent)) {
    return { ok: false, error: "Renewal surcharge percent must be non-negative." };
  }
  if (!isNonNegativeNumber(body.monthlyInterestPercent)) {
    return { ok: false, error: "Monthly interest percent must be non-negative." };
  }
  if (!isNonNegativeNumber(body.liquorTobaccoAddOnPercent)) {
    return { ok: false, error: "Liquor/tobacco add-on percent must be non-negative." };
  }

  const optionalMoney: Array<keyof SystemPenaltyInput> = [
    "powerDistributionFixedFee",
    "privatePortFixedFee",
    "renewalComplianceMinorPenalty",
    "renewalComplianceMajorPenalty",
    "renewalComplianceSeverePenalty",
  ];

  for (const key of optionalMoney) {
    const value = body[key];
    if (typeof value !== "undefined" && !isNonNegativeNumber(value)) {
      const labels: Record<string, string> = {
        powerDistributionFixedFee: "Power Distribution fixed fee must be non-negative.",
        privatePortFixedFee: "Private Port fixed fee must be non-negative.",
        renewalComplianceMinorPenalty: "Renewal compliance minor penalty must be non-negative.",
        renewalComplianceMajorPenalty: "Renewal compliance major penalty must be non-negative.",
        renewalComplianceSeverePenalty: "Renewal compliance severe penalty must be non-negative.",
      };
      return { ok: false, error: labels[key] };
    }
  }

  return {
    ok: true,
    value: {
      renewalSurchargePercent: body.renewalSurchargePercent,
      monthlyInterestPercent: body.monthlyInterestPercent,
      liquorTobaccoAddOnPercent: body.liquorTobaccoAddOnPercent,
      ...(typeof body.powerDistributionFixedFee === "number"
        ? { powerDistributionFixedFee: body.powerDistributionFixedFee }
        : {}),
      ...(typeof body.privatePortFixedFee === "number"
        ? { privatePortFixedFee: body.privatePortFixedFee }
        : {}),
      ...(typeof body.renewalComplianceMinorPenalty === "number"
        ? { renewalComplianceMinorPenalty: body.renewalComplianceMinorPenalty }
        : {}),
      ...(typeof body.renewalComplianceMajorPenalty === "number"
        ? { renewalComplianceMajorPenalty: body.renewalComplianceMajorPenalty }
        : {}),
      ...(typeof body.renewalComplianceSeverePenalty === "number"
        ? { renewalComplianceSeverePenalty: body.renewalComplianceSeverePenalty }
        : {}),
    },
  };
}

export function parseJitPortalEnabled(value: unknown): SettingsPolicyResult<boolean> {
  if (typeof value !== "boolean") {
    return { ok: false, error: "jitPortalEnabled must be a boolean." };
  }
  return { ok: true, value };
}

export type RenewalExtensionCreateInput = {
  startDate?: unknown;
  endDate?: unknown;
  isActive?: unknown;
  waiveSurcharge?: unknown;
  waiveInterest?: unknown;
};

export type RenewalExtensionCreateParsed = {
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  waiveSurcharge: boolean;
  waiveInterest: boolean;
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  // `new Date("YYYY-MM-DD")` parses as UTC midnight, which shifts the date
  // one day back in UTC+8 timezones (e.g. Jan 1 → Dec 31).
  // Parse as local time by splitting the ISO date string manually.
  const parts = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const [, y, m, d] = parts;
    const local = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(local.getTime()) ? null : local;
  }
  // Fallback for full ISO timestamps (e.g. from edit flows).
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Validates administrator create of a renewal extension (system configuration).
 */
export function parseRenewalExtensionCreate(
  body: RenewalExtensionCreateInput
): SettingsPolicyResult<RenewalExtensionCreateParsed> {
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  if (!startDate || !endDate) {
    return { ok: false, error: "Valid start and end dates are required." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "End date cannot be before start date." };
  }
  if (typeof body.isActive !== "boolean") {
    return { ok: false, error: "Enabled/disabled status is required." };
  }
  if (typeof body.waiveSurcharge !== "boolean") {
    return { ok: false, error: "Waive surcharge setting is required." };
  }
  if (typeof body.waiveInterest !== "boolean") {
    return { ok: false, error: "Waive interest setting is required." };
  }
  return {
    ok: true,
    value: {
      startDate,
      endDate,
      isActive: body.isActive,
      waiveSurcharge: body.waiveSurcharge,
      waiveInterest: body.waiveInterest,
    },
  };
}

/** Pure overlap check for active renewal extensions (inclusive date ranges). */
export function renewalExtensionRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

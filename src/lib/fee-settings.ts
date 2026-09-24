import { prisma } from "@/lib/prisma";
import { toMoneyNumber } from "@/lib/money";
import {
  BANK_CLASSIFICATIONS,
  DEFAULT_CLASSIFICATIONS,
  FIXED_FEE_CLASSIFICATION,
} from "@/lib/fee-constants";

export type FeeCategoryKey =
  | "MANUFACTURERS"
  | "BANKS"
  | "OTHER_FINANCIAL"
  | "CONTRACTORS"
  | "WHOLESALERS_RETAILERS"
  | "TRANSPORTATION"
  | "COMMUNICATIONS"
  | "LESSORS_LAND"
  | "LESSORS_COMMERCIAL"
  | "HOTELS_MOTELS"
  | "LODGING"
  | "AMUSEMENT"
  | "RESTAURANTS"
  | "LIQUOR_TOBACCO"
  | "POWER_COMPANY"
  | "POWER_GEN_DIST"
  | "OTHER_INDUSTRIAL"
  | "PRIVATE_PORT"
  | "GENERAL";

export type FeeCategoryOption = {
  key: FeeCategoryKey | string;
  label: string;
  classifications: string[];
  isCustom?: boolean;
};

const CONFIGURABLE_FEE_CATEGORY_KEYS = new Set<string>();

export { FIXED_FEE_CLASSIFICATION, BANK_CLASSIFICATIONS, DEFAULT_CLASSIFICATIONS };

export const FEE_CATEGORY_OPTIONS: FeeCategoryOption[] = [
  {
    key: "MANUFACTURERS",
    label: "Manufacturers / Importers / Producers",
    classifications: [
      "Micro Industry (no workers)",
      "Micro Industry (1–5)",
      "Cottage Industries A (6–10)",
      "Small-Scale Industries A (11–50)",
      "Small-Scale Industries B (51–99)",
      "Medium-Scale Industries (100–150)",
      "Large-Scale Industries (200+)",
    ],
  },
  {
    key: "BANKS",
    label: "Banks",
    classifications: [...BANK_CLASSIFICATIONS],
  },
  {
    key: "OTHER_FINANCIAL",
    label: "Other Financial Institutions",
    classifications: [
      "Micro Industry (no workers)",
      "Micro Industry (1–5)",
      "Cottage Industry (6–10)",
      "Small Industry (11–50)",
      "Medium Industry (51–99)",
      "Large Industry (100–150)",
      "Large Industry (200+)",
    ],
  },
  {
    key: "CONTRACTORS",
    label: "Contractors and Service Providers",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage A (6–10)",
      "Small A (11–50)",
      "Small B (51–99)",
      "Medium (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "WHOLESALERS_RETAILERS",
    label: "Wholesalers / Retailers / Dealers / Distributors",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage A (6–10)",
      "Small A (11–50)",
      "Small B (51–99)",
      "Medium (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "TRANSPORTATION",
    label: "Transportation Operations",
    classifications: [
      "Small-Scale (no workers)",
      "Small-Scale (1–5)",
      "Small-Scale (6–10)",
      "Medium-Scale (11–50)",
      "Medium-Scale (51–99)",
      "Large-Scale (100–150)",
      "Large-Scale (200+)",
    ],
  },
  {
    key: "COMMUNICATIONS",
    label: "Communications",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "LESSORS_LAND",
    label: "Lessors of Real Estate - Land",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "LESSORS_COMMERCIAL",
    label: "Lessors of Real Estate - Commercial Buildings",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "HOTELS_MOTELS",
    label: "Hotels / Motels / Pension Houses / Apartelles",
    classifications: [
      "Cottage (no workers)",
      "Cottage (1–5)",
      "Cottage (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "LODGING",
    label: "Lodging / Boarding Houses",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "AMUSEMENT",
    label: "Amusement Places",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "RESTAURANTS",
    label: "Restaurants / Cafés / Catering Services",
    classifications: [
      "Micro (no workers)",
      "Micro (1–5)",
      "Cottage (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "POWER_COMPANY",
    label: "Power Companies / Hydropower Plants",
    classifications: [FIXED_FEE_CLASSIFICATION],
  },
  {
    key: "POWER_GEN_DIST",
    label: "Power Generation and Distribution",
    classifications: [FIXED_FEE_CLASSIFICATION],
  },
  {
    key: "OTHER_INDUSTRIAL",
    label: "Other Industrial Companies",
    classifications: [
      "Small (no workers)",
      "Small (1–5)",
      "Small (6–10)",
      "Small (11–50)",
      "Medium (51–99)",
      "Large (100–150)",
      "Large (200+)",
    ],
  },
  {
    key: "PRIVATE_PORT",
    label: "Private Ports / Wharves",
    classifications: [FIXED_FEE_CLASSIFICATION],
  },
];

for (const option of FEE_CATEGORY_OPTIONS) {
  CONFIGURABLE_FEE_CATEGORY_KEYS.add(option.key);
}

export const DEFAULT_SYSTEM_FEE_SETTINGS = {
  renewalSurchargePercent: 25,
  monthlyInterestPercent: 2,
  liquorTobaccoAddOnPercent: 25,
  powerDistributionFixedFee: 10000,
  privatePortFixedFee: 50000,
} as const;

export type FeeConfigurationItemDto = {
  id: string;
  category: FeeCategoryKey;
  classification: string;
  amount: number;
  isActive: boolean;
  updatedAt: string;
};

export type SystemFeeSettingDto = {
  id: string;
  renewalSurchargePercent: number;
  monthlyInterestPercent: number;
  liquorTobaccoAddOnPercent: number;
  powerDistributionFixedFee: number;
  privatePortFixedFee: number;
  jitPortalEnabled: boolean;
  updatedAt: string;
};

export type RenewalExtensionDto = {
  id: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  waiveSurcharge: boolean;
  waiveInterest: boolean;
  updatedAt: string;
};

export function formatRenewalExtensionPeriod(
  startDate: Date | string,
  endDate: Date | string
): string {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  return `${start.toLocaleDateString("en-PH")} - ${end.toLocaleDateString("en-PH")}`;
}

export type RuntimeFeeSettings = {
  penalties: {
    renewalSurchargePercent: number;
    monthlyInterestPercent: number;
    liquorTobaccoAddOnPercent: number;
  };
  fixed: {
    powerCompanyFixedFee: number;
    powerGenerationDistributionFixedFee: number;
    privatePortFixedFee: number;
  };
  feeOverrides: Array<{
    category: FeeCategoryKey | string;
    classification: string;
    amount: number;
  }>;
  /** Exact Line of Business / fee category label → fee category key (includes CUSTOM_*). */
  categoryByLabel: Record<string, string>;
  activeExtension: {
    id: string;
    waiveSurcharge: boolean;
    waiveInterest: boolean;
    startDate: string;
    endDate: string;
  } | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return roundMoney(value);
}

function findFixedFeeOverride(
  rows: Array<{
    category: FeeCategoryKey;
    classification: string;
    amount: number;
    updatedAt: Date;
  }>,
  category: FeeCategoryKey
) {
  return rows.find(
    (row) => row.category === category && row.classification === FIXED_FEE_CLASSIFICATION
  );
}

function resolveFixedFeeAmount(input: {
  legacyAmount: number;
  legacyUpdatedAt: Date;
  overrideRow?: { amount: number; updatedAt: Date };
}): number {
  if (!input.overrideRow) {
    return input.legacyAmount;
  }

  return input.overrideRow.updatedAt >= input.legacyUpdatedAt
    ? input.overrideRow.amount
    : input.legacyAmount;
}


function parseClassificationsJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function slugifyFeeCategoryKey(label: string): string {
  const normalized = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return "CUSTOM_CATEGORY";
  return normalized.startsWith("CUSTOM_") ? normalized : `CUSTOM_${normalized}`;
}

export async function listCustomFeeCategories(): Promise<FeeCategoryOption[]> {
  try {
    const rows = await prisma.feeConfigurationCategory.findMany({
      where: { isActive: true },
      orderBy: { label: "asc" },
    });

    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      classifications: parseClassificationsJson(row.classifications),
      isCustom: true,
    }));
  } catch (error) {
    console.error("Failed to list custom fee categories:", error);
    return [];
  }
}

export async function getAllFeeCategoryOptions(): Promise<FeeCategoryOption[]> {
  const custom = await listCustomFeeCategories();
  const builtInKeys = new Set(FEE_CATEGORY_OPTIONS.map((item) => item.key));
  const filteredCustom = custom.filter((item) => !builtInKeys.has(item.key));
  return [...FEE_CATEGORY_OPTIONS, ...filteredCustom];
}

async function getConfigurableCategoryKeySet(): Promise<Set<string>> {
  const options = await getAllFeeCategoryOptions();
  return new Set(options.map((item) => item.key));
}

async function isConfigurableFeeCategoryKey(category: string): Promise<boolean> {
  const keys = await getConfigurableCategoryKeySet();
  return keys.has(category);
}

export function isValidClassificationForOptions(
  category: string,
  classification: string,
  options: FeeCategoryOption[]
): boolean {
  const option = options.find((item) => item.key === category);
  if (!option) return false;
  return option.classifications.includes(classification.trim());
}

export async function createFeeConfigurationCategory(input: {
  label: string;
  key?: string;
  classifications?: string[];
  useDefaultClassifications?: boolean;
  useFixedFeeOnly?: boolean;
  updatedById: string;
}): Promise<FeeCategoryOption> {
  const label = input.label.trim();
  if (!label) {
    throw new Error("Category label is required.");
  }

  const finalKey = input.key?.trim()
    ? slugifyFeeCategoryKey(input.key)
    : slugifyFeeCategoryKey(label);

  const allOptions = await getAllFeeCategoryOptions();
  if (
    allOptions.some(
      (item) =>
        item.key === finalKey ||
        item.label.trim().toLowerCase() === label.toLowerCase()
    )
  ) {
    throw new Error(`Business category "${label}" or key "${finalKey}" already exists.`);
  }

  let classificationsList: string[] = [];
  if (Array.isArray(input.classifications) && input.classifications.length > 0) {
    classificationsList = input.classifications
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter(Boolean);
  } else if (input.useFixedFeeOnly) {
    classificationsList = [FIXED_FEE_CLASSIFICATION];
  } else {
    classificationsList = [...DEFAULT_CLASSIFICATIONS];
  }

  if (classificationsList.length === 0) {
    throw new Error("At least one size classification is required.");
  }

  const existing = await prisma.feeConfigurationCategory.findUnique({
    where: { key: finalKey },
  });

  let row;
  if (existing) {
    row = await prisma.feeConfigurationCategory.update({
      where: { feeConfigurationCategoryId: existing.feeConfigurationCategoryId },
      data: {
        label,
        classifications: classificationsList,
        isActive: true,
        updatedById: input.updatedById,
      },
    });
  } else {
    row = await prisma.feeConfigurationCategory.create({
      data: {
        key: finalKey,
        label,
        classifications: classificationsList,
        isActive: true,
        updatedById: input.updatedById,
      },
    });
  }

  return {
    key: row.key,
    label: row.label,
    classifications: parseClassificationsJson(row.classifications),
    isCustom: true,
  };
}

export async function listFeeConfigurationItems(): Promise<FeeConfigurationItemDto[]> {
  const [items, configurableKeys] = await Promise.all([
    prisma.feeConfigurationItem.findMany({
      orderBy: [{ category: "asc" }, { classification: "asc" }],
    }),
    getConfigurableCategoryKeySet(),
  ]);

  return items
    .filter((item) => configurableKeys.has(item.category))
    .map((item) => ({
      id: item.feeConfigurationItemId,
      category: item.category as FeeCategoryKey,
      classification: item.classification,
      amount: toMoneyNumber(item.amount),
      isActive: item.isActive,
      updatedAt: item.updatedAt.toISOString(),
    }));
}

export async function upsertFeeConfigurationItem(input: {
  category: string;
  classification: string;
  amount: number;
  isActive: boolean;
  updatedById: string;
}): Promise<FeeConfigurationItemDto> {
  if (!(await isConfigurableFeeCategoryKey(input.category))) {
    throw new Error("Invalid fee category.");
  }

  const options = await getAllFeeCategoryOptions();
  const classification = input.classification.trim();
  if (!classification) {
    throw new Error("Size classification is required.");
  }

  if (!isValidClassificationForOptions(input.category, classification, options)) {
    throw new Error("Invalid size classification for the selected business category.");
  }

  const amount = clampNonNegative(input.amount);
  const row = await prisma.feeConfigurationItem.upsert({
    where: {
      category_classification: {
        category: input.category,
        classification,
      },
    },
    create: {
      category: input.category,
      classification,
      amount,
      isActive: input.isActive,
      updatedById: input.updatedById,
    },
    update: {
      amount,
      isActive: input.isActive,
      updatedById: input.updatedById,
    },
  });

  return {
    id: row.feeConfigurationItemId,
    category: row.category as FeeCategoryKey,
    classification: row.classification,
    amount: toMoneyNumber(row.amount),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateFeeConfigurationItemById(input: {
  id: string;
  amount?: number;
  isActive?: boolean;
  updatedById: string;
}): Promise<FeeConfigurationItemDto> {
  const row = await prisma.feeConfigurationItem.update({
    where: { feeConfigurationItemId: input.id },
    data: {
      ...(typeof input.amount === "number" ? { amount: clampNonNegative(input.amount) } : {}),
      ...(typeof input.isActive === "boolean" ? { isActive: input.isActive } : {}),
      updatedById: input.updatedById,
    },
  });

  return {
    id: row.feeConfigurationItemId,
    category: row.category as FeeCategoryKey,
    classification: row.classification,
    amount: toMoneyNumber(row.amount),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteFeeConfigurationItem(id: string): Promise<FeeConfigurationItemDto> {
  const existing = await prisma.feeConfigurationItem.findUnique({
    where: { feeConfigurationItemId: id },
  });
  if (!existing) {
    throw new Error("Fee configuration item not found.");
  }

  const row = await prisma.feeConfigurationItem.delete({
    where: { feeConfigurationItemId: id },
  });
  return {
    id: row.feeConfigurationItemId,
    category: row.category as FeeCategoryKey,
    classification: row.classification,
    amount: toMoneyNumber(row.amount),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Permanently delete a custom fee category and all of its fee table entries. */
export async function deleteFeeConfigurationCategory(key: string): Promise<{
  key: string;
  label: string;
  deletedFeeItems: number;
}> {
  const normalizedKey = key.trim();
  if (FEE_CATEGORY_OPTIONS.some((item) => item.key === normalizedKey)) {
    throw new Error("Built-in business categories cannot be deleted.");
  }

  const existing = await prisma.feeConfigurationCategory.findUnique({
    where: { key: normalizedKey },
  });

  if (!existing) {
    throw new Error("Business category not found.");
  }

  const [deletedFeeItems, deletedCategory] = await prisma.$transaction([
    prisma.feeConfigurationItem.deleteMany({
      where: { category: normalizedKey },
    }),
    prisma.feeConfigurationCategory.delete({
      where: { feeConfigurationCategoryId: existing.feeConfigurationCategoryId },
    }),
  ]);

  return {
    key: deletedCategory.key,
    label: deletedCategory.label,
    deletedFeeItems: deletedFeeItems.count,
  };
}

export async function getOrCreateSystemFeeSetting(): Promise<SystemFeeSettingDto> {
  const existing = await prisma.systemFeeSetting.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  const row =
    existing ??
    (await prisma.systemFeeSetting.create({
      data: {
        ...DEFAULT_SYSTEM_FEE_SETTINGS,
      },
    }));

  return {
    id: row.systemFeeSettingId,
    renewalSurchargePercent: row.renewalSurchargePercent,
    monthlyInterestPercent: row.monthlyInterestPercent,
    liquorTobaccoAddOnPercent: row.liquorTobaccoAddOnPercent,
    powerDistributionFixedFee: toMoneyNumber(row.powerDistributionFixedFee),
    privatePortFixedFee: toMoneyNumber(row.privatePortFixedFee),
    jitPortalEnabled: row.jitPortalEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateSystemFeeSetting(input: {
  renewalSurchargePercent: number;
  monthlyInterestPercent: number;
  liquorTobaccoAddOnPercent: number;
  powerDistributionFixedFee?: number;
  privatePortFixedFee?: number;
  updatedById: string;
}): Promise<SystemFeeSettingDto> {
  const current = await getOrCreateSystemFeeSetting();
  const row = await prisma.systemFeeSetting.update({
    where: { systemFeeSettingId: current.id },
    data: {
      renewalSurchargePercent: clampNonNegative(input.renewalSurchargePercent),
      monthlyInterestPercent: clampNonNegative(input.monthlyInterestPercent),
      liquorTobaccoAddOnPercent: clampNonNegative(input.liquorTobaccoAddOnPercent),
      powerDistributionFixedFee:
        typeof input.powerDistributionFixedFee === "number"
          ? clampNonNegative(input.powerDistributionFixedFee)
          : undefined,
      privatePortFixedFee:
        typeof input.privatePortFixedFee === "number"
          ? clampNonNegative(input.privatePortFixedFee)
          : undefined,
      updatedById: input.updatedById,
    },
  });

  return {
    id: row.systemFeeSettingId,
    renewalSurchargePercent: row.renewalSurchargePercent,
    monthlyInterestPercent: row.monthlyInterestPercent,
    liquorTobaccoAddOnPercent: row.liquorTobaccoAddOnPercent,
    powerDistributionFixedFee: toMoneyNumber(row.powerDistributionFixedFee),
    privatePortFixedFee: toMoneyNumber(row.privatePortFixedFee),
    jitPortalEnabled: row.jitPortalEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRenewalExtensions(): Promise<RenewalExtensionDto[]> {
  const rows = await prisma.renewalExtension.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  return rows.map((row) => ({
    id: row.renewalExtensionId,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    isActive: row.isActive,
    waiveSurcharge: row.waiveSurcharge,
    waiveInterest: row.waiveInterest,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function ensureNoActiveOverlap(startDate: Date, endDate: Date, ignoreId?: string) {
  const overlap = await prisma.renewalExtension.findFirst({
    where: {
      isActive: true,
      ...(ignoreId ? { renewalExtensionId: { not: ignoreId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { renewalExtensionId: true, startDate: true, endDate: true },
  });

  if (overlap) {
    throw new Error(
      `Active extension overlaps with existing extension (${formatRenewalExtensionPeriod(overlap.startDate, overlap.endDate)}).`
    );
  }
}

export async function createRenewalExtension(input: {
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  waiveSurcharge: boolean;
  waiveInterest: boolean;
  updatedById: string;
}): Promise<RenewalExtensionDto> {
  if (input.endDate < input.startDate) {
    throw new Error("End date cannot be before start date.");
  }

  if (input.isActive) {
    await ensureNoActiveOverlap(input.startDate, input.endDate);
  }

  const row = await prisma.renewalExtension.create({
    data: {
      startDate: input.startDate,
      endDate: input.endDate,
      isActive: input.isActive,
      waiveSurcharge: input.waiveSurcharge,
      waiveInterest: input.waiveInterest,
      remarks: null,
      updatedById: input.updatedById,
    },
  });

  return {
    id: row.renewalExtensionId,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    isActive: row.isActive,
    waiveSurcharge: row.waiveSurcharge,
    waiveInterest: row.waiveInterest,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function toggleRenewalExtension(input: {
  extensionId: string;
  isActive: boolean;
  updatedById: string;
}): Promise<RenewalExtensionDto> {
  const current = await prisma.renewalExtension.findUnique({
    where: { renewalExtensionId: input.extensionId },
  });

  if (!current) {
    throw new Error("Extension not found.");
  }

  if (input.isActive) {
    await ensureNoActiveOverlap(current.startDate, current.endDate, current.renewalExtensionId);
  }

  const row = await prisma.renewalExtension.update({
    where: { renewalExtensionId: input.extensionId },
    data: {
      isActive: input.isActive,
      updatedById: input.updatedById,
    },
  });

  return {
    id: row.renewalExtensionId,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    isActive: row.isActive,
    waiveSurcharge: row.waiveSurcharge,
    waiveInterest: row.waiveInterest,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getRuntimeFeeSettings(now = new Date()): Promise<RuntimeFeeSettings> {
  const [penalties, feeOverrides, activeExtension, configurableKeys, categoryOptions] = await Promise.all([
    getOrCreateSystemFeeSetting(),
    prisma.feeConfigurationItem.findMany({
      where: { isActive: true },
      select: { category: true, classification: true, amount: true, updatedAt: true },
      orderBy: [{ category: "asc" }, { classification: "asc" }],
    }),
    prisma.renewalExtension.findFirst({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: "desc" },
      select: {
        renewalExtensionId: true,
        waiveSurcharge: true,
        waiveInterest: true,
        startDate: true,
        endDate: true,
      },
    }),
    getConfigurableCategoryKeySet(),
    getAllFeeCategoryOptions(),
  ]);

  const feeOverrideRows = feeOverrides
    .map((row) => ({
      category: row.category as FeeCategoryKey,
      classification: row.classification,
      amount: toMoneyNumber(row.amount),
      updatedAt: row.updatedAt,
    }))
    .filter((row) => configurableKeys.has(row.category));
  const penaltiesUpdatedAt = new Date(penalties.updatedAt);
  const powerCompanyOverride = findFixedFeeOverride(feeOverrideRows, "POWER_COMPANY");
  const powerGenDistOverride = findFixedFeeOverride(feeOverrideRows, "POWER_GEN_DIST");
  const privatePortOverride = findFixedFeeOverride(feeOverrideRows, "PRIVATE_PORT");

  const categoryByLabel: Record<string, string> = {};
  for (const option of categoryOptions) {
    const label = option.label.trim();
    if (!label) continue;
    categoryByLabel[label] = option.key;
    categoryByLabel[label.toLowerCase()] = option.key;
    // Normalize en-dash / em-dash variants used in older fee table labels.
    const hyphenated = label.replace(/[–—]/g, "-");
    categoryByLabel[hyphenated] = option.key;
    categoryByLabel[hyphenated.toLowerCase()] = option.key;
  }
  // Legacy applicant LOB that maps to Land lessors.
  categoryByLabel["Lessors of Real Estate"] = "LESSORS_LAND";
  categoryByLabel["lessors of real estate"] = "LESSORS_LAND";

  return {
    penalties: {
      renewalSurchargePercent: penalties.renewalSurchargePercent,
      monthlyInterestPercent: penalties.monthlyInterestPercent,
      liquorTobaccoAddOnPercent: penalties.liquorTobaccoAddOnPercent,
    },
    fixed: {
      powerCompanyFixedFee: resolveFixedFeeAmount({
        legacyAmount: toMoneyNumber(penalties.powerDistributionFixedFee),
        legacyUpdatedAt: penaltiesUpdatedAt,
        overrideRow: powerCompanyOverride,
      }),
      powerGenerationDistributionFixedFee: resolveFixedFeeAmount({
        legacyAmount: toMoneyNumber(penalties.powerDistributionFixedFee),
        legacyUpdatedAt: penaltiesUpdatedAt,
        overrideRow: powerGenDistOverride,
      }),
      privatePortFixedFee: resolveFixedFeeAmount({
        legacyAmount: toMoneyNumber(penalties.privatePortFixedFee),
        legacyUpdatedAt: penaltiesUpdatedAt,
        overrideRow: privatePortOverride,
      }),
    },
    feeOverrides: feeOverrideRows.map((row) => ({
      category: row.category,
      classification: row.classification,
      amount: row.amount,
    })),
    categoryByLabel,
    activeExtension: activeExtension
      ? {
          id: activeExtension.renewalExtensionId,
          waiveSurcharge: activeExtension.waiveSurcharge,
          waiveInterest: activeExtension.waiveInterest,
          startDate: activeExtension.startDate.toISOString(),
          endDate: activeExtension.endDate.toISOString(),
        }
      : null,
  };
}

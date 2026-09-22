/** Shared fee schedule constants (no DB imports — safe for unit tests). */

export const FIXED_FEE_CLASSIFICATION = "Fixed Fee";

export const BANK_CLASSIFICATIONS = [
  "Rural / Thrift / Savings Banks",
  "Commercial and Development Banks",
  "Universal Banks",
] as const;

export const DEFAULT_CLASSIFICATIONS = [
  "Micro (no workers)",
  "Micro (1–5)",
  "Cottage (6–10)",
  "Small (11–50)",
  "Medium (51–99)",
  "Large (100–150)",
  "Large (200+)",
] as const;

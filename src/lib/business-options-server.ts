import "server-only";

import {
  LINE_OF_BUSINESS_OPTIONS,
  isValidLineOfBusiness,
  isDisallowedForNewApplications,
} from "@/lib/business-options";
import { listCustomFeeCategories } from "@/lib/fee-settings";

/**
 * Built-in LOB labels plus active custom Super Admin fee category labels.
 * Server-only — must not be imported from client components.
 */
export async function getLineOfBusinessOptions(): Promise<string[]> {
  const custom = await listCustomFeeCategories();

  const seen = new Set<string>();
  const options: string[] = [];

  for (const label of LINE_OF_BUSINESS_OPTIONS) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    options.push(trimmed);
  }

  for (const category of custom) {
    const trimmed = category.label.trim();
    if (!trimmed || seen.has(trimmed) || isDisallowedForNewApplications(trimmed)) continue;
    seen.add(trimmed);
    options.push(trimmed);
  }

  return options;
}

export async function isAllowedLineOfBusiness(
  value: string | null | undefined,
  context?: { applicationType?: string }
): Promise<boolean> {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;

  // New applications cannot use Bank / Banks or legacy options
  if (context?.applicationType === "NEW" && isDisallowedForNewApplications(normalized)) {
    return false;
  }

  // If new application, must be in active LINE_OF_BUSINESS_OPTIONS or active custom categories
  if (context?.applicationType === "NEW") {
    if (LINE_OF_BUSINESS_OPTIONS.some((opt) => opt === normalized)) return true;
    const options = await getLineOfBusinessOptions();
    return options.includes(normalized);
  }

  if (isValidLineOfBusiness(normalized)) return true;
  const options = await getLineOfBusinessOptions();
  return options.includes(normalized);
}

export const LINE_OF_BUSINESS_OPTIONS = [
  "Manufacturers / Importers / Producers",
  "Other Financial Institutions",
  "Contractors and Service Providers",
  "Wholesalers / Retailers / Dealers / Distributors",
  "Transportation Operations",
  "Communications",
  "Lessors of Real Estate - Land",
  "Lessors of Real Estate - Commercial Buildings",
  "Hotels / Motels / Pension Houses / Apartelles",
  "Lodging / Boarding Houses",
  "Amusement Places",
  "Restaurants / Cafés / Catering Services",
  "Power Companies / Hydropower Plants",
  "Power Generation and Distribution",
  "Other Industrial Companies",
  "Private Ports / Wharves",
] as const;

export type LineOfBusinessOption = (typeof LINE_OF_BUSINESS_OPTIONS)[number];

/** Legacy LOB labels still accepted on older applications/records for backward compatibility. */
export const LEGACY_LINE_OF_BUSINESS_OPTIONS = [
  "Lessors of Real Estate",
  "Banks",
  "Bank",
] as const;

/** Checks if a line of business is disallowed for new applications (e.g., Bank / Banks). */
export function isDisallowedForNewApplications(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "bank" || normalized === "banks" || normalized === "lessors of real estate";
}

/** Built-in LOB options only (sync). Prefer `isAllowedLineOfBusiness` on the server when custom fee categories matter. */
export function isValidLineOfBusiness(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return (
    LINE_OF_BUSINESS_OPTIONS.some((option) => option === normalized) ||
    LEGACY_LINE_OF_BUSINESS_OPTIONS.some((option) => option.toLowerCase() === normalized.toLowerCase())
  );
}

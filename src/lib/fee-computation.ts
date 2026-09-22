/**
 * Mayor's Permit Fee computation helper.
 * Source: eBPLS municipal business permit fee schedule.
 *
 * Determination order:
 *  1. Exact LOB → category (including CUSTOM_* from Super Admin).
 *  2. Fixed-fee / bank specials by exact category or LOB text.
 *  3. Keyword regex specials only when no exact category match.
 *  4. Standard asset × worker comparison (higher fee wins).
 *  5. Apply FeeConfigurationItem overrides by matching classification label.
 *  6. Late surcharge/interest when isLateRenewal / lateMonths are set (also applied in BPLO assessment).
 *  7. Liquor/Tobacco add-on is a separate assessment line from the isLiquorOrTobacco checkbox
 *     (or LOB keyword detection), not multiplied inside the mayor's base fee.
 *  8. Closure: Mayor's fee ₱0 + Closure Certificate Fee ₱100.
 */

import {
  BANK_CLASSIFICATIONS,
  DEFAULT_CLASSIFICATIONS,
  FIXED_FEE_CLASSIFICATION,
} from "@/lib/fee-constants";
import type { FeeCategoryKey, RuntimeFeeSettings } from "@/lib/fee-settings";


// ---------------------------------------------------------------------------
// Asset-size brackets (7 exact tiers per the fee schedule)
// ---------------------------------------------------------------------------
export type AssetBracket =
  | "BELOW_100K"
  | "FROM_100K_TO_250K"
  | "FROM_250K_TO_500K"
  | "FROM_500K_TO_2M"
  | "FROM_2M_TO_5M"
  | "FROM_5M_TO_20M"
  | "OVER_20M";

const ASSET_BRACKET_LABELS: Record<AssetBracket, string> = {
  BELOW_100K:        "Below ₱100,000",
  FROM_100K_TO_250K: "₱100,000 – ₱250,000",
  FROM_250K_TO_500K: "₱250,000 – ₱500,000",
  FROM_500K_TO_2M:   "₱500,000 – ₱2,000,000",
  FROM_2M_TO_5M:     "₱2,000,000 – ₱5,000,000",
  FROM_5M_TO_20M:    "₱5,000,000 – ₱20,000,000",
  OVER_20M:          "Over ₱20,000,000",
};

/** Map asset tier names used as row headers in the fee schedule to their fee tiers. */
const ASSET_TIER_NAMES: Record<AssetBracket, string> = {
  BELOW_100K:        "Micro Industry",
  FROM_100K_TO_250K: "Cottage Industries A",
  FROM_250K_TO_500K: "Cottage Industries B",
  FROM_500K_TO_2M:   "Small-Scale Industries A",
  FROM_2M_TO_5M:     "Small-Scale Industries B",
  FROM_5M_TO_20M:    "Medium-Scale Industries",
  OVER_20M:          "Large-Scale Industries",
};

// ---------------------------------------------------------------------------
// Worker-count brackets (7 exact tiers per the fee schedule)
// ---------------------------------------------------------------------------
export type WorkerBracket =
  | "NONE"
  | "FROM_1_TO_5"
  | "FROM_6_TO_10"
  | "FROM_11_TO_50"
  | "FROM_51_TO_99"
  | "FROM_100_TO_199"
  | "FROM_200_OR_MORE";

const WORKER_BRACKET_LABELS: Record<WorkerBracket, string> = {
  NONE:             "None",
  FROM_1_TO_5:      "1–5 workers",
  FROM_6_TO_10:     "6–10 workers",
  FROM_11_TO_50:    "11–50 workers",
  FROM_51_TO_99:    "51–99 workers",
  FROM_100_TO_199:  "100–199 workers",
  FROM_200_OR_MORE: "200 or more workers",
};

// ---------------------------------------------------------------------------
// Business categories
// ---------------------------------------------------------------------------
export type BusinessCategory =
  | "MANUFACTURERS"        // Manufacturers / Importers / Producers
  | "BANKS"                // Banks (sub-typed by bank class)
  | "OTHER_FINANCIAL"      // Other Financial Institutions
  | "CONTRACTORS"          // Contractors and Service Providers
  | "WHOLESALERS_RETAILERS"// Wholesalers / Retailers / Dealers / Distributors
  | "TRANSPORTATION"       // Transportation Operations
  | "COMMUNICATIONS"       // Communications
  | "LESSORS_LAND"         // Lessors of Real Estate – Land
  | "LESSORS_COMMERCIAL"   // Lessors of Real Estate – Commercial Buildings
  | "HOTELS_MOTELS"        // Hotels, Motels, Pension Houses, Apartelles
  | "LODGING"              // Lodging / Boarding Houses
  | "AMUSEMENT"            // Amusement Places
  | "RESTAURANTS"          // Restaurants, Cafés, Catering Services
  | "LIQUOR_TOBACCO"       // Liquor and Tobacco (base category only)
  | "POWER_COMPANY"        // Power Companies / Hydropower Plants — ₱10,000 fixed
  | "POWER_GEN_DIST"       // Power Generation and Distribution — ₱10,000 fixed
  | "OTHER_INDUSTRIAL"     // Other Industrial Companies
  | "PRIVATE_PORT"         // Private Ports / Wharves — ₱50,000 fixed
  | "GENERAL";             // Fallback

// Ordered keyword list — FIRST match wins; more specific patterns must come before general ones.
const CATEGORY_KEYWORDS: Array<{ category: BusinessCategory; keywords: string[] }> = [
  // Fixed-fee categories first
  { category: "PRIVATE_PORT",         keywords: ["private port", "private wharf", "port operation", "port facility", "wharf", "pier facility", "harbor terminal", "marina"] },
  { category: "POWER_COMPANY",        keywords: ["power company", "hydropower", "hydro power", "hydroelectric", "electric cooperative"] },
  { category: "POWER_GEN_DIST",       keywords: ["power generation", "power distribution", "generation company", "distribution company", "electricity generation", "electricity distribution"] },
  // Liquor/Tobacco — explicit primary business only
  { category: "LIQUOR_TOBACCO",       keywords: ["liquor store", "wine shop", "beer distributor", "spirits dealer", "tobacco shop", "cigarette dealer", "liquor dealer", "alcohol distributor", "wine dealer"] },
  // Banks — checked separately by sub-type; listed here only for detection order
  { category: "BANKS",                keywords: ["rural bank", "thrift bank", "savings bank", "commercial bank", "development bank", "universal bank", "cooperative bank", "microfinance bank", "banks"] },
  { category: "OTHER_FINANCIAL",      keywords: ["lending", "credit company", "finance company", "insurance", "pawnshop", "remittance", "money changer", "money transfer", "investment house", "securities", "fund management", "microfinance institution", "cooperative financial"] },
  { category: "MANUFACTURERS",        keywords: ["manufactur", "factory", "fabricat", "assembl", "bakery", "food process", "production plant", "printing press", "garment", "weaving", "welding shop", "foundry", "importer", "producer", "packaging", "bottl"] },
  { category: "CONTRACTORS",          keywords: ["contractor", "construct", "builder", "carpentry", "plumbing", "electrical contractor", "civil works", "mason", "painting service", "roofing", "service provider", "pest control", "janitorial", "security agency", "manpower", "landscaping", "repair shop", "salon", "spa", "clinic", "dental", "medical", "veterinary", "funeral", "mortuary", "advertising agency", "it services", "software", "legal", "accounting", "consult", "architect", "engineering firm", "professional service"] },
  { category: "TRANSPORTATION",       keywords: ["transport", "logistic", "delivery service", "trucking", "freight", "cargo", "courier", "taxi", "bus company", "tricycle operator", "jeepney", "shipping line", "forwarding", "airline", "vessel", "ferry"] },
  { category: "COMMUNICATIONS",       keywords: ["telecom", "telecommunications", "telephone company", "internet provider", "cable tv", "cable television", "broadcasting", "radio station", "tv station", "satellite", "cellular", "mobile network"] },
  { category: "HOTELS_MOTELS",        keywords: ["hotel", "motel", "pension house", "apartelle", "resort", "inn ", "bed and breakfast", "hostel", "transient house"] },
  { category: "LODGING",              keywords: ["boarding house", "lodging", "dormitory", "student housing", "transient dormitory"] },
  { category: "AMUSEMENT",            keywords: ["amusement", "arcade", "billiard", "cinema", "theater", "theatre", "bowling", "golf", "swimming pool", "spa resort", "entertainment center", "karaoke", "bar ", "night club", "nightclub", "disco", "cockpit", "horse race", "casino", "bingo", "gambling"] },
  { category: "RESTAURANTS",          keywords: ["restaurant", "eatery", "cafe", "catering", "fast food", "food service", "cafeteria", "kiosk food", "carinderia", "canteen", "food court", "bakeshop", "bakery resto", "coffee shop", "diner"] },
  { category: "LESSORS_COMMERCIAL",   keywords: ["lessor commercial", "commercial space", "commercial building", "office space", "stall rental", "commercial lot lessor", "mall owner", "commercial property", "rental commercial", "lessors of real estate - commercial", "lessors of real estate – commercial"] },
  { category: "LESSORS_LAND",         keywords: ["lessor land", "land rental", "lot rental", "real estate lessor", "land owner", "agricultural lessor", "lessor of real property", "lessors of real estate", "lessors of real estate - land", "lessors of real estate – land"] },
  { category: "WHOLESALERS_RETAILERS",keywords: ["wholesale", "retail", " store", "shop", "trading", "drugstore", "pharmacy", "grocery", "supermarket", "hardware", "boutique", "department store", "sari-sari", "convenience store", "distribut", "supplier", "dealer", "market vendor", "trading post", "merchandise"] },
  { category: "OTHER_INDUSTRIAL",     keywords: ["industrial", "processing plant", "recycling", "waste management", "chemical", "petroleum", "mining", "quarry", "rice mill", "sugar mill", "water refilling", "ice plant", "fuel station", "gasoline station", "lpg", "oil depot"] },
];

// ---------------------------------------------------------------------------
// Per-category fee tables
// Each entry has two arrays of 7 numbers (one per asset bracket, one per
// worker bracket).  Indices match the order of ASSET_BRACKETS / WORKER_BRACKETS.
// Tier name comments document which fee-schedule row each index maps to.
//
// Asset bracket order:
//   [0] BELOW_100K  [1] FROM_100K_TO_250K  [2] FROM_250K_TO_500K
//   [3] FROM_500K_TO_2M  [4] FROM_2M_TO_5M  [5] FROM_5M_TO_20M  [6] OVER_20M
//
// Worker bracket order:
//   [0] NONE  [1] FROM_1_TO_5  [2] FROM_6_TO_10  [3] FROM_11_TO_50
//   [4] FROM_51_TO_99  [5] FROM_100_TO_199  [6] FROM_200_OR_MORE
// ---------------------------------------------------------------------------

const ASSET_BRACKETS: AssetBracket[] = [
  "BELOW_100K",
  "FROM_100K_TO_250K",
  "FROM_250K_TO_500K",
  "FROM_500K_TO_2M",
  "FROM_2M_TO_5M",
  "FROM_5M_TO_20M",
  "OVER_20M",
];

const WORKER_BRACKETS: WorkerBracket[] = [
  "NONE",
  "FROM_1_TO_5",
  "FROM_6_TO_10",
  "FROM_11_TO_50",
  "FROM_51_TO_99",
  "FROM_100_TO_199",
  "FROM_200_OR_MORE",
];

interface CategoryFeeTable {
  label: string;
  /** Fee amounts indexed by ASSET_BRACKETS position (7 values). */
  assetFees: readonly number[];
  /** Fee amounts indexed by WORKER_BRACKETS position (7 values). */
  workerFees: readonly number[];
  /** Tier label for each asset bracket. */
  assetTierNames: readonly string[];
  /** Tier label for each worker bracket. */
  workerTierNames: readonly string[];
}

// Helpers to build repetitive tables
function buildFees7(values: readonly number[]): readonly number[] {
  if (values.length !== 7) throw new Error(`Expected 7 values, got ${values.length}`);
  return values;
}

const FEE_TABLES: Partial<Record<BusinessCategory, CategoryFeeTable>> = {
  // ── Manufacturers / Importers / Producers ──────────────────────────────
  // Asset tiers: Micro ₱200 | Cottage A ₱400 | Cottage B ₱650 |
  //              Small A ₱1,800 | Small B ₱3,000 | Medium ₱4,000 | Large ₱6,000
  // Worker mapping: NONE/1-5→Micro | 6-10→Cottage A | 11-50→Small A |
  //                 51-99→Small B | 100-150→Medium | 200+→Large
  MANUFACTURERS: {
    label: "Manufacturers / Importers / Producers",
    assetFees:  buildFees7([200, 400, 650, 1800, 3000, 4000, 6000]),
    workerFees: buildFees7([200, 200, 400, 1800, 3000, 4000, 6000]),
    assetTierNames: ["Micro Industry", "Cottage Industries A", "Cottage Industries B", "Small-Scale Industries A", "Small-Scale Industries B", "Medium-Scale Industries", "Large-Scale Industries"],
    workerTierNames: ["Micro Industry (no workers)", "Micro Industry (1–5)", "Cottage Industries A (6–10)", "Small-Scale Industries A (11–50)", "Small-Scale Industries B (51–99)", "Medium-Scale Industries (100–150)", "Large-Scale Industries (200+)"],
  },

  // ── Other Financial Institutions ────────────────────────────────────────
  // Asset tiers: Micro ₱1,000 | (Cottage A+B→) Cottage ₱3,000 |
  //              (Small A+B→) Small ₱4,000 | Medium ₱5,000 | Large ₱6,000
  OTHER_FINANCIAL: {
    label: "Other Financial Institutions",
    assetFees:  buildFees7([1000, 3000, 3000, 4000, 5000, 6000, 6000]),
    workerFees: buildFees7([1000, 1000, 3000, 4000, 5000, 6000, 6000]),
    assetTierNames: ["Micro Industry", "Cottage Industry (₱100K–₱250K)", "Cottage Industry (₱250K–₱500K)", "Small Industry (₱500K–₱2M)", "Medium Industry (₱2M–₱5M)", "Large Industry (₱5M–₱20M)", "Large Industry (Over ₱20M)"],
    workerTierNames: ["Micro Industry (no workers)", "Micro Industry (1–5)", "Cottage Industry (6–10)", "Small Industry (11–50)", "Medium Industry (51–99)", "Large Industry (100–150)", "Large Industry (200+)"],
  },

  // ── Contractors and Service Providers ────────────────────────────────────
  // Micro ₱250 | Cottage A ₱500 | Cottage B ₱1,000 |
  // Small A ₱1,500 | Small B ₱3,000 | Medium ₱4,000 | Large ₱6,000
  CONTRACTORS: {
    label: "Contractors and Service Providers",
    assetFees:  buildFees7([250, 500, 1000, 1500, 3000, 4000, 6000]),
    workerFees: buildFees7([250, 250, 500, 1500, 3000, 4000, 6000]),
    assetTierNames: ["Micro", "Cottage A", "Cottage B", "Small A", "Small B", "Medium", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage A (6–10)", "Small A (11–50)", "Small B (51–99)", "Medium (100–150)", "Large (200+)"],
  },

  // ── Wholesalers / Retailers / Dealers / Distributors ─────────────────────
  // Micro ₱200 | Cottage A ₱500 | Cottage B ₱1,200 |
  // Small A ₱2,500 | Small B ₱3,500 | Medium ₱5,000 | Large ₱6,000
  WHOLESALERS_RETAILERS: {
    label: "Wholesalers / Retailers / Dealers / Distributors",
    assetFees:  buildFees7([200, 500, 1200, 2500, 3500, 5000, 6000]),
    workerFees: buildFees7([200, 200, 500, 2500, 3500, 5000, 6000]),
    assetTierNames: ["Micro", "Cottage A", "Cottage B", "Small A", "Small B", "Medium", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage A (6–10)", "Small A (11–50)", "Small B (51–99)", "Medium (100–150)", "Large (200+)"],
  },

  // ── Transportation Operations ─────────────────────────────────────────────
  // Small-Scale ₱4,000 | Medium-Scale ₱6,000 | Large-Scale ₱10,000
  // Asset: BELOW_100K–FROM_500K_TO_2M → Small ₱4,000
  //        FROM_2M_TO_5M–FROM_5M_TO_20M → Medium ₱6,000
  //        OVER_20M → Large ₱10,000
  // Worker: NONE–FROM_6_TO_10 → Small | 11-99 → Medium | 100+ → Large
  TRANSPORTATION: {
    label: "Transportation Operations",
    assetFees:  buildFees7([4000, 4000, 4000, 4000, 6000, 6000, 10000]),
    workerFees: buildFees7([4000, 4000, 4000, 6000, 6000, 10000, 10000]),
    assetTierNames: ["Small-Scale", "Small-Scale", "Small-Scale", "Small-Scale", "Medium-Scale", "Medium-Scale", "Large-Scale"],
    workerTierNames: ["Small-Scale (no workers)", "Small-Scale (1–5)", "Small-Scale (6–10)", "Medium-Scale (11–50)", "Medium-Scale (51–99)", "Large-Scale (100–150)", "Large-Scale (200+)"],
  },

  // ── Communications ────────────────────────────────────────────────────────
  // Micro ₱500 | Cottage ₱1,500 | Small ₱3,000 | Medium ₱5,000 | Large ₱8,000
  // Asset: BELOW_100K → Micro | 100K-500K → Cottage | 500K-2M → Small |
  //        2M-20M → Medium/Large (split at 5M) | OVER_20M → Large
  COMMUNICATIONS: {
    label: "Communications",
    assetFees:  buildFees7([500, 1500, 1500, 3000, 5000, 8000, 8000]),
    workerFees: buildFees7([500, 500, 1500, 3000, 5000, 8000, 8000]),
    assetTierNames: ["Micro", "Cottage", "Cottage", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // ── Lessors of Real Estate – Land ─────────────────────────────────────────
  // Micro ₱500 | Cottage ₱1,000 | Small ₱1,500 | Medium ₱2,500 | Large ₱4,000
  LESSORS_LAND: {
    label: "Lessors of Real Estate – Land",
    assetFees:  buildFees7([500, 1000, 1000, 1500, 2500, 4000, 4000]),
    workerFees: buildFees7([500, 500, 1000, 1500, 2500, 4000, 4000]),
    assetTierNames: ["Micro", "Cottage", "Cottage", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // ── Lessors of Real Estate – Commercial Buildings ─────────────────────────
  // Micro ₱500 | Cottage ₱1,000 | Small ₱2,000 | Medium ₱3,000 | Large ₱5,000
  LESSORS_COMMERCIAL: {
    label: "Lessors of Real Estate – Commercial Buildings",
    assetFees:  buildFees7([500, 1000, 1000, 2000, 3000, 5000, 5000]),
    workerFees: buildFees7([500, 500, 1000, 2000, 3000, 5000, 5000]),
    assetTierNames: ["Micro", "Cottage", "Cottage", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // ── Hotels, Motels, Pension Houses, Apartelles ────────────────────────────
  // No Micro tier — minimum is Cottage.
  // Cottage ₱800 | Small ₱1,500 | Medium ₱2,500 | Large ₱4,000
  // BELOW_100K and FROM_100K_TO_250K both map to Cottage ₱800
  HOTELS_MOTELS: {
    label: "Hotels, Motels, Pension Houses, Apartelles",
    assetFees:  buildFees7([800, 800, 1500, 1500, 2500, 4000, 4000]),
    workerFees: buildFees7([800, 800, 800, 1500, 2500, 4000, 4000]),
    assetTierNames: ["Cottage (below ₱100K)", "Cottage", "Small", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Cottage (no workers)", "Cottage (1–5)", "Cottage (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // ── Lodging / Boarding Houses ─────────────────────────────────────────────
  // Micro ₱300 | Cottage ₱500 | Small ₱800 | Medium ₱1,200 | Large ₱2,000
  LODGING: {
    label: "Lodging / Boarding Houses",
    assetFees:  buildFees7([300, 500, 500, 800, 1200, 2000, 2000]),
    workerFees: buildFees7([300, 300, 500, 800, 1200, 2000, 2000]),
    assetTierNames: ["Micro", "Cottage", "Cottage", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // ── Amusement Places ──────────────────────────────────────────────────────
  // Micro ₱300 | Cottage ₱500 | Small ₱1,000 | Medium ₱2,000 | Large ₱3,000
  AMUSEMENT: {
    label: "Amusement Places",
    assetFees:  buildFees7([300, 500, 500, 1000, 2000, 3000, 3000]),
    workerFees: buildFees7([300, 300, 500, 1000, 2000, 3000, 3000]),
    assetTierNames: ["Micro", "Cottage", "Cottage", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // ── Restaurants, Cafés, Catering Services ────────────────────────────────
  // Micro ₱300 | Cottage ₱500 | Small ₱1,000 | Medium ₱2,500 | Large ₱3,000
  // (Ordinance Ch. III Art. A §12 — Medium-Scale Industries = ₱2,500)
  RESTAURANTS: {
    label: "Restaurants, Cafés, Catering Services",
    assetFees:  buildFees7([300, 500, 500, 1000, 2500, 3000, 3000]),
    workerFees: buildFees7([300, 300, 500, 1000, 2500, 3000, 3000]),
    assetTierNames: ["Micro", "Cottage", "Cottage", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Micro (no workers)", "Micro (1–5)", "Cottage (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // ── Other Industrial Companies ───────────────────────────────────────────
  // Small ₱3,000 | Medium ₱5,000 | Large ₱10,000
  // BELOW_100K–FROM_500K_TO_2M → Small ₱3,000
  // FROM_2M_TO_5M → Medium ₱5,000 | FROM_5M_TO_20M/OVER_20M → Large ₱10,000
  OTHER_INDUSTRIAL: {
    label: "Other Industrial Companies",
    assetFees:  buildFees7([3000, 3000, 3000, 3000, 5000, 10000, 10000]),
    workerFees: buildFees7([3000, 3000, 3000, 3000, 5000, 10000, 10000]),
    assetTierNames: ["Small", "Small", "Small", "Small", "Medium", "Large", "Large"],
    workerTierNames: ["Small (no workers)", "Small (1–5)", "Small (6–10)", "Small (11–50)", "Medium (51–99)", "Large (100–150)", "Large (200+)"],
  },

  // LIQUOR_TOBACCO fee table intentionally omitted here —
  // base fees use WHOLESALERS_RETAILERS; the liquor/tobacco % add-on is applied
  // as a separate assessment line (checkbox and/or LOB keyword detection).

  // BANKS, POWER_COMPANY, POWER_GEN_DIST, PRIVATE_PORT handled separately (fixed/special).

  // ── General / Fallback ────────────────────────────────────────────────────
  // Tier names align with DEFAULT_CLASSIFICATIONS so Super Admin overrides match.
  GENERAL: {
    label: "General Business",
    assetFees:  buildFees7([200, 500, 1200, 2500, 3500, 5000, 6000]),
    workerFees: buildFees7([200, 200, 500, 2500, 3500, 5000, 6000]),
    assetTierNames: [...DEFAULT_CLASSIFICATIONS],
    workerTierNames: [
      "Micro Industry (no workers)",
      "Micro Industry (1–5)",
      "Cottage Industries A (6–10)",
      "Small-Scale Industries A (11–50)",
      "Small-Scale Industries B (51–99)",
      "Medium-Scale Industries (100–150)",
      "Large-Scale Industries (200+)",
    ],
  },
};

// Regulatory fees placeholder by application type
const REGULATORY_FEES: Record<"NEW" | "RENEWAL" | "CLOSURE", number> = {
  NEW:     500, // environmental, sanitary, engineering, zoning clearance fees
  RENEWAL: 300, // reduced set for renewal
  CLOSURE: 200, // minimal clearance fees
};

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

export function classifyAssetBracket(assetSizeStr: string | null | undefined): AssetBracket {
  if (!assetSizeStr) return "BELOW_100K";
  const raw = parseFloat(assetSizeStr.replace(/[₱,\s]/g, ""));
  if (isNaN(raw) || raw < 0) return "BELOW_100K";
  if (raw < 100_000) return "BELOW_100K";
  if (raw < 250_000) return "FROM_100K_TO_250K";
  if (raw < 500_000) return "FROM_250K_TO_500K";
  if (raw < 2_000_000) return "FROM_500K_TO_2M";
  if (raw < 5_000_000) return "FROM_2M_TO_5M";
  if (raw <= 20_000_000) return "FROM_5M_TO_20M";
  return "OVER_20M";
}

export function classifyWorkerBracket(totalEmployeesStr: string | null | undefined): WorkerBracket {
  if (!totalEmployeesStr) return "NONE";
  const raw = Number(totalEmployeesStr.replace(/[,\s]/g, ""));
  if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) return "NONE";
  if (raw === 0) return "NONE";
  if (raw <= 5) return "FROM_1_TO_5";
  if (raw <= 10) return "FROM_6_TO_10";
  if (raw <= 50) return "FROM_11_TO_50";
  if (raw <= 99) return "FROM_51_TO_99";
  if (raw <= 199) return "FROM_100_TO_199";
  return "FROM_200_OR_MORE";
}

export function detectBusinessCategory(lineOfBusiness: string | null | undefined): BusinessCategory {
  if (!lineOfBusiness) return "GENERAL";
  const lower = lineOfBusiness.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "GENERAL";
}

function getAssetFee(category: BusinessCategory, assetBracket: AssetBracket): number {
  const table = FEE_TABLES[category] ?? FEE_TABLES.GENERAL!;
  const idx = ASSET_BRACKETS.indexOf(assetBracket);
  return table.assetFees[idx] ?? 0;
}

function getWorkerFee(category: BusinessCategory, workerBracket: WorkerBracket): number {
  const table = FEE_TABLES[category] ?? FEE_TABLES.GENERAL!;
  const idx = WORKER_BRACKETS.indexOf(workerBracket);
  return table.workerFees[idx] ?? 0;
}

function getAssetTierName(category: BusinessCategory, assetBracket: AssetBracket): string {
  const table = FEE_TABLES[category] ?? FEE_TABLES.GENERAL!;
  const idx = ASSET_BRACKETS.indexOf(assetBracket);
  return table.assetTierNames[idx] ?? ASSET_TIER_NAMES[assetBracket];
}

function getWorkerTierName(category: BusinessCategory, workerBracket: WorkerBracket): string {
  const table = FEE_TABLES[category] ?? FEE_TABLES.GENERAL!;
  const idx = WORKER_BRACKETS.indexOf(workerBracket);
  return table.workerTierNames[idx] ?? WORKER_BRACKET_LABELS[workerBracket];
}

function detectBankType(lineOfBusiness: string): "RURAL_THRIFT_SAVINGS" | "COMMERCIAL_DEVELOPMENT" | "UNIVERSAL" {
  const lower = lineOfBusiness.toLowerCase();
  if (/universal bank/.test(lower)) return "UNIVERSAL";
  if (/commercial bank|development bank/.test(lower)) return "COMMERCIAL_DEVELOPMENT";
  return "RURAL_THRIFT_SAVINGS"; // default for rural/thrift/savings/cooperative banks and plain "Banks"
}

function resolveBuiltInCategoryAlias(lineOfBusiness: string | null | undefined): string | null {
  const trimmed = (lineOfBusiness ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "banks") return "BANKS";
  if (lower === "lessors of real estate") return "LESSORS_LAND";
  if (lower.includes("lessors of real estate") && lower.includes("commercial")) {
    return "LESSORS_COMMERCIAL";
  }
  if (lower.includes("lessors of real estate") && lower.includes("land")) {
    return "LESSORS_LAND";
  }
  return null;
}

function normalizeClassification(value: string): string {
  return value.trim().toLowerCase().replace(/[–—]/g, "-");
}

function findConfiguredFeeAmount(
  runtimeSettings: RuntimeFeeSettings | undefined,
  category: FeeCategoryKey | string,
  classification: string
): number | null {
  if (!runtimeSettings) return null;

  const target = normalizeClassification(classification);
  const row = runtimeSettings.feeOverrides.find(
    (item) => item.category === category && normalizeClassification(item.classification) === target
  );

  if (row) return row.amount;

  const baseName = classification.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (baseName && baseName !== classification) {
    const baseTarget = normalizeClassification(baseName);
    const baseRow = runtimeSettings.feeOverrides.find(
      (item) => item.category === category && normalizeClassification(item.classification) === baseTarget
    );
    if (baseRow) return baseRow.amount;
  }

  return null;
}

function resolveCategoryKeyFromLineOfBusiness(
  lineOfBusiness: string | null | undefined,
  runtimeSettings?: RuntimeFeeSettings
): string | null {
  const trimmed = lineOfBusiness?.trim();
  if (!trimmed) return null;
  const fromRuntime =
    runtimeSettings?.categoryByLabel?.[trimmed] ??
    runtimeSettings?.categoryByLabel?.[trimmed.toLowerCase()] ??
    null;
  return fromRuntime ?? resolveBuiltInCategoryAlias(trimmed);
}

function buildBankFeeResult(
  input: AssessmentInput,
  runtimeSettings: RuntimeFeeSettings | undefined,
  lineOfBusiness: string,
  assetBracket: AssetBracket,
  workerBracket: WorkerBracket,
  assetBracketLabel: string,
  workerBracketLabel: string
): ComputedFees {
  const bankType = detectBankType(lineOfBusiness);
  const bankFeeMap = {
    RURAL_THRIFT_SAVINGS: {
      fee: 4_000,
      label: BANK_CLASSIFICATIONS[0],
    },
    COMMERCIAL_DEVELOPMENT: {
      fee: 6_000,
      label: BANK_CLASSIFICATIONS[1],
    },
    UNIVERSAL: {
      fee: 8_000,
      label: BANK_CLASSIFICATIONS[2],
    },
  };
  const bankConfig = bankFeeMap[bankType];
  const bankLabel = bankConfig.label;
  const fee = findConfiguredFeeAmount(runtimeSettings, "BANKS", bankLabel) ?? bankConfig.fee;
  return buildResult(input, {
    detectedCategory: `Banks — ${bankLabel}`,
    assetBracket,
    workerBracket,
    assetBracketLabel,
    workerBracketLabel,
    assetTierName: bankLabel,
    workerTierName: bankLabel,
    assetBasedFee: fee,
    workerBasedFee: fee,
    selectedMayorPermitFee: fee,
    selectedBy: "Bank type classification",
    specialRuleApplied: null,
    explanation: `Banks — ${bankLabel}: ₱${fee.toLocaleString("en-PH")} (fee is fixed by bank type, not by size)`,
  }, runtimeSettings);
}

// ---------------------------------------------------------------------------
// Main exported types
// ---------------------------------------------------------------------------

export interface AssessmentInput {
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  lineOfBusiness?: string | null;
  assetSize?: string | null;
  totalEmployees?: string | null;
  isLateRenewal?: boolean;
  lateMonths?: number; // for 2% per month interest
}

export interface ComputedFees {
  // Core output fields
  detectedCategory: string;
  assetClassification: string;       // e.g. "₱500,000 – ₱2,000,000 → Small-Scale Industries A"
  workerClassification: string;      // e.g. "11–50 workers → Small-Scale Industries A"
  selectedClassification: string;    // whichever produced the higher fee
  assetBasedFee: number;
  workerBasedFee: number;
  selectedMayorPermitFee: number;
  specialRuleApplied: string | null; // e.g. "Liquor/Tobacco +25%"
  explanation: string;               // full human-readable computation string
  // Fee components for bplo-assessment.ts
  mayorsPermitFee: number;
  regulatoryFees: number;
  surcharge: number;
  interest: number;
  closureCertificateFee: number;
  // Aliases kept for backward compatibility with bplo-assessment.ts
  computation: string;               // = explanation
  category: string;                  // = detectedCategory
  sizeClassification: string;        // = selectedClassification
}

// ---------------------------------------------------------------------------
// Main computation function
// ---------------------------------------------------------------------------

export function computeMayorsPermitFee(
  input: AssessmentInput,
  runtimeSettings?: RuntimeFeeSettings
): ComputedFees {
  const { lineOfBusiness, assetSize, totalEmployees } = input;
  const lower = (lineOfBusiness ?? "").toLowerCase();
  const exactCategoryKey = resolveCategoryKeyFromLineOfBusiness(lineOfBusiness, runtimeSettings);

  const assetBracket = classifyAssetBracket(assetSize);
  const workerBracket = classifyWorkerBracket(totalEmployees);
  const assetBracketLabel = ASSET_BRACKET_LABELS[assetBracket];
  const workerBracketLabel = WORKER_BRACKET_LABELS[workerBracket];
  const assetIdx = ASSET_BRACKETS.indexOf(assetBracket);
  const workerIdx = WORKER_BRACKETS.indexOf(workerBracket);

  // ----- 1. Custom Super Admin categories (exact label match) -----
  if (exactCategoryKey?.startsWith("CUSTOM_")) {
    const fixedConfigured = findConfiguredFeeAmount(
      runtimeSettings,
      exactCategoryKey,
      FIXED_FEE_CLASSIFICATION
    );
    if (typeof fixedConfigured === "number") {
      return buildResult(input, {
        detectedCategory: lineOfBusiness?.trim() || exactCategoryKey,
        assetBracket,
        workerBracket,
        assetBracketLabel,
        workerBracketLabel,
        assetTierName: FIXED_FEE_CLASSIFICATION,
        workerTierName: FIXED_FEE_CLASSIFICATION,
        assetBasedFee: fixedConfigured,
        workerBasedFee: fixedConfigured,
        selectedMayorPermitFee: fixedConfigured,
        selectedBy: "Configured fixed fee",
        specialRuleApplied: `Fixed fee: ${lineOfBusiness?.trim() || exactCategoryKey} — ₱${fixedConfigured.toLocaleString("en-PH")}`,
        explanation: `Fixed fee: ${lineOfBusiness?.trim() || exactCategoryKey} — ₱${fixedConfigured.toLocaleString("en-PH")}`,
      }, runtimeSettings);
    }

    // Size-tier customs use the Manufacturers schedule amounts + DEFAULT_CLASSIFICATIONS labels
    // so Super Admin fee rows match override lookups.
    const sizeTable = FEE_TABLES.MANUFACTURERS!;
    const catLabel = lineOfBusiness?.trim() || exactCategoryKey;
    const assetFee = sizeTable.assetFees[assetIdx] ?? 0;
    const workerFee = sizeTable.workerFees[workerIdx] ?? 0;
    const assetTierName = DEFAULT_CLASSIFICATIONS[assetIdx] ?? sizeTable.assetTierNames[assetIdx]!;
    const workerTierName = sizeTable.workerTierNames[workerIdx]!;
    const overrideClassification =
      assetFee >= workerFee
        ? (DEFAULT_CLASSIFICATIONS[assetIdx] ?? assetTierName)
        : (DEFAULT_CLASSIFICATIONS[workerIdx] ?? assetTierName);

    let baseFee: number;
    let selectedBy: string;
    if (assetFee >= workerFee) {
      baseFee = assetFee;
      selectedBy = `Asset size (₱${assetFee.toLocaleString("en-PH")} ≥ Worker count ₱${workerFee.toLocaleString("en-PH")})`;
    } else {
      baseFee = workerFee;
      selectedBy = `Worker count (₱${workerFee.toLocaleString("en-PH")} > Asset size ₱${assetFee.toLocaleString("en-PH")})`;
    }

    const configuredAmount = findConfiguredFeeAmount(
      runtimeSettings,
      exactCategoryKey,
      overrideClassification
    );
    if (typeof configuredAmount === "number") {
      baseFee = configuredAmount;
      selectedBy = `Configured setting (${overrideClassification}) = ₱${configuredAmount.toLocaleString("en-PH")}`;
    }

    const explanation =
      `Category: ${catLabel}` +
      ` | Asset: ${assetBracketLabel} → ${assetTierName} = ₱${assetFee.toLocaleString("en-PH")}` +
      ` | Workers: ${workerBracketLabel} → ${workerTierName} = ₱${workerFee.toLocaleString("en-PH")}` +
      ` | Selected by: ${selectedBy}`;

    return buildResult(input, {
      detectedCategory: catLabel,
      assetBracket,
      workerBracket,
      assetBracketLabel,
      workerBracketLabel,
      assetTierName,
      workerTierName,
      assetBasedFee: assetFee,
      workerBasedFee: workerFee,
      selectedMayorPermitFee: baseFee,
      selectedBy,
      specialRuleApplied: null,
      explanation,
    }, runtimeSettings);
  }

  // ----- 2. Exact-match fixed / bank categories -----
  if (exactCategoryKey === "PRIVATE_PORT") {
    const fee = runtimeSettings?.fixed.privatePortFixedFee ?? 50_000;
    return buildResult(input, {
      detectedCategory: "Private Ports / Wharves",
      assetBracket, workerBracket, assetBracketLabel, workerBracketLabel,
      assetTierName: "Fixed", workerTierName: "Fixed",
      assetBasedFee: fee, workerBasedFee: fee,
      selectedMayorPermitFee: fee, selectedBy: "Fixed fee",
      specialRuleApplied: "Fixed fee: Private Port / Wharf — ₱50,000",
      explanation: "Fixed fee: Private Port / Wharf — ₱50,000",
    }, runtimeSettings);
  }

  if (exactCategoryKey === "POWER_COMPANY") {
    const fee = runtimeSettings?.fixed.powerCompanyFixedFee ?? 10_000;
    return buildResult(input, {
      detectedCategory: "Power Companies / Hydropower Plants",
      assetBracket, workerBracket, assetBracketLabel, workerBracketLabel,
      assetTierName: "Fixed", workerTierName: "Fixed",
      assetBasedFee: fee, workerBasedFee: fee,
      selectedMayorPermitFee: fee, selectedBy: "Fixed fee",
      specialRuleApplied: "Fixed fee: Power Company / Hydropower — ₱10,000",
      explanation: "Fixed fee: Power Companies / Hydropower Plants — ₱10,000",
    }, runtimeSettings);
  }

  if (exactCategoryKey === "POWER_GEN_DIST") {
    const fee = runtimeSettings?.fixed.powerGenerationDistributionFixedFee ?? 10_000;
    return buildResult(input, {
      detectedCategory: "Power Generation and Distribution",
      assetBracket, workerBracket, assetBracketLabel, workerBracketLabel,
      assetTierName: "Fixed", workerTierName: "Fixed",
      assetBasedFee: fee, workerBasedFee: fee,
      selectedMayorPermitFee: fee, selectedBy: "Fixed fee",
      specialRuleApplied: "Fixed fee: Power Generation and Distribution — ₱10,000",
      explanation: "Fixed fee: Power Generation and Distribution — ₱10,000",
    }, runtimeSettings);
  }

  if (exactCategoryKey === "BANKS") {
    return buildBankFeeResult(
      input,
      runtimeSettings,
      lineOfBusiness ?? "Banks",
      assetBracket,
      workerBracket,
      assetBracketLabel,
      workerBracketLabel
    );
  }

  // ----- 3. Keyword specials only when LOB did not exact-match a fee category -----
  if (!exactCategoryKey) {
    if (/private port|private wharf|port operation|port facility|wharf|pier facility|harbor terminal|marina/.test(lower)) {
      const fee = runtimeSettings?.fixed.privatePortFixedFee ?? 50_000;
      return buildResult(input, {
        detectedCategory: "Private Ports / Wharves",
        assetBracket, workerBracket, assetBracketLabel, workerBracketLabel,
        assetTierName: "Fixed", workerTierName: "Fixed",
        assetBasedFee: fee, workerBasedFee: fee,
        selectedMayorPermitFee: fee, selectedBy: "Fixed fee",
        specialRuleApplied: "Fixed fee: Private Port / Wharf — ₱50,000",
        explanation: "Fixed fee: Private Port / Wharf — ₱50,000",
      }, runtimeSettings);
    }

    if (/power company|hydropower|hydro power|hydroelectric|electric cooperative/.test(lower)) {
      const fee = runtimeSettings?.fixed.powerCompanyFixedFee ?? 10_000;
      return buildResult(input, {
        detectedCategory: "Power Companies / Hydropower Plants",
        assetBracket, workerBracket, assetBracketLabel, workerBracketLabel,
        assetTierName: "Fixed", workerTierName: "Fixed",
        assetBasedFee: fee, workerBasedFee: fee,
        selectedMayorPermitFee: fee, selectedBy: "Fixed fee",
        specialRuleApplied: "Fixed fee: Power Company / Hydropower — ₱10,000",
        explanation: "Fixed fee: Power Companies / Hydropower Plants — ₱10,000",
      }, runtimeSettings);
    }

    if (/power generation|power distribution|generation company|distribution company/.test(lower)) {
      const fee = runtimeSettings?.fixed.powerGenerationDistributionFixedFee ?? 10_000;
      return buildResult(input, {
        detectedCategory: "Power Generation and Distribution",
        assetBracket, workerBracket, assetBracketLabel, workerBracketLabel,
        assetTierName: "Fixed", workerTierName: "Fixed",
        assetBasedFee: fee, workerBasedFee: fee,
        selectedMayorPermitFee: fee, selectedBy: "Fixed fee",
        specialRuleApplied: "Fixed fee: Power Generation and Distribution — ₱10,000",
        explanation: "Fixed fee: Power Generation and Distribution — ₱10,000",
      }, runtimeSettings);
    }

    if (/rural bank|thrift bank|savings bank|commercial bank|development bank|universal bank|cooperative bank|\bbanks\b/.test(lower)) {
      return buildBankFeeResult(
        input,
        runtimeSettings,
        lineOfBusiness ?? "",
        assetBracket,
        workerBracket,
        assetBracketLabel,
        workerBracketLabel
      );
    }
  }

  // ----- 4. Standard categories with asset × worker comparison -----

  const detectedCategory =
    exactCategoryKey && !exactCategoryKey.startsWith("CUSTOM_")
      ? (exactCategoryKey as BusinessCategory)
      : detectBusinessCategory(lineOfBusiness);

  const isExplicitLiquorTobacco = detectedCategory === "LIQUOR_TOBACCO";

  // For Liquor/Tobacco explicit business: base fees are from WHOLESALERS_RETAILERS
  // (add-on % is applied separately during BPLO assessment).
  const baseCategory: BusinessCategory =
    isExplicitLiquorTobacco ? "WHOLESALERS_RETAILERS" : detectedCategory;

  // Effective category for fee lookup (falls back to GENERAL if not in FEE_TABLES)
  const feeCategory: BusinessCategory =
    FEE_TABLES[baseCategory] ? baseCategory : "GENERAL";

  const catLabel = FEE_TABLES[feeCategory]?.label ?? "General Business";

  const assetFee = getAssetFee(feeCategory, assetBracket);
  const workerFee = getWorkerFee(feeCategory, workerBracket);
  const assetTierName = getAssetTierName(feeCategory, assetBracket);
  const workerTierName = getWorkerTierName(feeCategory, workerBracket);

  let baseFee: number;
  let selectedBy: string;
  const selectedTierNameFromDefaults = assetFee >= workerFee ? assetTierName : workerTierName;

  if (assetFee >= workerFee) {
    baseFee = assetFee;
    selectedBy = `Asset size (₱${assetFee.toLocaleString("en-PH")} ≥ Worker count ₱${workerFee.toLocaleString("en-PH")})`;
  } else {
    baseFee = workerFee;
    selectedBy = `Worker count (₱${workerFee.toLocaleString("en-PH")} > Asset size ₱${assetFee.toLocaleString("en-PH")})`;
  }

  const overrideCategory = (isExplicitLiquorTobacco ? "LIQUOR_TOBACCO" : feeCategory) as FeeCategoryKey;
  const configuredAmount =
    findConfiguredFeeAmount(runtimeSettings, overrideCategory, selectedTierNameFromDefaults) ??
    (assetFee >= workerFee
      ? findConfiguredFeeAmount(runtimeSettings, feeCategory, DEFAULT_CLASSIFICATIONS[assetIdx] ?? "")
      : findConfiguredFeeAmount(runtimeSettings, feeCategory, DEFAULT_CLASSIFICATIONS[workerIdx] ?? ""));

  if (typeof configuredAmount === "number") {
    baseFee = configuredAmount;
    selectedBy = `Configured setting (${selectedTierNameFromDefaults}) = ₱${configuredAmount.toLocaleString("en-PH")}`;
  }

  const selectedMayorPermitFee = baseFee;
  const specialRuleApplied: string | null = null;

  const explanation =
    `Category: ${catLabel}${isExplicitLiquorTobacco ? " (Liquor/Tobacco — base: Wholesalers/Retailers; add-on applied at assessment)" : ""}` +
    ` | Asset: ${assetBracketLabel} → ${assetTierName} = ₱${assetFee.toLocaleString("en-PH")}` +
    ` | Workers: ${workerBracketLabel} → ${workerTierName} = ₱${workerFee.toLocaleString("en-PH")}` +
    ` | Selected by: ${selectedBy}` +
    (specialRuleApplied ? ` | ${specialRuleApplied}` : "");

  const displayCategory =
    isExplicitLiquorTobacco
      ? "Liquor and Tobacco Businesses"
      : FEE_TABLES[feeCategory]?.label ?? "General Business";

  return buildResult(input, {
    detectedCategory: displayCategory,
    assetBracket, workerBracket, assetBracketLabel, workerBracketLabel,
    assetTierName, workerTierName,
    assetBasedFee: assetFee, workerBasedFee: workerFee,
    selectedMayorPermitFee, selectedBy,
    specialRuleApplied,
    explanation,
  }, runtimeSettings);
}

interface BuildResultInput {
  detectedCategory: string;
  assetBracket: AssetBracket;
  workerBracket: WorkerBracket;
  assetBracketLabel: string;
  workerBracketLabel: string;
  assetTierName: string;
  workerTierName: string;
  assetBasedFee: number;
  workerBasedFee: number;
  selectedMayorPermitFee: number;
  selectedBy: string;
  specialRuleApplied: string | null;
  explanation: string;
}

function buildResult(
  input: AssessmentInput,
  r: BuildResultInput,
  runtimeSettings?: RuntimeFeeSettings
): ComputedFees {
  const { applicationType } = input;
  const isClosure = applicationType === "CLOSURE";
  const selectedMayorPermitFee = isClosure ? 0 : r.selectedMayorPermitFee;
  const surcharge = isClosure ? 0 : computeSurcharge(selectedMayorPermitFee, input, runtimeSettings);
  const interest = isClosure ? 0 : computeInterest(selectedMayorPermitFee, input, runtimeSettings);
  const closureCertificateFee = isClosure ? 100 : 0;
  const regulatoryFees = isClosure ? 0 : REGULATORY_FEES[applicationType];
  const specialRuleApplied = isClosure
    ? "Closure rule: no new Mayor's Permit Fee auto-computation (₱0)"
    : r.specialRuleApplied;
  const explanation = isClosure
    ? `${r.explanation} | Closure rule applied: Mayor's Permit Fee = ₱0, Closure Certificate Fee = ₱100`
    : r.explanation;

  const assetClassification =
    r.assetBracketLabel !== "Fixed"
      ? `${r.assetBracketLabel} → ${r.assetTierName} = ₱${r.assetBasedFee.toLocaleString("en-PH")}`
      : `${r.assetTierName}`;
  const workerClassification =
    r.workerBracketLabel !== "Fixed"
      ? `${r.workerBracketLabel} → ${r.workerTierName} = ₱${r.workerBasedFee.toLocaleString("en-PH")}`
      : `${r.workerTierName}`;
  const selectedClassification =
    r.assetBasedFee >= r.workerBasedFee ? assetClassification : workerClassification;

  return {
    detectedCategory: r.detectedCategory,
    assetClassification,
    workerClassification,
    selectedClassification,
    assetBasedFee: r.assetBasedFee,
    workerBasedFee: r.workerBasedFee,
    selectedMayorPermitFee,
    specialRuleApplied,
    explanation,
    // Fee components
    mayorsPermitFee: selectedMayorPermitFee,
    regulatoryFees,
    surcharge,
    interest,
    closureCertificateFee,
    // Backward-compat aliases
    computation: explanation,
    category: r.detectedCategory,
    sizeClassification: selectedClassification,
  };
}

function computeSurcharge(
  base: number,
  input: AssessmentInput,
  runtimeSettings?: RuntimeFeeSettings
): number {
  if (input.applicationType !== "RENEWAL") return 0;
  if (!input.isLateRenewal) return 0;
  if (runtimeSettings?.activeExtension?.waiveSurcharge) return 0;
  const percent = runtimeSettings?.penalties.renewalSurchargePercent ?? 25;
  return Math.round(base * (percent / 100));
}

function computeInterest(
  base: number,
  input: AssessmentInput,
  runtimeSettings?: RuntimeFeeSettings
): number {
  if (input.applicationType !== "RENEWAL") return 0;
  if (!(input.lateMonths && input.lateMonths > 0)) return 0;
  if (runtimeSettings?.activeExtension?.waiveInterest) return 0;
  const percentPerMonth = runtimeSettings?.penalties.monthlyInterestPercent ?? 2;
  return Math.round(base * (percentPerMonth / 100) * input.lateMonths);
}

// ---------------------------------------------------------------------------
// Server-side total recomputation — client totals are NEVER trusted
// ---------------------------------------------------------------------------

/** Sum all fee components server-side. Client-submitted totals must never be used directly. */
export function sumFeeComponents(fees: {
  mayorsPermitFee: number;
  regulatoryFees: number;
  additionalCharges: number;
  penalties: number;
  surcharge: number;
  interest: number;
  closureCertificateFee: number;
  arrears: number;
  otherCharges: number;
}): number {
  return (
    fees.mayorsPermitFee +
    fees.regulatoryFees +
    fees.additionalCharges +
    fees.penalties +
    fees.surcharge +
    fees.interest +
    fees.closureCertificateFee +
    fees.arrears +
    fees.otherCharges
  );
}

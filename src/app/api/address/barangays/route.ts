import { NextResponse } from "next/server";

import type { AddressApiErrorResponse, AddressOption, BarangayOption } from "@/lib/address-types";
import { assertAllowedPsgcCloudUrl, fetchTrustedHttpsJson, PSGC_CLOUD_BASE_URL } from "@/lib/address-server";
import { normalizeEbMagalonaCityName } from "@/lib/address-options";
import { EB_MAGALONA_BARANGAYS, normalizeEbMagalonaBarangayName } from "@/lib/business-rules";

export const dynamic = "force-dynamic";

const EB_MAGALONA_PSGC_CODE = "0604508000";
const BARANGAY_FETCH_TIMEOUT_MS = 8000;

const EB_MAGALONA_CITY_VARIANTS = [
  "EB Magalona",
  "E.B. Magalona",
  "Enrique B. Magalona",
  "Enrique B. Magalona (E.B. Magalona)",
] as const;

function logBarangayLookup(event: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[address/barangays] ${event}`, data);
}

class CloudFetchError extends Error {
  status: number;
  url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "CloudFetchError";
    this.status = status;
    this.url = url;
  }
}

type PsgcCloudProvince = {
  code?: string;
  name?: string;
};

type PsgcCloudCityMunicipality = {
  code?: string;
  name?: string;
  type?: string;
  province?: PsgcCloudProvince | string;
  region?: string;
  provinceCode?: string;
};

type PsgcCloudBarangay = {
  code: string;
  name: string;
  cityCode?: string;
  municipalityCode?: string;
  cityMunicipalityCode?: string;
  cityName?: string;
  municipalityName?: string;
  cityMunicipalityName?: string;
  provinceCode?: string;
  city?: {
    code?: string;
    name?: string;
  } | string;
  municipality?: {
    code?: string;
    name?: string;
  } | string;
  cityMunicipality?: {
    code?: string;
    name?: string;
  } | string;
  city_municipality?: {
    code?: string;
    name?: string;
  } | string;
  province?: {
    code?: string;
    name?: string;
  } | string;
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ error } satisfies AddressApiErrorResponse, { status });
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[.'’,-]/g, " ")
    .replace(/\b(city|municipality|province)\s+of\b/g, "")
    .replace(/\b(city|municipality)\b/g, "")
    .replace(/\be\s*b\b/g, "eb")
    .replace(/\s+/g, " ")
    .trim();
}

function isEbMagalonaRequestedCity(cityName: string): boolean {
  const normalized = normalizeName(cityName);
  return EB_MAGALONA_CITY_VARIANTS.some((variant) => normalizeName(variant) === normalized);
}

function buildLocalEbMagalonaFallbackOptions(): BarangayOption[] {
  return EB_MAGALONA_BARANGAYS.map((name, index) => ({
    code: `local-ebm-${String(index + 1).padStart(3, "0")}`,
    value: `local-ebm-${String(index + 1).padStart(3, "0")}`,
    label: name,
    name,
  }));
}

function matchesName(candidate: string, target: string): boolean {
  return normalizeName(candidate) === normalizeName(target);
}

function parseCloudArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const maybeObject = payload as Record<string, unknown>;
    if (Array.isArray(maybeObject.data)) {
      return maybeObject.data as T[];
    }
    if (Array.isArray(maybeObject.results)) {
      return maybeObject.results as T[];
    }
  }

  return [];
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeMojibake(value: string): string {
  return value
    .replace(/Ã±/g, "ñ")
    .replace(/Ã‘/g, "Ñ")
    .replace(/\u00C3\u00B1/g, "ñ")
    .replace(/\u00C3\u0091/g, "Ñ")
    .trim();
}

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = sanitizeMojibake(value);
  return trimmed.length > 0 ? trimmed : null;
}

function resolveBarangayCityCode(entry: PsgcCloudBarangay): string | null {
  const objCityCode = typeof entry.city === "object" && entry.city !== null ? entry.city.code : undefined;
  const objMunCode = typeof entry.municipality === "object" && entry.municipality !== null ? entry.municipality.code : undefined;
  const objCityMunCode = typeof entry.cityMunicipality === "object" && entry.cityMunicipality !== null ? entry.cityMunicipality.code : undefined;
  const objCityMunSnakeCode = typeof entry.city_municipality === "object" && entry.city_municipality !== null ? entry.city_municipality.code : undefined;

  return (
    normalizeCode(entry.cityCode) ??
    normalizeCode(entry.municipalityCode) ??
    normalizeCode(entry.cityMunicipalityCode) ??
    normalizeCode(objCityCode) ??
    normalizeCode(objMunCode) ??
    normalizeCode(objCityMunCode) ??
    normalizeCode(objCityMunSnakeCode)
  );
}

function resolveBarangayCityName(entry: PsgcCloudBarangay): string | null {
  const candidates = [
    entry.cityName,
    entry.municipalityName,
    entry.cityMunicipalityName,
    typeof entry.city === "string" ? entry.city : entry.city?.name,
    typeof entry.municipality === "string" ? entry.municipality : entry.municipality?.name,
    typeof entry.cityMunicipality === "string" ? entry.cityMunicipality : entry.cityMunicipality?.name,
    typeof entry.city_municipality === "string" ? entry.city_municipality : entry.city_municipality?.name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return sanitizeMojibake(candidate.trim());
    }
  }

  return null;
}

function resolveBarangayProvinceCode(entry: PsgcCloudBarangay): string | null {
  const objCode = typeof entry.province === "object" && entry.province !== null ? entry.province.code : undefined;
  return normalizeCode(entry.provinceCode) ?? normalizeCode(objCode);
}

function resolveBarangayProvinceName(entry: PsgcCloudBarangay): string | null {
  if (typeof entry.province === "string" && entry.province.trim().length > 0) {
    return sanitizeMojibake(entry.province.trim());
  }
  if (
    typeof entry.province === "object" &&
    entry.province !== null &&
    typeof entry.province.name === "string" &&
    entry.province.name.trim().length > 0
  ) {
    return sanitizeMojibake(entry.province.name.trim());
  }
  return null;
}

function dedupeAndSortBarangays(rows: BarangayOption[]): BarangayOption[] {
  const seen = new Set<string>();
  const deduped: BarangayOption[] = [];

  for (const row of rows) {
    const key = `${row.code.toLowerCase()}::${row.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped.sort((left, right) => left.label.localeCompare(right.label));
}

async function fetchCloudArray<T>(url: string): Promise<T[]> {
  let response: Response;

  try {
    response = await fetchTrustedHttpsJson(assertAllowedPsgcCloudUrl(url), {
      allowedHostname: "psgc.cloud",
      signal: AbortSignal.timeout(BARANGAY_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const isAbortError =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "TimeoutError";

    throw new CloudFetchError(
      isAbortError ? "Request timed out" : "Request failed",
      isAbortError ? 504 : 500,
      url
    );
  }

  if (!response.ok) {
    throw new CloudFetchError(`Request failed with status ${response.status}`, response.status, url);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return parseCloudArrayPayload<T>(payload);
}

function toBarangayOptions(rows: PsgcCloudBarangay[], provinceCode?: string, isEbMagalona?: boolean): BarangayOption[] {
  return rows
    .map((row): BarangayOption | null => {
      const code = normalizeCode(row.code);
      let name = normalizeLabel(row.name);
      if (!code || !name) return null;

      if (isEbMagalona) {
        name = normalizeEbMagalonaBarangayName(name);
      }

      return {
        code,
        label: name,
        value: code,
        name,
        cityCode: resolveBarangayCityCode(row) ?? undefined,
        provinceCode: resolveBarangayProvinceCode(row) ?? provinceCode,
      };
    })
    .filter((row): row is BarangayOption => Boolean(row));
}

function toCityOptions(rows: PsgcCloudCityMunicipality[]): AddressOption[] {
  const seen = new Set<string>();
  const options: AddressOption[] = [];

  for (const row of rows) {
    const code = normalizeCode(row.code);
    const name = normalizeLabel(row.name);
    if (!code || !name) continue;

    const key = `${code.toLowerCase()}::${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      label: name,
      value: code,
      name,
    });
  }

  return options;
}

function withCityTypeVariants(name: string): string[] {
  const base = name.trim();
  if (!base) return [];

  const root = base
    .replace(/\s+City$/i, "")
    .replace(/^City\s+of\s+/i, "")
    .replace(/^Municipality\s+of\s+/i, "")
    .trim();

  const variants = [
    base,
    root,
    `City of ${root}`,
    `${root} City`,
    `Municipality of ${root}`,
  ];

  const normalizedBase = normalizeName(base);
  const isEbMagalona =
    normalizedBase === normalizeName("EB Magalona") ||
    normalizedBase === normalizeName("E.B. Magalona") ||
    normalizedBase === normalizeName("Enrique B. Magalona");

  if (isEbMagalona) {
    variants.push("EB Magalona", "E.B. Magalona", "Enrique B. Magalona");
    variants.push("Municipality of E.B. Magalona", "Municipality of Enrique B. Magalona");
  }

  return Array.from(new Set(variants.filter((v) => v.length > 0)));
}

function filterCitiesByProvince(
  rows: PsgcCloudCityMunicipality[],
  provinceName?: string,
  provinceCode?: string
): PsgcCloudCityMunicipality[] {
  const normalizedProvinceName = provinceName ? normalizeName(provinceName) : "";
  const normalizedProvinceCode = provinceCode?.trim() ?? "";

  if (!normalizedProvinceName && !normalizedProvinceCode) {
    return rows;
  }

  const isNcr =
    normalizedProvinceCode === "00" ||
    /(ncr|metro\s+manila|national\s+capital)/i.test(normalizedProvinceName);

  return rows.filter((row) => {
    if (isNcr) {
      if (row.code && row.code.startsWith("13")) return true;
      if (typeof row.region === "string" && /(national\s+capital|ncr)/i.test(row.region)) return true;
      return false;
    }

    const rowProvinceCode =
      normalizeCode(row.provinceCode) ??
      (typeof row.province === "object" && row.province !== null ? normalizeCode(row.province.code) : null) ??
      "";
    const rowProvinceName =
      (typeof row.province === "string"
        ? row.province
        : typeof row.province === "object" && row.province !== null
        ? row.province.name
        : "") ?? "";

    if (normalizedProvinceCode && rowProvinceCode && normalizedProvinceCode === rowProvinceCode) {
      return true;
    }

    if (normalizedProvinceName && rowProvinceName && normalizeName(rowProvinceName) === normalizedProvinceName) {
      return true;
    }

    return false;
  });
}

async function loadProvinceCities(input: {
  provinceName?: string;
  provinceCode?: string;
}): Promise<PsgcCloudCityMunicipality[]> {
  const isNcr =
    input.provinceCode?.trim() === "00" ||
    /(ncr|metro\s+manila|national\s+capital)/i.test(input.provinceName ?? "");

  if (isNcr) {
    const allCities = await fetchCloudArray<PsgcCloudCityMunicipality>(
      `${PSGC_CLOUD_BASE_URL}/cities-municipalities`
    );
    return allCities.filter(
      (city) =>
        (city.code && city.code.startsWith("13")) ||
        (typeof city.region === "string" && /(national\s+capital|ncr)/i.test(city.region))
    );
  }

  const candidates = [input.provinceCode, input.provinceName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const collected: PsgcCloudCityMunicipality[] = [];

  for (const candidate of candidates) {
    try {
      const byProvince = await fetchCloudArray<PsgcCloudCityMunicipality>(
        `${PSGC_CLOUD_BASE_URL}/provinces/${encodeURIComponent(candidate)}/cities-municipalities`
      );
      if (byProvince.length > 0) {
        collected.push(...byProvince);
      }
    } catch {
      // Fallback to global list below.
    }
  }

  if (collected.length > 0) {
    return collected;
  }

  const allCities = await fetchCloudArray<PsgcCloudCityMunicipality>(`${PSGC_CLOUD_BASE_URL}/cities-municipalities`);
  return filterCitiesByProvince(allCities, input.provinceName, input.provinceCode);
}

async function resolveCityCode(input: {
  cityName: string;
  cityCode?: string;
  provinceName?: string;
  provinceCode?: string;
}): Promise<string | null> {
  if (input.cityCode?.trim() && /^\d{6,10}$/.test(input.cityCode.trim())) {
    return input.cityCode.trim();
  }

  const candidates = withCityTypeVariants(input.cityName);
  if (candidates.length === 0) {
    return null;
  }

  const provinceCities = await loadProvinceCities({
    provinceName: input.provinceName,
    provinceCode: input.provinceCode,
  });

  const cityOptions = toCityOptions(provinceCities);
  const normalizedCandidates = candidates.map((candidate) => normalizeName(candidate));

  const exact = cityOptions.filter((option) => normalizedCandidates.includes(normalizeName(option.name)));
  if (exact.length >= 1) {
    return exact[0].value;
  }

  const fuzzy = cityOptions.filter((option) => {
    const normalized = normalizeName(option.name);
    return normalizedCandidates.some((candidate) => normalized.includes(candidate) || candidate.includes(normalized));
  });

  if (fuzzy.length >= 1) {
    return fuzzy[0].value;
  }

  return null;
}

function buildCityLookupCandidates(cityName: string, cityCode?: string): string[] {
  const rawCityName = cityName.trim();
  const candidates: string[] = [];

  if (cityCode?.trim()) {
    candidates.push(cityCode.trim());
  }

  const normalizedCity = normalizeName(rawCityName);
  const isEbMagalona =
    normalizedCity === normalizeName("EB Magalona") ||
    normalizedCity === normalizeName("E.B. Magalona") ||
    normalizedCity === normalizeName("Enrique B. Magalona");

  if (isEbMagalona) {
    candidates.push(EB_MAGALONA_PSGC_CODE);
  }

  const variants = withCityTypeVariants(rawCityName);
  for (const v of variants) {
    candidates.push(v);
    candidates.push(`${v} `);
    const slug = v.replace(/\s+/g, "-").trim();
    if (slug && slug !== v) {
      candidates.push(slug);
    }
  }

  return Array.from(new Set(candidates.filter((value) => value.length > 0)));
}

async function loadBarangaysFromCloud(input: {
  cityName: string;
  cityCode?: string;
  provinceName?: string;
  provinceCode?: string;
  isEbMagalona?: boolean;
}): Promise<BarangayOption[]> {
  const resolvedCityCode = await resolveCityCode({
    cityName: input.cityName,
    cityCode: input.cityCode,
    provinceName: input.provinceName,
    provinceCode: input.provinceCode,
  });

  const candidates = buildCityLookupCandidates(input.cityName, resolvedCityCode ?? undefined);
  const collected: BarangayOption[] = [];

  for (const candidate of candidates) {
    try {
      const endpoint = `${PSGC_CLOUD_BASE_URL}/cities-municipalities/${encodeURIComponent(candidate)}/barangays`;
      const barangays = await fetchCloudArray<PsgcCloudBarangay>(endpoint);
      const mapped = toBarangayOptions(barangays, input.provinceCode, input.isEbMagalona);
      if (mapped.length > 0) {
        collected.push(...mapped);
        break;
      }
    } catch (error) {
      if (error instanceof CloudFetchError) {
        logBarangayLookup("external-fetch-failed", {
          status: error.status,
          url: error.url,
          cityName: input.cityName,
          candidate,
        });
      }
      // Try next candidate.
    }
  }

  if (collected.length > 0) {
    return dedupeAndSortBarangays(collected);
  }

  // Defensive fallback for unexpected city endpoint behavior.
  const allBarangays = await fetchCloudArray<PsgcCloudBarangay>(`${PSGC_CLOUD_BASE_URL}/barangays`);

  const filteredFallback = allBarangays.filter((row) => {
    const rowCityCode = resolveBarangayCityCode(row);
    if (resolvedCityCode && rowCityCode && resolvedCityCode === rowCityCode) {
      return true;
    }

    const rowProvinceCode = resolveBarangayProvinceCode(row);
    if (input.provinceCode && rowProvinceCode && input.provinceCode !== rowProvinceCode) {
      return false;
    }

    const rowProvinceName = resolveBarangayProvinceName(row);
    if (
      input.provinceName &&
      rowProvinceName &&
      normalizeName(input.provinceName) !== normalizeName(rowProvinceName)
    ) {
      return false;
    }

    const cityName = resolveBarangayCityName(row);
    if (cityName && matchesName(cityName, input.cityName)) {
      return true;
    }

    return false;
  });

  return dedupeAndSortBarangays(toBarangayOptions(filteredFallback, input.provinceCode));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const countryCode = url.searchParams.get("countryCode")?.trim().toUpperCase() ?? "";
  const provinceName = url.searchParams.get("provinceName")?.trim() ?? "";
  const cityName = url.searchParams.get("cityName")?.trim() ?? "";
  const provinceCode = url.searchParams.get("provinceCode")?.trim() ?? "";
  const cityCode = url.searchParams.get("cityCode")?.trim() ?? "";

  if (countryCode !== "PH") {
    return NextResponse.json([] satisfies BarangayOption[]);
  }

  if (!provinceName || !cityName) {
    return NextResponse.json([] satisfies BarangayOption[]);
  }

  const normalizedCityName = normalizeEbMagalonaCityName(cityName) || cityName;
  const ebMagalonaCityRequest = isEbMagalonaRequestedCity(cityName);

  logBarangayLookup("request", {
    countryCode,
    provinceName,
    cityName,
    normalizedCityName,
    provinceCode: provinceCode || null,
    cityCode: cityCode || null,
  });

  try {
    const options = await loadBarangaysFromCloud({
      cityName: normalizedCityName,
      cityCode: cityCode || undefined,
      provinceName: provinceName || undefined,
      provinceCode: provinceCode || undefined,
      isEbMagalona: ebMagalonaCityRequest,
    });

    if (!ebMagalonaCityRequest) {
      logBarangayLookup("response", {
        normalizedCityName,
        source: "external",
        count: options.length,
      });
      return NextResponse.json(options);
    }

    if (options.length === 23) {
      logBarangayLookup("response", {
        normalizedCityName,
        source: "external-normalized",
        count: options.length,
      });
      return NextResponse.json(options);
    }

    const localFallback = buildLocalEbMagalonaFallbackOptions();
    logBarangayLookup("response", {
      normalizedCityName,
      source: "local-fallback",
      count: localFallback.length,
      fallbackUsed: true,
    });

    return NextResponse.json(localFallback);
  } catch (error) {
    if (error instanceof CloudFetchError) {
      logBarangayLookup("external-failure", {
        status: error.status,
        url: error.url,
        normalizedCityName,
        fallbackUsed: ebMagalonaCityRequest,
      });
    }

    if (ebMagalonaCityRequest) {
      const localFallback = buildLocalEbMagalonaFallbackOptions();
      logBarangayLookup("response", {
        normalizedCityName,
        source: "local-fallback-on-error",
        count: localFallback.length,
        fallbackUsed: true,
      });
      return NextResponse.json(localFallback);
    }

    return NextResponse.json([] satisfies BarangayOption[]);
  }
}

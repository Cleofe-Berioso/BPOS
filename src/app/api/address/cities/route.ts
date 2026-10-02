import { NextResponse } from "next/server";

import {
  ADDRESS_API_NOT_CONFIGURED_MESSAGE,
  ADDRESS_API_REQUEST_FAILED_MESSAGE,
  assertAllowedPsgcCloudUrl,
  fetchTrustedHttpsJson,
  getCountryStateCityApiKey,
  jsonAddressError,
  normalizeCountryStateCityCity,
  PSGC_CLOUD_BASE_URL,
} from "@/lib/address-server";
import type { CountryStateCityCity } from "@/lib/address-types";

export const dynamic = "force-dynamic";

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
};

function parseCloudArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (payload && typeof payload === "object") {
    const maybeObject = payload as Record<string, unknown>;
    if (Array.isArray(maybeObject.data)) return maybeObject.data as T[];
    if (Array.isArray(maybeObject.results)) return maybeObject.results as T[];
  }

  return [];
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.'’,-]/g, " ")
    .replace(/\b(city|municipality)\s+of\b/g, "")
    .replace(/\b(city|municipality)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    .trim();
}

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = sanitizeMojibake(value);
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchCloudArray<T>(url: string): Promise<T[]> {
  const response = await fetchTrustedHttpsJson(assertAllowedPsgcCloudUrl(url), {
    allowedHostname: "psgc.cloud",
  });
  if (!response.ok) {
    throw new Error("Request failed");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return parseCloudArrayPayload<T>(payload);
}

function toCityOptions(rows: PsgcCloudCityMunicipality[]) {
  const seen = new Set<string>();
  const options = [] as NonNullable<ReturnType<typeof normalizeCountryStateCityCity>>[];

  for (const row of rows) {
    const code = normalizeCode(row.code);
    const name = normalizeLabel(row.name);
    if (!code || !name) continue;

    const key = `${code.toLowerCase()}::${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      label: name,
      value: name,
      code,
      name,
    });
  }

  return options.sort((left, right) => left.label.localeCompare(right.label));
}

export async function GET(request: Request) {
  const apiKey = getCountryStateCityApiKey();

  const url = new URL(request.url);
  const countryCode = url.searchParams.get("countryCode")?.trim();
  const stateCode = url.searchParams.get("stateCode")?.trim();
  const stateName = url.searchParams.get("stateName")?.trim() ?? "";
  if (!countryCode || !stateCode) {
    return jsonAddressError(400, "countryCode and stateCode are required.");
  }

  // 1. Try CountryStateCity API first when API key is available (covers worldwide and all 99 PH provinces/NCR).
  if (apiKey) {
    try {
      const response = await fetch(
        `https://api.countrystatecity.in/v1/countries/${encodeURIComponent(countryCode)}/states/${encodeURIComponent(stateCode)}/cities`,
        {
          headers: {
            "X-CSCAPI-KEY": apiKey,
          },
          cache: "no-store",
        }
      );

      if (response.ok) {
        const cities = (await response.json()) as CountryStateCityCity[];
        const options = cities
          .map((city) => normalizeCountryStateCityCity(city))
          .filter((option): option is NonNullable<typeof option> => Boolean(option));

        if (options.length > 0) {
          return NextResponse.json(options.sort((left, right) => left.label.localeCompare(right.label)));
        }
      } else {
        console.warn("[address/cities] CSC API returned status", {
          countryCode,
          stateCode,
          status: response.status,
        });
      }
    } catch (cscErr) {
      console.warn("[address/cities] CSC API lookup failed, trying fallback", { countryCode, stateCode, cscErr });
    }
  }

  // 2. Fallback for Philippines via PSGC Cloud.
  if (countryCode.toUpperCase() === "PH") {
    try {
      const cleanStateName = stateName
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\b(province|region)\b/gi, "")
        .trim();

      const isNcr =
        stateCode === "00" ||
        /(ncr|metro\s+manila|national\s+capital)/i.test(cleanStateName) ||
        /(ncr|metro\s+manila|national\s+capital)/i.test(stateName);

      if (isNcr) {
        const allCities = await fetchCloudArray<PsgcCloudCityMunicipality>(
          `${PSGC_CLOUD_BASE_URL}/cities-municipalities`
        );
        const ncrCities = allCities.filter(
          (city) =>
            (city.code && city.code.startsWith("13")) ||
            (typeof city.region === "string" &&
              (/(national\s+capital|ncr)/i.test(city.region) || /manila/i.test(city.region)))
        );
        if (ncrCities.length > 0) {
          return NextResponse.json(toCityOptions(ncrCities));
        }
      }

      const candidates = [cleanStateName, stateName, stateCode].filter((entry) => entry.length > 0);
      const collected: PsgcCloudCityMunicipality[] = [];

      for (const candidate of candidates) {
        try {
          const byProvince = await fetchCloudArray<PsgcCloudCityMunicipality>(
            `${PSGC_CLOUD_BASE_URL}/provinces/${encodeURIComponent(candidate)}/cities-municipalities`
          );

          if (byProvince.length > 0) {
            collected.push(...byProvince);
            break;
          }
        } catch {
          // Try next candidate.
        }
      }

      if (collected.length > 0) {
        return NextResponse.json(toCityOptions(collected));
      }

      const allCities = await fetchCloudArray<PsgcCloudCityMunicipality>(
        `${PSGC_CLOUD_BASE_URL}/cities-municipalities`
      );

      const normalizedTarget = normalizeName(cleanStateName || stateName);
      const filtered = allCities.filter((city) => {
        const rawProvince =
          typeof city.province === "string"
            ? city.province
            : typeof city.province === "object" && city.province !== null
            ? city.province.name
            : "";
        const provinceName = normalizeLabel(rawProvince);
        if (!provinceName) return false;
        return normalizeName(provinceName) === normalizedTarget;
      });

      return NextResponse.json(toCityOptions(filtered));
    } catch (error) {
      console.error("[address/cities] PSGC Cloud fallback failure", { countryCode, stateCode, error });
      return jsonAddressError(502, ADDRESS_API_REQUEST_FAILED_MESSAGE);
    }
  }

  if (!apiKey) {
    console.error("[address/cities] Missing COUNTRY_STATE_CITY_API_KEY", { countryCode, stateCode });
    return jsonAddressError(500, ADDRESS_API_NOT_CONFIGURED_MESSAGE);
  }

  return jsonAddressError(502, ADDRESS_API_REQUEST_FAILED_MESSAGE);
}
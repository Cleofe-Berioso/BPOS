import { NextResponse } from "next/server";

import type { AddressApiErrorResponse, AddressOption } from "@/lib/address-types";

export const ADDRESS_API_REQUEST_FAILED_MESSAGE =
  "Address list could not be loaded. Please try again.";

export const ADDRESS_API_NOT_CONFIGURED_MESSAGE =
  "Address API key is missing. Configure COUNTRY_STATE_CITY_API_KEY on the server.";

export function getCountryStateCityApiKey(): string | null {
  const raw =
    process.env.COUNTRY_STATE_CITY_API_KEY?.trim() ||
    process.env.COUNTRYSTATECITY_API_KEY?.trim() ||
    null;
  if (!raw) return null;
  return raw.replace(/^["']|["']$/g, "").trim() || null;
}

export function jsonAddressError(status: number, error: string) {
  return NextResponse.json({ error } satisfies AddressApiErrorResponse, { status });
}

export function normalizeCountryStateCityCountry(country: {
  name?: string;
  iso2?: string;
}): AddressOption | null {
  if (typeof country.name !== "string" || typeof country.iso2 !== "string") {
    return null;
  }

  const name = country.name.trim();
  const code = country.iso2.trim().toUpperCase();
  if (!name || !code) {
    return null;
  }

  return { label: name, value: code, code, iso2: code, name };
}

export function normalizeCountryStateCityState(state: {
  name?: string;
  iso2?: string;
}): AddressOption | null {
  if (typeof state.name !== "string" || typeof state.iso2 !== "string") {
    return null;
  }

  const name = state.name.trim();
  const code = state.iso2.trim().toUpperCase();
  if (!name || !code) {
    return null;
  }

  return { label: name, value: code, code, iso2: code, name };
}

export const PSGC_CLOUD_BASE_URL = "https://psgc.cloud/api/v2";

const PSGC_CLOUD_HOSTNAME = "psgc.cloud";

export function assertAllowedPsgcCloudUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Invalid PSGC URL protocol");
  }
  if (parsed.hostname.toLowerCase() !== PSGC_CLOUD_HOSTNAME) {
    throw new Error("Invalid PSGC URL host");
  }
  return parsed.href;
}

export async function fetchTrustedHttpsJson(
  url: string,
  options: {
    allowedHostname: string;
    cache?: RequestCache;
    signal?: AbortSignal;
  }
): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Invalid URL protocol");
  }
  if (parsed.hostname.toLowerCase() !== options.allowedHostname.toLowerCase()) {
    throw new Error("Invalid URL host");
  }

  const response = await fetch(parsed.href, {
    cache: options.cache ?? "no-store",
    redirect: "manual",
    signal: options.signal,
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Unexpected redirect");
  }

  return response;
}

export function normalizeCountryStateCityCity(city: { name?: string }): AddressOption | null {
  if (typeof city.name !== "string") {
    return null;
  }

  const name = city.name.trim();
  if (!name) {
    return null;
  }

  return { label: name, value: name, code: name, name };
}
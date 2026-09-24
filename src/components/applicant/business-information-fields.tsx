"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BusinessInfo } from "@/lib/applicant-types";
import {
  EB_MAGALONA_BARANGAYS,
  canUseMainOfficeAsBusinessLocation,
  CORPORATION_NATIONALITY_OPTIONS,
  getOwnerRoleLabel,
  getRegistrationHelperText,
  getRegistrationLabel,
  normalizeEbMagalonaBarangayName,
  requiresCorporationNationality,
  resolveNationalityOnBusinessTypeChange,
} from "@/lib/business-rules";
import { formatOwnerName } from "@/lib/person-name";
import { autoCapitalizeWords } from "@/lib/text-input";
import { NATIONALITY_OPTIONS } from "@/lib/nationality-options";
import {
  buildEbMagalonaBusinessAddress,
  EB_MAGALONA_CITY,
  EB_MAGALONA_COUNTRY,
  EB_MAGALONA_COUNTRY_CODE,
  EB_MAGALONA_PROVINCE,
  EB_MAGALONA_ZIP_CODE,
} from "@/lib/address-options";
import type { AddressOption } from "@/lib/address-types";
import { loadBarangays, loadCities, loadCountries, loadStates } from "@/lib/address-client";
import { FormField } from "@/components/ui/form-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { BusinessLocationPicker } from "@/components/maps/business-location-picker";
import { PH_MOBILE_HINT, handlePhMobileBeforeInput, handlePhMobileKeyDown, sanitizePhMobileInput } from "@/lib/ph-mobile";

interface BusinessInformationFieldsProps {
  value: BusinessInfo;
  onChange: (next: BusinessInfo) => void;
  applicationType?: "NEW" | "RENEWAL" | "CLOSURE";
  lockedFields?: Array<keyof BusinessInfo>;
  fieldErrors?: Partial<Record<keyof BusinessInfo, string>>;
  enableCascadingAddress?: boolean;
  onFieldBlur?: (field: keyof BusinessInfo) => void;
  onClearFieldError?: (field: keyof BusinessInfo) => void;
}

function fieldLocked(lockedFields: Array<keyof BusinessInfo>, key: keyof BusinessInfo) {
  return lockedFields.includes(key);
}

function fieldClasses(locked: boolean) {
  return locked
    ? "w-full text-sm border-[var(--border-color)] bg-[var(--muted-surface)] text-[var(--ink-muted)] shadow-inner"
    : "w-full text-sm";
}

function LockedHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p className="mt-1 ui-caption">
      Pulled from the existing business record.
    </p>
  );
}

function normalizeAddressName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.'’,-]/g, " ")
    .replace(/\b(city|municipality)\s+of\b/g, "")
    .replace(/\b(city|municipality|province)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type FetchedAddressList = {
  key: string;
  options: AddressOption[];
  loading: boolean;
  error?: string;
};

const EMPTY_FETCHED_ADDRESS_LIST: FetchedAddressList = {
  key: "",
  options: [],
  loading: false,
};

export function BusinessInformationFields({
  value,
  onChange,
  lockedFields = [],
  fieldErrors = {},
  enableCascadingAddress = false,
  onFieldBlur,
  onClearFieldError,
}: BusinessInformationFieldsProps) {
  const registrationLabel = getRegistrationLabel(value.businessType);
  const registrationHelperText = getRegistrationHelperText(value.businessType);
  const ownerRoleLabel = getOwnerRoleLabel(value.businessType);
  const showCorporationNationality = requiresCorporationNationality(value.businessType);
  const ownerIdentityLocked =
    fieldLocked(lockedFields, "ownerName") ||
    fieldLocked(lockedFields, "ownerFirstName") ||
    fieldLocked(lockedFields, "ownerMiddleName") ||
    fieldLocked(lockedFields, "ownerSurname") ||
    fieldLocked(lockedFields, "ownerSuffix");
  const nationalityLocked = fieldLocked(lockedFields, "nationality");
  const selectedMainOfficeCountry = (value.mainOfficeCountry ?? "").trim();
  const selectedMainOfficeCountryCode = (value.mainOfficeCountryCode ?? "").trim();
  const selectedMainOfficeProvince = (value.mainOfficeProvince ?? "").trim();
  const selectedMainOfficeProvinceCode = (value.mainOfficeProvinceCode ?? "").trim();
  const selectedMainOfficeCity = (value.mainOfficeCityMunicipality ?? "").trim();
  const isMainOfficePhilippines = /^Philippines$/i.test(selectedMainOfficeCountry) || selectedMainOfficeCountryCode.toUpperCase() === "PH";
  const hasMainOfficeCountry = selectedMainOfficeCountry.length > 0;
  const hasMainOfficeProvince = selectedMainOfficeProvince.length > 0;
  const hasMainOfficeCity = selectedMainOfficeCity.length > 0;
  const sameAsMainOffice = Boolean(value.sameAsMainOffice);
  const mainOfficeBarangayValue = value.mainOfficeBarangay?.trim() ?? "";
  const businessBarangayValue = value.businessBarangay?.trim() ?? "";
  const barangayValue = value.barangay?.trim() ?? "";
  const sameAsMainOfficeAllowed = canUseMainOfficeAsBusinessLocation({
    sameAsMainOffice,
    mainOfficeCountry: value.mainOfficeCountry,
    mainOfficeCountryCode: value.mainOfficeCountryCode,
    mainOfficeProvince: value.mainOfficeProvince,
    mainOfficeCityMunicipality: value.mainOfficeCityMunicipality,
  });

  const [countryOptions, setCountryOptions] = useState<AddressOption[]>([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const [countryError, setCountryError] = useState<string | undefined>();
  const [provinceList, setProvinceList] = useState<FetchedAddressList>(EMPTY_FETCHED_ADDRESS_LIST);
  const [cityList, setCityList] = useState<FetchedAddressList>(EMPTY_FETCHED_ADDRESS_LIST);
  const [barangayList, setBarangayList] = useState<FetchedAddressList>(EMPTY_FETCHED_ADDRESS_LIST);

  // Business address barangays: loaded from API, with static EB_MAGALONA_BARANGAYS as fallback.
  const [businessBarangayOptions, setBusinessBarangayOptions] = useState<string[]>([...EB_MAGALONA_BARANGAYS]);
  const [businessBarangayLoading, setBusinessBarangayLoading] = useState(false);

  // Keep refs to latest value/onChange so backfill effects don't re-run on every render.
  const latestValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    latestValueRef.current = value;
    onChangeRef.current = onChange;
  });

  const provinceFetchKey = selectedMainOfficeCountryCode;
  const provinceOptions = provinceList.key === provinceFetchKey ? provinceList.options : [];
  const provinceLoading = provinceList.key === provinceFetchKey && provinceList.loading;
  const provinceError = provinceList.key === provinceFetchKey ? provinceList.error : undefined;

  const cityFetchKey =
    selectedMainOfficeCountryCode && selectedMainOfficeProvinceCode
      ? `${selectedMainOfficeCountryCode}:${selectedMainOfficeProvinceCode}`
      : "";
  const cityOptions = cityList.key === cityFetchKey ? cityList.options : [];
  const cityLoading = cityList.key === cityFetchKey && cityList.loading;
  const cityError = cityList.key === cityFetchKey ? cityList.error : undefined;

  const selectedMainOfficeCityCode = cityOptions.find(
    (option) =>
      option.name === selectedMainOfficeCity ||
      normalizeAddressName(option.name) === normalizeAddressName(selectedMainOfficeCity)
  )?.value;

  const barangayFetchKey =
    isMainOfficePhilippines &&
    selectedMainOfficeCountryCode &&
    selectedMainOfficeProvince &&
    selectedMainOfficeCity
      ? `${selectedMainOfficeCountryCode}:${selectedMainOfficeProvinceCode}:${selectedMainOfficeCity}:${selectedMainOfficeCityCode ?? ""}`
      : "";
  const barangayOptions = barangayList.key === barangayFetchKey ? barangayList.options : [];
  const barangayLoading = barangayList.key === barangayFetchKey && barangayList.loading;
  const barangayError = barangayList.key === barangayFetchKey ? barangayList.error : undefined;

  useEffect(() => {
    let active = true;
    setCountryLoading(true);
    loadCountries()
      .then((options) => {
        if (!active) return;
        setCountryOptions(options);
        setCountryError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCountryError(error instanceof Error ? error.message : "Address list could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setCountryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!provinceFetchKey) return;

    let active = true;
    setProvinceList({ key: provinceFetchKey, options: [], loading: true });

    loadStates(provinceFetchKey)
      .then((options) => {
        if (!active) return;
        setProvinceList({ key: provinceFetchKey, options, loading: false, error: undefined });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProvinceList({
          key: provinceFetchKey,
          options: [],
          loading: false,
          error: error instanceof Error ? error.message : "Address list could not be loaded. Please try again.",
        });
      });

    return () => {
      active = false;
    };
  }, [provinceFetchKey]);

  useEffect(() => {
    if (!cityFetchKey) return;

    let active = true;
    setCityList({ key: cityFetchKey, options: [], loading: true });

    loadCities(selectedMainOfficeCountryCode, selectedMainOfficeProvinceCode, selectedMainOfficeProvince)
      .then((options) => {
        if (!active) return;
        setCityList({ key: cityFetchKey, options, loading: false, error: undefined });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCityList({
          key: cityFetchKey,
          options: [],
          loading: false,
          error: error instanceof Error ? error.message : "Address list could not be loaded. Please try again.",
        });
      });

    return () => {
      active = false;
    };
  }, [cityFetchKey, selectedMainOfficeCountryCode, selectedMainOfficeProvinceCode, selectedMainOfficeProvince]);

  useEffect(() => {
    if (!barangayFetchKey) return;

    let active = true;
    setBarangayList({ key: barangayFetchKey, options: [], loading: true });

    loadBarangays({
      countryCode: selectedMainOfficeCountryCode,
      provinceName: selectedMainOfficeProvince,
      cityName: selectedMainOfficeCity,
      provinceCode: selectedMainOfficeProvinceCode,
      cityCode: selectedMainOfficeCityCode,
    })
      .then((options) => {
        if (!active) return;
        setBarangayList({ key: barangayFetchKey, options, loading: false, error: undefined });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setBarangayList({
          key: barangayFetchKey,
          options: [],
          loading: false,
          error: error instanceof Error ? error.message : "Address list could not be loaded. Please try again.",
        });
      });

    return () => {
      active = false;
    };
  }, [
    barangayFetchKey,
    selectedMainOfficeCity,
    selectedMainOfficeCityCode,
    selectedMainOfficeCountryCode,
    selectedMainOfficeProvince,
    selectedMainOfficeProvinceCode,
  ]);

  // Load business address barangays from API on mount; fall back to static list on failure.
  useEffect(() => {
    let active = true;
    setBusinessBarangayLoading(true);
    loadBarangays({
      countryCode: EB_MAGALONA_COUNTRY_CODE,
      provinceName: EB_MAGALONA_PROVINCE,
      cityName: EB_MAGALONA_CITY,
    })
      .then((options) => {
        if (!active) return;
        const names = options.map((opt) => opt.name).filter(Boolean);
        if (names.length > 0) {
          setBusinessBarangayOptions(names);
        }
        // If API returns empty, keep the static fallback already in state.
      })
      .catch(() => {
        // API failed — static fallback is already in state, do nothing.
      })
      .finally(() => {
        if (active) setBusinessBarangayLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep business barangay mirrored to main office barangay only when sameAsMainOffice is enabled.
  useEffect(() => {
    if (!sameAsMainOffice) {
      return;
    }

    if (!sameAsMainOfficeAllowed) {
      return;
    }

    const mainOfficeBarangay = normalizeEbMagalonaBarangayName(mainOfficeBarangayValue);
    if (!mainOfficeBarangay) {
      return;
    }

    if (businessBarangayValue === mainOfficeBarangay && barangayValue === mainOfficeBarangay) {
      return;
    }

    onChangeRef.current({
      ...latestValueRef.current,
      businessBarangay: mainOfficeBarangay,
      barangay: mainOfficeBarangay,
      businessAddress: buildEbMagalonaBusinessAddress({
        barangay: mainOfficeBarangay,
        streetAddress: latestValueRef.current.businessStreetAddress,
      }),
    });
  }, [sameAsMainOffice, sameAsMainOfficeAllowed, mainOfficeBarangayValue, businessBarangayValue, barangayValue, onChange]);

  // Backfill country code from label when options first load (e.g. loading a saved draft).
  // Only depends on the data that actually controls the backfill — not value/onChange refs —
  // to avoid re-firing on every parent render.
  useEffect(() => {
    if (!selectedMainOfficeCountry || selectedMainOfficeCountryCode || countryOptions.length === 0) return;
    const match = countryOptions.find((option) => option.label === selectedMainOfficeCountry);
    if (match) {
      onChangeRef.current({ ...latestValueRef.current, mainOfficeCountryCode: match.value });
    }
   
  }, [countryOptions, selectedMainOfficeCountry, selectedMainOfficeCountryCode]);

  // Backfill province code from label when options first load.
  useEffect(() => {
    if (!selectedMainOfficeProvince || selectedMainOfficeProvinceCode || provinceOptions.length === 0) return;
    const match = provinceOptions.find((option) => option.label === selectedMainOfficeProvince);
    if (match) {
      onChangeRef.current({ ...latestValueRef.current, mainOfficeProvinceCode: match.value });
    }
   
  }, [provinceOptions, selectedMainOfficeProvince, selectedMainOfficeProvinceCode]);

  // Pin moved: update only coordinates, keep manual address fields intact.
  // Use refs so the callback is stable and doesn't trigger downstream re-renders.
  const handlePickerChange = useCallback(
    (nextValue: { latitude: number; longitude: number } | null) => {
      const latitude = nextValue == null ? null : Number(nextValue.latitude);
      const longitude = nextValue == null ? null : Number(nextValue.longitude);

      onChangeRef.current({
        ...latestValueRef.current,
        businessLatitude: latitude != null && Number.isFinite(latitude) ? latitude : null,
        businessLongitude: longitude != null && Number.isFinite(longitude) ? longitude : null,
      });
    },
    [] // stable for the lifetime of the component
  );

  const generatedBusinessAddress = buildEbMagalonaBusinessAddress({
    barangay: value.businessBarangay,
    streetAddress: value.businessStreetAddress,
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField
        label="Business Type"
        hint="Select the registered business organization type."
        required
        error={fieldErrors.businessType}
      >
        {fieldLocked(lockedFields, "businessType") ? (
          <div className="mb-2">
            <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
              Locked
            </span>
          </div>
        ) : null}
        <select
          data-field-key="businessType"
          aria-label="Business Type"
          className={fieldClasses(fieldLocked(lockedFields, "businessType"))}
          value={value.businessType}
          disabled={fieldLocked(lockedFields, "businessType")}
            onChange={(event) =>
            onChange({
              ...value,
              businessType: event.target.value as BusinessInfo["businessType"],
              nationality: resolveNationalityOnBusinessTypeChange(
                value.businessType,
                event.target.value as BusinessInfo["businessType"],
                value.nationality
              ),
              corporationNationality: requiresCorporationNationality(
                event.target.value as BusinessInfo["businessType"]
              )
                ? value.corporationNationality
                : undefined,
            })
          }
        >
          <option>Sole Proprietorship</option>
          <option>One Person Corporation</option>
          <option>Corporation</option>
          <option>Partnership</option>
          <option>Cooperative</option>
        </select>
        <LockedHint visible={fieldLocked(lockedFields, "businessType")} />
      </FormField>

      <FormField
        label={registrationLabel}
        hint={registrationHelperText}
        required
        error={fieldErrors.registrationNumber}
      >
        {fieldLocked(lockedFields, "registrationNumber") ? (
          <div className="mb-2">
            <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
              Locked
            </span>
          </div>
        ) : null}
        <input
          data-field-key="registrationNumber"
          aria-label={registrationLabel}
          className={fieldClasses(fieldLocked(lockedFields, "registrationNumber"))}
          value={value.registrationNumber}
          disabled={fieldLocked(lockedFields, "registrationNumber")}
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => onChange({ ...value, registrationNumber: event.target.value })}
        />
        <LockedHint visible={fieldLocked(lockedFields, "registrationNumber")} />
      </FormField>

      <FormField
        label="TIN"
        hint="Enter 9–15 digits (hyphens optional; stored as digits only)."
        required
        error={fieldErrors.tin}
      >
        {fieldLocked(lockedFields, "tin") ? (
          <div className="mb-2">
            <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
              Locked
            </span>
          </div>
        ) : null}
          <input
            data-field-key="tin"
            aria-label="TIN"
            className={fieldClasses(fieldLocked(lockedFields, "tin"))}
            value={value.tin}
            disabled={fieldLocked(lockedFields, "tin")}
            inputMode="numeric"
            maxLength={15}
            pattern="[0-9]{9,15}"
            onChange={(event) => onChange({ ...value, tin: event.target.value })}
          />
          <LockedHint visible={fieldLocked(lockedFields, "tin")} />
      </FormField>

      <FormField
        label="Business Name"
        hint="Use the exact business name on record."
        required
        error={fieldErrors.businessName}
      >
        {fieldLocked(lockedFields, "businessName") ? (
          <div className="mb-2">
            <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
              Locked
            </span>
          </div>
        ) : null}
        <input
          data-field-key="businessName"
          aria-label="Business Name"
          className={fieldClasses(fieldLocked(lockedFields, "businessName"))}
          value={value.businessName}
          disabled={fieldLocked(lockedFields, "businessName")}
          autoCapitalize="words"
          onChange={(event) =>
            onChange({ ...value, businessName: autoCapitalizeWords(event.target.value) })
          }
        />
        <LockedHint visible={fieldLocked(lockedFields, "businessName")} />
      </FormField>

      <FormField
        label="Trade Name"
        hint="Enter the public-facing trade name."
        required
        error={fieldErrors.tradeName}
      >
        {fieldLocked(lockedFields, "tradeName") ? (
          <div className="mb-2">
            <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
              Locked
            </span>
          </div>
        ) : null}
        <input
          data-field-key="tradeName"
          aria-label="Trade Name"
          className={fieldClasses(fieldLocked(lockedFields, "tradeName"))}
          value={value.tradeName}
          disabled={fieldLocked(lockedFields, "tradeName")}
          autoCapitalize="words"
          onChange={(event) =>
            onChange({ ...value, tradeName: autoCapitalizeWords(event.target.value) })
          }
        />
        <LockedHint visible={fieldLocked(lockedFields, "tradeName")} />
      </FormField>

      <FormField
        label={`${ownerRoleLabel} First Name`}
        hint={`Indicate the authorized ${ownerRoleLabel.toLowerCase()}'s first name.`}
        required
        error={fieldErrors.ownerFirstName ?? fieldErrors.ownerName}
      >
        {ownerIdentityLocked ? (
          <div className="mb-2">
            <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
              Locked
            </span>
          </div>
        ) : null}
        <input
          data-field-key="ownerFirstName"
          aria-label={`${ownerRoleLabel} First Name`}
          className={fieldClasses(ownerIdentityLocked)}
          value={value.ownerFirstName ?? ""}
          disabled={ownerIdentityLocked}
          autoCapitalize="words"
          onChange={(event) => {
            const ownerFirstName = autoCapitalizeWords(event.target.value);
            onChange({
              ...value,
              ownerFirstName,
              ownerName: formatOwnerName({
                ownerFirstName,
                ownerMiddleName: value.ownerMiddleName,
                ownerLastName: value.ownerSurname,
                ownerSuffix: value.ownerSuffix,
                ownerName: value.ownerName,
              }),
            });
          }}
        />
        <LockedHint visible={ownerIdentityLocked} />
      </FormField>

      <FormField
        label={`${ownerRoleLabel} Middle Name`}
        hint="Optional. Leave blank if not applicable."
        error={fieldErrors.ownerMiddleName}
      >
        <input
          data-field-key="ownerMiddleName"
          aria-label={`${ownerRoleLabel} Middle Name`}
          className={fieldClasses(ownerIdentityLocked)}
          value={value.ownerMiddleName ?? ""}
          disabled={ownerIdentityLocked}
          autoCapitalize="words"
          onChange={(event) => {
            const ownerMiddleName = autoCapitalizeWords(event.target.value);
            onChange({
              ...value,
              ownerMiddleName,
              ownerName: formatOwnerName({
                ownerFirstName: value.ownerFirstName,
                ownerMiddleName,
                ownerLastName: value.ownerSurname,
                ownerSuffix: value.ownerSuffix,
                ownerName: value.ownerName,
              }),
            });
          }}
        />
      </FormField>

      <FormField
        label={`${ownerRoleLabel} Surname`}
        hint={`Indicate the authorized ${ownerRoleLabel.toLowerCase()}'s surname.`}
        required
        error={fieldErrors.ownerSurname ?? fieldErrors.ownerName}
      >
        <input
          data-field-key="ownerSurname"
          aria-label={`${ownerRoleLabel} Surname`}
          className={fieldClasses(ownerIdentityLocked)}
          value={value.ownerSurname ?? ""}
          disabled={ownerIdentityLocked}
          autoCapitalize="words"
          onChange={(event) => {
            const ownerSurname = autoCapitalizeWords(event.target.value);
            onChange({
              ...value,
              ownerSurname,
              ownerName: formatOwnerName({
                ownerFirstName: value.ownerFirstName,
                ownerMiddleName: value.ownerMiddleName,
                ownerLastName: ownerSurname,
                ownerSuffix: value.ownerSuffix,
                ownerName: value.ownerName,
              }),
            });
          }}
        />
      </FormField>

      <FormField
        label={`${ownerRoleLabel} Suffix`}
        hint="Optional. Examples: Jr, Sr, III."
        error={fieldErrors.ownerSuffix}
      >
        <input
          data-field-key="ownerSuffix"
          aria-label={`${ownerRoleLabel} Suffix`}
          className={fieldClasses(ownerIdentityLocked)}
          value={value.ownerSuffix ?? ""}
          disabled={ownerIdentityLocked}
          onChange={(event) => {
            const ownerSuffix = autoCapitalizeWords(event.target.value);
            onChange({
              ...value,
              ownerSuffix,
              ownerName: formatOwnerName({
                ownerFirstName: value.ownerFirstName,
                ownerMiddleName: value.ownerMiddleName,
                ownerLastName: value.ownerSurname,
                ownerSuffix,
                ownerName: value.ownerName,
              }),
            });
          }}
        />
      </FormField>

        <FormField
          label="Sex"
          hint="Select the owner or president's sex."
          error={fieldErrors.sex}
        >
          <select
            data-field-key="sex"
            aria-label="Sex"
            className={fieldClasses(fieldLocked(lockedFields, "sex"))}
            value={value.sex ?? ""}
            disabled={fieldLocked(lockedFields, "sex")}
            onChange={(event) =>
              onChange({ ...value, sex: event.target.value || undefined })
            }
          >
            <option value="">Not specified</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </FormField>

        <FormField
          label="Nationality"
          hint="Select the owner/applicant nationality."
          required
          error={fieldErrors.nationality}
        >
          {nationalityLocked ? (
            <div className="mb-2">
              <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
                Locked
              </span>
            </div>
          ) : null}
          <select
            data-field-key="nationality"
            aria-label="Nationality"
            className={fieldClasses(nationalityLocked)}
            value={value.nationality}
            disabled={nationalityLocked}
            onChange={(event) => onChange({ ...value, nationality: event.target.value })}
          >
            <option value="" disabled>
              Select nationality
            </option>
            {NATIONALITY_OPTIONS.map((nat) => (
              <option key={nat} value={nat}>
                {nat}
              </option>
            ))}
          </select>
          <LockedHint visible={fieldLocked(lockedFields, "nationality")} />
        </FormField>

      {showCorporationNationality ? (
        <FormField
          label="Corporation Nationality"
          hint="Indicate whether the corporation is Filipino-owned or foreign-owned."
          required
          error={fieldErrors.corporationNationality}
        >
          <select
            data-field-key="corporationNationality"
            aria-label="Corporation Nationality"
            className={fieldClasses(fieldLocked(lockedFields, "corporationNationality"))}
            value={value.corporationNationality ?? ""}
            disabled={fieldLocked(lockedFields, "corporationNationality")}
            onChange={(event) =>
              onChange({
                ...value,
                corporationNationality: event.target.value as BusinessInfo["corporationNationality"],
              })
            }
          >
            <option value="" disabled>
              Select corporation nationality
            </option>
            {CORPORATION_NATIONALITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}

      <FormField
        label="Email"
        hint="Use an active email address for notifications."
        required
        error={fieldErrors.email}
      >
        <input
          data-field-key="email"
          type="email"
          aria-label="Email"
          className={fieldClasses(fieldLocked(lockedFields, "email"))}
          value={value.email}
          disabled={fieldLocked(lockedFields, "email")}
          onChange={(event) => onChange({ ...value, email: event.target.value })}
        />
      </FormField>

      {enableCascadingAddress ? (
        <>
          <FormField
            label="Main Office Country"
            hint="Main office or mailing address country."
            required
            error={fieldErrors.mainOfficeCountry}
          >
            <div data-field-key="mainOfficeCountry">
            <SearchableSelect
              ariaLabel="Main Office Country"
              options={countryOptions}
              value={value.mainOfficeCountryCode ?? ""}
              selectedLabel={value.mainOfficeCountry ?? ""}
              loading={countryLoading}
              error={countryError}
              onChange={(nextCountry) =>
                onChange({
                  ...value,
                  mainOfficeCountry: nextCountry.name,
                  mainOfficeCountryCode: nextCountry.value,
                  mainOfficeProvince: "",
                  mainOfficeProvinceCode: "",
                  mainOfficeCityMunicipality: "",
                  mainOfficeBarangay: "",
                  mainOfficeStreetAddress: "",
                })
              }
              disabled={fieldLocked(lockedFields, "mainOfficeCountry")}
              placeholder="Select country"
            />
            </div>
          </FormField>

          <FormField
            label="Main Office Province / State"
            hint="Select province/state for main office address."
            required
            error={fieldErrors.mainOfficeProvince}
          >
            <div data-field-key="mainOfficeProvince">
            <SearchableSelect
              ariaLabel="Main Office Province / State"
              options={provinceOptions}
              value={value.mainOfficeProvinceCode ?? ""}
              selectedLabel={value.mainOfficeProvince ?? ""}
              loading={provinceLoading}
              error={provinceError}
              onChange={(nextProvince) =>
                onChange({
                  ...value,
                  mainOfficeProvince: nextProvince.name,
                  mainOfficeProvinceCode: nextProvince.value,
                  mainOfficeCityMunicipality: "",
                  mainOfficeBarangay: "",
                  mainOfficeStreetAddress: "",
                })
              }
              disabled={fieldLocked(lockedFields, "mainOfficeProvince") || !hasMainOfficeCountry}
              placeholder={!hasMainOfficeCountry ? "Select country first" : "Select province/state"}
            />
            </div>
          </FormField>

          <FormField
            label="Main Office City / Municipality"
            hint="Select city/municipality for main office address."
            required
            error={fieldErrors.mainOfficeCityMunicipality}
          >
            <div data-field-key="mainOfficeCityMunicipality">
            <SearchableSelect
              ariaLabel="Main Office City / Municipality"
              options={cityOptions}
              value={selectedMainOfficeCityCode ?? value.mainOfficeCityMunicipality ?? ""}
              selectedLabel={value.mainOfficeCityMunicipality ?? ""}
              loading={cityLoading}
              error={cityError}
              onChange={(nextCityMunicipality) =>
                onChange({
                  ...value,
                  mainOfficeCityMunicipality: nextCityMunicipality.name,
                  mainOfficeBarangay: "",
                  mainOfficeStreetAddress: "",
                })
              }
              disabled={fieldLocked(lockedFields, "mainOfficeCityMunicipality") || !hasMainOfficeCountry || !hasMainOfficeProvince}
              placeholder={!hasMainOfficeCountry ? "Select country first" : !hasMainOfficeProvince ? "Select province/state first" : "Select city/municipality"}
            />
            </div>
          </FormField>

          {hasMainOfficeCountry && isMainOfficePhilippines ? (
            <FormField
              label="Main Office Barangay"
              hint="Barangay is required for Philippine main office addresses."
              required
              error={fieldErrors.mainOfficeBarangay}
            >
              <div data-field-key="mainOfficeBarangay">
              <SearchableSelect
                ariaLabel="Main Office Barangay"
                options={barangayOptions}
                value={value.mainOfficeBarangay ?? ""}
                selectedLabel={value.mainOfficeBarangay ?? ""}
                loading={barangayLoading}
                error={barangayError}
                onChange={(nextBarangay) =>
                  onChange({
                    ...value,
                    mainOfficeBarangay: nextBarangay.name,
                    ...(value.sameAsMainOffice && sameAsMainOfficeAllowed
                      ? {
                          businessBarangay: normalizeEbMagalonaBarangayName(nextBarangay.name),
                          barangay: normalizeEbMagalonaBarangayName(nextBarangay.name),
                          businessAddress: buildEbMagalonaBusinessAddress({
                            barangay: normalizeEbMagalonaBarangayName(nextBarangay.name),
                            streetAddress: value.businessStreetAddress,
                          }),
                        }
                      : {}),
                    mainOfficeStreetAddress: "",
                  })
                }
                disabled={
                  fieldLocked(lockedFields, "mainOfficeBarangay") ||
                  !hasMainOfficeCountry ||
                  !hasMainOfficeProvince ||
                  !hasMainOfficeCity
                }
                placeholder={
                  !hasMainOfficeCountry
                    ? "Select country first"
                    : !hasMainOfficeProvince
                      ? "Select province/state first"
                      : !hasMainOfficeCity
                        ? "Select city/municipality first"
                        : "Select barangay"
                }
              />
                </div>
            </FormField>
          ) : null}

          {hasMainOfficeCountry && !isMainOfficePhilippines ? (
            <FormField
              label="Main Office Street / Address Line"
              hint="Enter street, building, unit, or mailing line for main office."
              required
              error={fieldErrors.mainOfficeStreetAddress}
            >
              <input
                data-field-key="mainOfficeStreetAddress"
                aria-label="Main Office Street / Address Line"
                className={fieldClasses(fieldLocked(lockedFields, "mainOfficeStreetAddress"))}
                value={value.mainOfficeStreetAddress ?? ""}
                disabled={
                  fieldLocked(lockedFields, "mainOfficeStreetAddress") ||
                  !hasMainOfficeCountry ||
                  !hasMainOfficeProvince ||
                  !hasMainOfficeCity
                }
                placeholder={
                  !hasMainOfficeCountry
                    ? "Select country first"
                    : !hasMainOfficeProvince
                      ? "Select province/state first"
                      : !hasMainOfficeCity
                        ? "Select city/municipality first"
                        : "Enter street, building, unit, or mailing line"
                }
                onChange={(event) => onChange({ ...value, mainOfficeStreetAddress: event.target.value })}
              />
            </FormField>
          ) : null}

          <FormField
            label="Main Office Zip Code"
            hint="Postal / ZIP code of the main office address (optional)."
            error={fieldErrors.mainOfficeZipCode}
          >
            <input
              data-field-key="mainOfficeZipCode"
              aria-label="Main Office Zip Code"
              inputMode="numeric"
              maxLength={10}
              className={fieldClasses(fieldLocked(lockedFields, "mainOfficeZipCode"))}
              value={value.mainOfficeZipCode ?? ""}
              disabled={fieldLocked(lockedFields, "mainOfficeZipCode")}
              placeholder="e.g., 6118"
              onChange={(event) =>
                onChange({ ...value, mainOfficeZipCode: event.target.value.replace(/[^0-9A-Za-z-]/g, "") })
              }
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField
              label="Main Office Address (Auto-generated)"
              hint="Generated from address fields above."
              required
              error={fieldErrors.mainOfficeAddress}
            >
              {value.mainOfficeAddress ? (
                <div className={fieldClasses(true)}>
                  <span data-field-key="mainOfficeAddress">{value.mainOfficeAddress}</span>
                </div>
              ) : (
                <div className="w-full rounded-[var(--radius-control)] border border-dashed border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-3 text-sm italic text-[var(--ink-muted)]">
                  Complete address fields to generate full address.
                </div>
              )}
            </FormField>
          </div>
        </>
      ) : (
        <div className="md:col-span-2">
          <FormField
            label="Main Office Address"
            hint="Enter the full official main office address, including house/building number, street, barangay, city/municipality, province, and ZIP code if available."
            required
            error={fieldErrors.mainOfficeAddress}
          >
            {fieldLocked(lockedFields, "mainOfficeAddress") ? (
              <div className="mb-2">
                <span className="ui-badge bg-[var(--muted-surface)] text-[var(--ink-muted)]">
                  Locked
                </span>
              </div>
            ) : null}
            <input
              data-field-key="mainOfficeAddress"
              aria-label="Main Office Address"
              className={fieldClasses(fieldLocked(lockedFields, "mainOfficeAddress"))}
              value={value.mainOfficeAddress}
              disabled={fieldLocked(lockedFields, "mainOfficeAddress")}
              onChange={(event) => onChange({ ...value, mainOfficeAddress: event.target.value })}
            />
          </FormField>
        </div>
      )}

      <div className="md:col-span-2">
        <div className="mb-4">
          <div data-field-key="businessAddress" />
          <p className="mb-1 text-sm font-semibold text-[var(--foreground)]">
            Business Address / Place of Operation
          </p>
          <label className="mb-3 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={Boolean(value.sameAsMainOffice)}
              disabled={fieldLocked(lockedFields, "businessAddress")}
              onChange={(event) => onChange({ ...value, sameAsMainOffice: event.target.checked })}
            />
            Use Main Office Barangay for Business Address
          </label>
          {value.sameAsMainOffice && !sameAsMainOfficeAllowed ? (
            <p className="mb-2 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning)]">
              Main Office Address is outside EB Magalona. Please enter the Business Address separately.
            </p>
          ) : null}
          {generatedBusinessAddress ? (
            <div className="w-full rounded-[var(--radius-control)] border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-3 text-sm text-[var(--ink-muted)] shadow-inner">
              {generatedBusinessAddress}
            </div>
          ) : (
            <div className="w-full rounded-[var(--radius-control)] border border-dashed border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-3 text-sm italic text-[var(--ink-muted)]">
              Complete Barangay and Street fields below to generate address preview.
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-3.5 sm:p-4 md:col-span-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">Fixed Business Location</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              label="Country"
              hint="Business location country."
              required
            >
              <div className={fieldClasses(true)}>
                {EB_MAGALONA_COUNTRY}
              </div>
            </FormField>

            <FormField
              label="Province"
              hint="Business location province."
              required
            >
              <div className={fieldClasses(true)}>
                {EB_MAGALONA_PROVINCE}
              </div>
            </FormField>

            <FormField
              label="City / Municipality"
              hint="Business location city."
              required
            >
              <div className={fieldClasses(true)}>
                {EB_MAGALONA_CITY}
              </div>
            </FormField>

            <FormField
              label="Zip Code"
              hint="Fixed postal code for EB Magalona."
              required
            >
              <div className={fieldClasses(true)} data-field-key="businessZipCode">
                {value.businessZipCode || EB_MAGALONA_ZIP_CODE}
              </div>
            </FormField>
          </div>
        </div>

        <FormField
          label="Business Barangay"
          hint="Barangay within EB Magalona where business operates."
          required
          error={fieldErrors.businessBarangay}
        >
          <select
            data-field-key="businessBarangay"
            aria-label="Business Barangay"
            className={fieldClasses(businessBarangayLoading || fieldLocked(lockedFields, "businessBarangay"))}
            value={value.businessBarangay ?? ""}
            disabled={businessBarangayLoading || fieldLocked(lockedFields, "businessBarangay")}
            onChange={(event) => {
              const newBarangay = event.target.value ? normalizeEbMagalonaBarangayName(event.target.value) : undefined;
              onChange({
                ...value,
                businessBarangay: newBarangay,
                barangay: newBarangay,
                businessAddress: buildEbMagalonaBusinessAddress({
                  barangay: newBarangay,
                  streetAddress: value.businessStreetAddress,
                }),
              });
            }}
          >
            <option value="" disabled>
              {businessBarangayLoading ? "Loading barangays…" : "Select barangay"}
            </option>
            {businessBarangayOptions.map((brgy) => (
              <option key={brgy} value={brgy}>
                {brgy}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Business Street / Purok / Building / Unit"
          hint="Street name, purok, building number, unit, or other details of the business location."
          required
          error={fieldErrors.businessStreetAddress}
        >
          <input
            data-field-key="businessStreetAddress"
            aria-label="Business Street / Purok / Building / Unit"
            className={fieldClasses(fieldLocked(lockedFields, "businessStreetAddress"))}
            value={value.businessStreetAddress ?? ""}
            disabled={fieldLocked(lockedFields, "businessStreetAddress")}
            onChange={(event) => {
              const newStreet = event.target.value;
              onChange({
                ...value,
                businessStreetAddress: newStreet,
                streetAddress: newStreet,
                businessAddress: buildEbMagalonaBusinessAddress({
                  barangay: value.businessBarangay,
                  streetAddress: newStreet,
                }),
              });
            }}
            placeholder="e.g., 123 Main St, Purok 5, or Building A Unit 201"
          />
          {value.businessLatitude != null && !value.businessStreetAddress ? (
            <p className="mt-1 text-xs text-[var(--warning)]">
              Enter the exact street, purok, building, or unit.
            </p>
          ) : null}
        </FormField>

        <div className="mt-4">
          <div data-field-key="businessLatitude" />
          <div data-field-key="businessLongitude" />
          <BusinessLocationPicker
            value={
              value.businessLatitude != null && value.businessLongitude != null
                ? { latitude: value.businessLatitude, longitude: value.businessLongitude }
                : null
            }
            onChange={handlePickerChange}
            readOnly={fieldLocked(lockedFields, "businessAddress")}
            error={fieldErrors.businessLatitude ?? fieldErrors.businessLongitude}
          />
          {Number.isFinite(value.businessLatitude) && Number.isFinite(value.businessLongitude) ? (
            <p className="mt-2 text-xs font-medium text-[var(--success)]">
              Pinned coordinates: {value.businessLatitude.toFixed(6)}, {value.businessLongitude.toFixed(6)}
            </p>
          ) : null}
        </div>
      </div>

      <FormField
        label="Telephone Number"
        hint="Optional landline or office number, if applicable."
        error={fieldErrors.telephone}
      >
        <input
          data-field-key="telephone"
          aria-label="Telephone Number"
          className={fieldClasses(fieldLocked(lockedFields, "telephone"))}
          value={value.telephone ?? ""}
          disabled={fieldLocked(lockedFields, "telephone")}
          onChange={(event) => onChange({ ...value, telephone: event.target.value })}
        />
      </FormField>

      <FormField
        label="Mobile Number"
        hint={PH_MOBILE_HINT}
        required
        error={fieldErrors.phone}
      >
        <input
          data-field-key="phone"
          aria-label="Mobile Number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          pattern="^09\d{9}$"
          maxLength={11}
          className={fieldClasses(fieldLocked(lockedFields, "phone"))}
          value={value.phone}
          disabled={fieldLocked(lockedFields, "phone")}
          onKeyDown={(event) => handlePhMobileKeyDown(event)}
          onBeforeInput={(event) =>
            handlePhMobileBeforeInput(event.nativeEvent as InputEvent)
          }
          onChange={(event) => {
            const phone = sanitizePhMobileInput(event.target.value);
            onChange({ ...value, phone });
            onClearFieldError?.("phone");
          }}
          onPaste={(event) => {
            event.preventDefault();
            const phone = sanitizePhMobileInput(event.clipboardData.getData("text"));
            onChange({ ...value, phone });
            onClearFieldError?.("phone");
          }}
          onBlur={() => onFieldBlur?.("phone")}
        />
      </FormField>

    </div>
  );
}

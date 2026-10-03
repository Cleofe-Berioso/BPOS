import { describe, expect, it } from "vitest";
import {
  calculateAgeFromBirthDate,
  getOwnerRoleLabel,
  isCorporation,
  normalizeTin,
  requiresCorporationNationality,
  tinFromDb,
  tinToBigInt,
  validateRegistrationNumberFormat,
  validateTinFormat,
  RENEWAL_LOCKED_FIELDS,
  CLOSURE_LOCKED_FIELDS,
  isRecognizedEbMagalonaBarangay,
  normalizeEbMagalonaBarangayName,
  splitOwnerName,
  optionalIntFromDb,
  parseOptionalIntForDb,
  validateBusinessIdentityFormats,
  isValidCorporationNationality,
  normalizeNationality,
  applyLockedBusinessFields,
  normalizeBusinessInfo,
  formatRegistrationNumberInput,
} from "@/lib/business-rules";
import { resolveLocationBarangay } from "@/lib/business-location";
import {
  isValidPhMobile,
  phMobileFieldError,
  sanitizePhMobileInput,
  PH_MOBILE_HINT,
  PH_MOBILE_FORMAT_ERROR,
} from "@/lib/ph-mobile";

describe("WB-RULES — business identity & rules", () => {
  it("WB-RULES-01 TIN normalize and format validation", () => {
    expect(normalizeTin("123-456-789-012")).toBe("123456789012");
    expect(validateTinFormat("123456789012")).toBe(true);
    expect(validateTinFormat("123")).toBe(false);
    expect(validateTinFormat("abcdefghijkl")).toBe(false);
  });

  it("WB-RULES-02 tinToBigInt / tinFromDb round-trip", () => {
    const value = tinToBigInt("123-456-789-012");
    expect(typeof value).toBe("bigint");
    expect(tinFromDb(value)).toBe("123456789012");
    expect(() => tinToBigInt("")).toThrow(/TIN is required/);
    expect(() => tinToBigInt("12")).toThrow(/Wrong Format/);
  });

  it("WB-RULES-03 registration format by business type", () => {
    // DTI (Sole Proprietorship): exactly 7 digits only
    expect(validateRegistrationNumberFormat("Sole Proprietorship", "4789351")).toBe(true);
    expect(validateRegistrationNumberFormat("Sole Proprietorship", "478935")).toBe(false); // 6 digits
    expect(validateRegistrationNumberFormat("Sole Proprietorship", "47893512")).toBe(false); // 8 digits
    expect(validateRegistrationNumberFormat("Sole Proprietorship", "123456789")).toBe(false);
    expect(validateRegistrationNumberFormat("Sole Proprietorship", "DTI-2026-123456")).toBe(true); // legacy valid

    // CDA (Cooperative): 14 digits (or example 16 digits) with a hyphen after the first 4 digits
    expect(validateRegistrationNumberFormat("Cooperative", "9520-101300033148")).toBe(true); // example (16 digits total)
    expect(validateRegistrationNumberFormat("Cooperative", "9520-1013000331")).toBe(true); // 14-digit format: XXXX-XXXXXXXXXX
    expect(validateRegistrationNumberFormat("Cooperative", "9520101300033148")).toBe(false); // missing hyphen
    expect(validateRegistrationNumberFormat("Cooperative", "952-101300033148")).toBe(false); // wrong hyphen position
    expect(validateRegistrationNumberFormat("Cooperative", "9520-101300033")).toBe(false); // only 13 digits (9 after hyphen)
    expect(validateRegistrationNumberFormat("Cooperative", "9520-1013000331489")).toBe(false); // 17 digits (13 after hyphen)
    expect(validateRegistrationNumberFormat("Cooperative", "CDA-2026-123456")).toBe(true); // legacy valid

    // SEC (Corporation, Partnership, OPC)
    expect(validateRegistrationNumberFormat("Corporation", "CS2026-12345")).toBe(true);
    expect(validateRegistrationNumberFormat("Corporation", "CN123456789")).toBe(false);
    expect(validateRegistrationNumberFormat("Partnership", "CS2026-12345")).toBe(true);
    expect(validateRegistrationNumberFormat("One Person Corporation", "CS2026-12345")).toBe(true);

    // Auto-enforce typing format: DTI (7 digits max, digits only)
    expect(formatRegistrationNumberInput("Sole Proprietorship", "4789351")).toBe("4789351");
    expect(formatRegistrationNumberInput("Sole Proprietorship", "4789351999")).toBe("4789351");
    expect(formatRegistrationNumberInput("Sole Proprietorship", "abc-4789351-xyz")).toBe("4789351");

    // Auto-enforce typing format: CDA (14 digits max, auto-hyphen after 4 digits)
    expect(formatRegistrationNumberInput("Cooperative", "9520")).toBe("9520");
    expect(formatRegistrationNumberInput("Cooperative", "95201")).toBe("9520-1");
    expect(formatRegistrationNumberInput("Cooperative", "9520101300033148")).toBe("9520-101300033148");
    expect(formatRegistrationNumberInput("Cooperative", "9520-101300033148")).toBe("9520-101300033148");
    expect(formatRegistrationNumberInput("Cooperative", "95201013000331489999")).toBe("9520-101300033148");
    expect(formatRegistrationNumberInput("Cooperative", "cda-9520-101300033148")).toBe("9520-101300033148");
  });

  it("WB-RULES-04 corporation helpers", () => {
    expect(isCorporation("Corporation")).toBe(true);
    expect(isCorporation("Sole Proprietorship")).toBe(false);
    expect(requiresCorporationNationality("Corporation")).toBe(true);
    expect(getOwnerRoleLabel("Corporation")).toBe("President / Officer-in-Charge");
    expect(getOwnerRoleLabel("Sole Proprietorship")).toBe("Owner");
  });

  it("WB-RULES-05 age calculation boundary", () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    expect(calculateAgeFromBirthDate("2008-08-26", now)).toBe(18);
    expect(calculateAgeFromBirthDate("2008-08-27", now)).toBe(17);
  });

  it("WB-RULES-06 renewal/closure locked field sets are non-empty", () => {
    expect(RENEWAL_LOCKED_FIELDS.length).toBeGreaterThan(3);
    expect(CLOSURE_LOCKED_FIELDS.length).toBeGreaterThan(3);
    expect(RENEWAL_LOCKED_FIELDS).toEqual(expect.arrayContaining(["tin", "registrationNumber", "businessName"]));
  });

  it("WB-RULES-07 barangay, owner split, identity helpers", () => {
    expect(isRecognizedEbMagalonaBarangay("Consing")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("NotABarangay")).toBe(false);
    expect(splitOwnerName("Juan Dela Cruz")).toMatchObject({
      ownerFirstName: "Juan",
      ownerSurname: "Cruz",
    });
    expect(optionalIntFromDb(5)).toBe("5");
    expect(parseOptionalIntForDb("12")).toBe(12);
    expect(parseOptionalIntForDb("")).toBeNull();
    const identity = validateBusinessIdentityFormats({
      businessType: "Sole Proprietorship",
      registrationNumber: "DTI-2026-123456",
      tin: "123456789012",
    });
    expect(identity.registrationNumber).toBe(true);
    expect(identity.tin).toBe(true);
    expect(isValidCorporationNationality("Filipino")).toBe(true);
    expect(normalizeNationality("Corporation", "  Foreign  ")).toBe("Foreign");
  });

  it("WB-RULES-08 renewal locks sex, corporationNationality, and business address without allowing overwrite", () => {
    expect(RENEWAL_LOCKED_FIELDS).toEqual(
      expect.arrayContaining([
        "sex",
        "corporationNationality",
        "businessAddress",
        "businessStreetAddress",
        "businessBarangay",
      ])
    );

    const sourceRecord = normalizeBusinessInfo({
      businessType: "Corporation",
      registrationNumber: "CS2026-12345",
      tin: "123456789012",
      businessName: "Original Corp",
      tradeName: "Original Corp",
      ownerName: "Jane Doe",
      nationality: "Filipino",
      sex: "Female",
      corporationNationality: "Filipino",
      businessAddress: "123 Pioneer St, Alicante, E. B. Magalona, Negros Occidental, Philippines, 6118",
      businessStreetAddress: "123 Pioneer St",
      businessBarangay: "Alicante",
      streetAddress: "123 Pioneer St",
      barangay: "Alicante",
      email: "corp@example.com",
      phone: "09171234567",
      mainOfficeAddress: "123 Pioneer St, Alicante, E. B. Magalona",
    } as any);

    const candidateMutation = normalizeBusinessInfo({
      ...sourceRecord,
      sex: "Male",
      corporationNationality: "Foreign",
      businessAddress: "999 Altered Rd, Consing, E. B. Magalona, Negros Occidental, Philippines, 6118",
      businessStreetAddress: "999 Altered Rd",
      businessBarangay: "Consing",
      streetAddress: "999 Altered Rd",
      barangay: "Consing",
    } as any);

    const result = applyLockedBusinessFields("RENEWAL", candidateMutation, sourceRecord);

    expect(result.sex).toBe("Female");
    expect(result.corporationNationality).toBe("Filipino");
    expect(result.businessAddress).toBe(sourceRecord.businessAddress);
    expect(result.businessAddress).not.toBe(candidateMutation.businessAddress);
    expect(result.businessStreetAddress).toBe("123 Pioneer St");
    expect(result.businessBarangay).toBe("Alicante");
  });

  it("WB-RULES-09 barangay normalization handles aliases, Roman numerals, mojibake, and location address fallback", () => {
    // Exact canonical names
    expect(isRecognizedEbMagalonaBarangay("Alacaygan")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("Santo Niño")).toBe(true);

    // Roman numeral and alias variants
    expect(isRecognizedEbMagalonaBarangay("Poblacion I")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("Poblacion 1")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("Barangay 1")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("Brgy 1")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("Brgy. 1")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("Pob. 1")).toBe(true);
    expect(normalizeEbMagalonaBarangayName("Poblacion I")).toBe("Poblacion I (Barangay 1)");
    expect(normalizeEbMagalonaBarangayName("Poblacion II")).toBe("Poblacion II (Barangay 2)");
    expect(normalizeEbMagalonaBarangayName("Poblacion III")).toBe("Poblacion III (Barangay 3)");
    expect(normalizeEbMagalonaBarangayName("Poblacion East")).toBe("Poblacion I (Barangay 1)");
    expect(normalizeEbMagalonaBarangayName("Poblacion West")).toBe("Poblacion II (Barangay 2)");

    // Mojibake sanitization
    expect(normalizeEbMagalonaBarangayName("Santo NiÃ±o")).toBe("Santo Niño");
    expect(normalizeEbMagalonaBarangayName("Santo Nino")).toBe("Santo Niño");
    expect(isRecognizedEbMagalonaBarangay("Santo NiÃ±o")).toBe(true);
    expect(isRecognizedEbMagalonaBarangay("Santo Nino")).toBe(true);

    // resolveLocationBarangay from location string
    expect(resolveLocationBarangay("Consing", null)).toBe("Consing");
    expect(resolveLocationBarangay("Santo NiÃ±o", null)).toBe("Santo Niño");
    expect(resolveLocationBarangay("Poblacion East", null)).toBe("Poblacion I (Barangay 1)");

    // resolveLocationBarangay from formData
    expect(resolveLocationBarangay(null, { barangay: "Poblacion I" })).toBe("Poblacion I (Barangay 1)");
    expect(resolveLocationBarangay(null, { businessBarangay: "Cudangdang" })).toBe("Cudangdang");

    // resolveLocationBarangay from fallback address
    expect(
      resolveLocationBarangay(null, null, "13th St., Cudangdang, EB Magalona, Negros Occidental, Philippines")
    ).toBe("Cudangdang");
    expect(
      resolveLocationBarangay(null, null, "lirio, Canlusong, EB Magalona, Negros Occidental, Philippines")
    ).toBe("Canlusong");
    expect(
      resolveLocationBarangay(null, null, "ZONE 10, Manta-angan, EB Magalona, Negros Occidental, Philippines")
    ).toBe("Manta-angan");
  });

  it("WB-RULES-10 manual business address is preserved when PSGC barangay is unavailable or unselected", () => {
    const manualAddress = "Sitio Tuburan, Mountain Road, Boundary Area";
    const info = normalizeBusinessInfo({
      businessType: "Sole Proprietorship",
      registrationNumber: "DTI-2026-123456",
      tin: "123456789012",
      businessName: "Mountain Vista Cafe",
      tradeName: "Mountain Vista Cafe",
      ownerName: "Maria Santos",
      nationality: "Filipino",
      sex: "Female",
      businessAddress: manualAddress,
      businessStreetAddress: "",
      businessBarangay: "",
      email: "maria@example.com",
      phone: "09171234567",
      mainOfficeAddress: "Sitio Tuburan",
    } as any);

    expect(info.businessAddress).toBe(manualAddress);
    expect(info.businessBarangay).toBe("");
    expect(info.barangay).toBe("");

    // When PSGC barangay is provided, address can be composed or preserved
    const infoWithBarangay = normalizeBusinessInfo({
      businessType: "Sole Proprietorship",
      registrationNumber: "DTI-2026-123456",
      tin: "123456789012",
      businessName: "Town Plaza Bakery",
      tradeName: "Town Plaza Bakery",
      ownerName: "Pedro Penduko",
      nationality: "Filipino",
      sex: "Male",
      businessStreetAddress: "Rizal St",
      businessBarangay: "Alicante",
      email: "pedro@example.com",
      phone: "09171234567",
      mainOfficeAddress: "Rizal St",
    } as any);

    expect(infoWithBarangay.businessAddress).toContain("Alicante");
    expect(infoWithBarangay.businessBarangay).toBe("Alicante");
  });

  it("WB-RULES-11 main office address supports manual text entry for countries/places not in API list", () => {
    // Country without separate state list in API (e.g., Singapore) with manually entered province and city
    const infoWithManualPlaces = normalizeBusinessInfo({
      businessType: "Corporation",
      registrationNumber: "CS2026-12345",
      tin: "123456789012",
      businessName: "Lion City Ventures",
      tradeName: "Lion City",
      ownerName: "Wei Chen",
      nationality: "Singaporean",
      sex: "Male",
      businessAddress: "123 Mabini St, Poblacion, EB Magalona, Negros Occidental, Philippines",
      businessStreetAddress: "123 Mabini St",
      businessBarangay: "Poblacion",
      email: "wei@example.com",
      phone: "09171234567",
      mainOfficeCountry: "Singapore",
      mainOfficeCountryCode: "SG",
      mainOfficeProvince: "Central Region",
      mainOfficeProvinceCode: "", // No API code because manually entered
      mainOfficeCityMunicipality: "Singapore",
      mainOfficeStreetAddress: "10 Bayfront Ave",
      mainOfficeZipCode: "018956",
    } as any);

    expect(infoWithManualPlaces.mainOfficeProvince).toBe("Central Region");
    expect(infoWithManualPlaces.mainOfficeCityMunicipality).toBe("Singapore");
    expect(infoWithManualPlaces.mainOfficeStreetAddress).toBe("10 Bayfront Ave");
    expect(infoWithManualPlaces.mainOfficeAddress).toBe("10 Bayfront Ave, Singapore, Central Region, Singapore");

    // Foreign address without province where country has no provinces
    const infoWithoutProvince = normalizeBusinessInfo({
      businessType: "Corporation",
      registrationNumber: "CS2026-12345",
      tin: "123456789012",
      businessName: "Monaco Holdings",
      tradeName: "Monaco Holdings",
      ownerName: "Jean Dupont",
      nationality: "Monegasque",
      sex: "Male",
      businessAddress: "456 Rizal St, Poblacion, EB Magalona, Negros Occidental, Philippines",
      businessStreetAddress: "456 Rizal St",
      businessBarangay: "Poblacion",
      email: "jean@example.com",
      phone: "09171234567",
      mainOfficeCountry: "Monaco",
      mainOfficeCountryCode: "MC",
      mainOfficeProvince: "",
      mainOfficeProvinceCode: "",
      mainOfficeCityMunicipality: "Monaco",
      mainOfficeStreetAddress: "7 Avenue Princesse Grace",
    } as any);

    expect(infoWithoutProvince.mainOfficeAddress).toBe("7 Avenue Princesse Grace, Monaco, Monaco");
  });

  it("WB-RULES-12 Philippine mobile validation accepts exact 09XXXXXXXXX format (11 digits, numbers only)", () => {
    expect(isValidPhMobile("09171234567")).toBe(true);
    expect(isValidPhMobile("09998765432")).toBe(true);
    expect(isValidPhMobile("09123456789")).toBe(true);
    expect(phMobileFieldError("09171234567")).toBeNull();
    expect(PH_MOBILE_HINT).toBe("Enter valid Philippine Number");
    expect(PH_MOBILE_FORMAT_ERROR).toBe("Enter valid Philippine Number");
  });

  it("WB-RULES-13 Philippine mobile rejects letters, symbols, spaces, incorrect length, and invalid formats", () => {
    // Letters & symbols
    expect(isValidPhMobile("0917abc4567")).toBe(false);
    expect(isValidPhMobile("0917-123-4567")).toBe(false);
    expect(isValidPhMobile("+639171234567")).toBe(false);
    expect(isValidPhMobile("0917 123 4567")).toBe(false);

    // Incorrect length
    expect(isValidPhMobile("0917123456")).toBe(false); // 10 digits
    expect(isValidPhMobile("091712345678")).toBe(false); // 12 digits
    expect(isValidPhMobile("")).toBe(false);
    expect(isValidPhMobile("   ")).toBe(false);

    // Invalid prefix
    expect(isValidPhMobile("08171234567")).toBe(false); // starts with 08
    expect(isValidPhMobile("02171234567")).toBe(false); // landline prefix
    expect(isValidPhMobile("12345678901")).toBe(false); // no 09 prefix

    // Error messages
    expect(phMobileFieldError("0917123456")).toBe("Enter valid Philippine Number");
    expect(phMobileFieldError("08171234567")).toBe("Enter valid Philippine Number");
    expect(phMobileFieldError("abc")).toBe("Enter valid Philippine Number");
  });

  it("WB-RULES-14 sanitizePhMobileInput rejects non-digits, strips spaces/symbols, and caps length at 11 digits", () => {
    expect(sanitizePhMobileInput("0917-123-4567")).toBe("09171234567");
    expect(sanitizePhMobileInput("0917 123 4567")).toBe("09171234567");
    expect(sanitizePhMobileInput("abc0917def1234567xyz")).toBe("09171234567");
    expect(sanitizePhMobileInput("091712345678999")).toBe("09171234567"); // Max 11 digits
    expect(sanitizePhMobileInput("639171234567")).toBe("09171234567"); // 63 prefix normalized
    expect(sanitizePhMobileInput("9171234567")).toBe("09171234567"); // 9 prefix normalized
  });
});


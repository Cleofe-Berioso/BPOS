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
  splitOwnerName,
  optionalIntFromDb,
  parseOptionalIntForDb,
  validateBusinessIdentityFormats,
  isValidCorporationNationality,
  normalizeNationality,
  applyLockedBusinessFields,
  normalizeBusinessInfo,
} from "@/lib/business-rules";

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
    expect(validateRegistrationNumberFormat("Sole Proprietorship", "DTI-2026-123456")).toBe(true);
    expect(validateRegistrationNumberFormat("Sole Proprietorship", "123456789")).toBe(false);
    expect(validateRegistrationNumberFormat("Corporation", "CS2026-12345")).toBe(true);
    expect(validateRegistrationNumberFormat("Corporation", "CN123456789")).toBe(false);
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
});

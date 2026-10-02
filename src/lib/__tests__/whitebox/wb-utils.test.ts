import { describe, expect, it } from "vitest";
import { formatOwnerName, formatPersonName } from "@/lib/person-name";
import { safeApiErrorMessage } from "@/lib/api-errors";
import { getClientIp } from "@/lib/request-client-ip";
import { isAllowedApplicantNextPath } from "@/lib/applicant-profile-setup-next";
import { generateOtp, hashOtp, verifyOtp } from "@/lib/password-reset";
import { isValidLineOfBusiness, LINE_OF_BUSINESS_OPTIONS } from "@/lib/business-options";
import { slugifyFeeCategoryKey, isValidClassificationForOptions, FEE_CATEGORY_OPTIONS } from "@/lib/fee-settings";

describe("WB-UTIL — person name, API errors, IP, OTP, options", () => {
  it("WB-UTIL-01 formatPersonName / formatOwnerName", () => {
    expect(formatPersonName({ firstName: "Juan", middleName: "D", lastName: "Cruz", suffix: "Jr" })).toBe(
      "Juan D Cruz Jr"
    );
    expect(formatPersonName({ fallbackName: "Only Fallback" })).toBe("Only Fallback");
    expect(formatPersonName({})).toBe("");
    expect(
      formatOwnerName({
        ownerFirstName: "Ana",
        ownerLastName: "Reyes",
        ownerName: "ignored when parts exist",
      })
    ).toBe("Ana Reyes");
  });

  it("WB-UTIL-02 safeApiErrorMessage hides details in production mode", () => {
    expect(safeApiErrorMessage(new Error("secret"), "Safe", { forceProduction: true })).toBe("Safe");
    expect(safeApiErrorMessage(new Error("secret"), "Safe", { forceProduction: false })).toBe("secret");
    expect(safeApiErrorMessage("x", "Safe", { forceProduction: false })).toBe("Safe");
    expect(safeApiErrorMessage(new Error("Wrong Format"), "Safe", { forceProduction: true })).toBe(
      "Wrong Format"
    );
    expect(
      safeApiErrorMessage(
        new Error("Transaction API error: expired transaction. The timeout for this transaction was 5000 ms"),
        "Safe",
        { forceProduction: true }
      )
    ).toMatch(/took too long/i);
    expect(
      safeApiErrorMessage(
        new Error("Settlement / Outstanding Amount cannot be negative."),
        "Safe",
        { forceProduction: true }
      )
    ).toBe("Settlement / Outstanding Amount cannot be negative.");
  });

  it("WB-UTIL-03 getClientIp from forwarded headers", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
    const real = new Request("http://localhost", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(getClientIp(real)).toBe("9.9.9.9");
    expect(getClientIp(new Request("http://localhost"))).toBe("unknown");
  });

  it("WB-UTIL-04 isAllowedApplicantNextPath blocks open redirects", () => {
    expect(isAllowedApplicantNextPath("/applicant/dashboard")).toBe(true);
    expect(isAllowedApplicantNextPath("/bplo/dashboard")).toBe(false);
    expect(isAllowedApplicantNextPath("/applicant/profile-picture/setup")).toBe(false);
    expect(isAllowedApplicantNextPath("//evil.com")).toBe(false);
    expect(isAllowedApplicantNextPath("https://evil.com")).toBe(false);
  });

  it("WB-UTIL-05 generateOtp / hashOtp / verifyOtp", async () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    const hashed = await hashOtp(otp);
    expect(hashed).not.toBe(otp);
    expect(await verifyOtp(otp, hashed)).toBe(true);
    expect(await verifyOtp("000000", hashed)).toBe(false);
  }, 15000);

  it("WB-UTIL-06 line of business and fee category helpers", () => {
    expect(LINE_OF_BUSINESS_OPTIONS.length).toBeGreaterThan(5);
    expect(isValidLineOfBusiness("Banks")).toBe(true);
    expect(isValidLineOfBusiness("Not A Line")).toBe(false);
    expect(slugifyFeeCategoryKey("My Fee!")).toBe("CUSTOM_MY_FEE");
    expect(slugifyFeeCategoryKey("")).toBe("CUSTOM_CATEGORY");
    expect(slugifyFeeCategoryKey("CUSTOM_ALREADY")).toBe("CUSTOM_ALREADY");
    const banks = FEE_CATEGORY_OPTIONS.find((o) => o.key === "BANKS");
    expect(banks).toBeDefined();
    expect(isValidClassificationForOptions("BANKS", banks!.classifications[0], FEE_CATEGORY_OPTIONS)).toBe(
      true
    );
    expect(isValidClassificationForOptions("BANKS", "Nope", FEE_CATEGORY_OPTIONS)).toBe(false);
  });
});

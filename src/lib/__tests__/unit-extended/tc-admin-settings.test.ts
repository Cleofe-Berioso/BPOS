/**
 * Objective gaps: IT Administrator BPLO account + system settings actions
 * (outside thesis white-box 96-case count; run via npm run test:unit-extended).
 */
import { describe, expect, it } from "vitest";
import {
  decideDisableUser,
  decideReactivateUser,
  mapUserActiveStatus,
  parseBploProfileNameUpdate,
  parseCreateBploAccountInput,
} from "@/lib/superadmin-user-policies";
import { canSuperAdminResetPassword } from "@/lib/superadmin-password-reset";
import {
  clampNonNegativeNumber,
  parseJitPortalEnabled,
  parseRenewalExtensionCreate,
  parseSystemPenaltySettings,
  renewalExtensionRangesOverlap,
  validateFeeAmount,
} from "@/lib/superadmin-settings-policies";
import { DEFAULT_SYSTEM_FEE_SETTINGS, formatRenewalExtensionPeriod } from "@/lib/fee-settings";
import { buildAutomaticRenewalCharges } from "@/lib/bplo-assessment";

describe("TC-ADMIN — IT Administrator account + settings policies", () => {
  it("TC-ADMIN-BPLO-01 Create BPLO account validation", () => {
    const ok = parseCreateBploAccountInput({
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: "bplo.new@example.com",
      password: "Password1",
      confirmPassword: "Password1",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.email).toBe("bplo.new@example.com");
      expect(ok.value.name).toMatch(/Juan/);
      expect(ok.value.password.length).toBeGreaterThanOrEqual(8);
    }

    expect(parseCreateBploAccountInput({ firstName: "", lastName: "X" }).ok).toBe(false);
    expect(parseCreateBploAccountInput({ firstName: "A", lastName: "B", email: "bad" }).ok).toBe(
      false
    );
    expect(
      parseCreateBploAccountInput({
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        password: "short",
        confirmPassword: "short",
      }).ok
    ).toBe(false);
    expect(
      parseCreateBploAccountInput({
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        password: "Password1",
        confirmPassword: "Password2",
      }).ok
    ).toBe(false);
  });

  it("TC-ADMIN-BPLO-02 Edit/update BPLO account name fields", () => {
    // No dedicated IT Admin edit-BPLO API; BPLO self-profile PATCH is the update path.
    const ok = parseBploProfileNameUpdate({
      firstName: "Maria",
      middleName: "L",
      lastName: "Santos",
      suffix: "",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.firstName).toBe("Maria");
      expect(ok.value.name).toMatch(/Santos/);
    }
    expect(parseBploProfileNameUpdate({ firstName: "", lastName: "Santos" }).ok).toBe(false);
    // Admin password reset explicitly excludes BPLO.
    expect(canSuperAdminResetPassword("BPLO")).toBe(false);
    expect(canSuperAdminResetPassword("JIT")).toBe(true);
  });

  it("TC-ADMIN-BPLO-03 Disable/enable BPLO account policy", () => {
    expect(
      decideDisableUser({
        actorId: "admin-1",
        targetId: "bplo-1",
        targetExists: true,
        targetIsActive: true,
        targetRole: "BPLO",
        activeSuperAdminCount: 1,
      })
    ).toEqual({ action: "disable" });

    expect(
      decideDisableUser({
        actorId: "admin-1",
        targetId: "admin-1",
        targetExists: true,
        targetIsActive: true,
        targetRole: "SUPER_ADMIN",
        activeSuperAdminCount: 2,
      }).action
    ).toBe("reject");

    expect(
      decideDisableUser({
        actorId: "admin-1",
        targetId: "admin-2",
        targetExists: true,
        targetIsActive: true,
        targetRole: "SUPER_ADMIN",
        activeSuperAdminCount: 1,
      }).action
    ).toBe("reject");

    expect(
      decideDisableUser({
        actorId: "admin-1",
        targetId: "bplo-1",
        targetExists: true,
        targetIsActive: false,
        targetRole: "BPLO",
        activeSuperAdminCount: 1,
      })
    ).toEqual({ action: "already_disabled" });

    expect(
      decideReactivateUser({
        targetId: "bplo-1",
        targetExists: true,
        targetIsActive: false,
      })
    ).toEqual({ action: "reactivate" });

    expect(
      decideReactivateUser({
        targetId: "bplo-1",
        targetExists: true,
        targetIsActive: true,
      })
    ).toEqual({ action: "already_active" });

    expect(mapUserActiveStatus(true)).toBe("ACTIVE");
    expect(mapUserActiveStatus(false)).toBe("DISABLED");
  });

  it("TC-ADMIN-FEE-01 Administrator changes fee amount", () => {
    expect(validateFeeAmount(1500)).toEqual({ ok: true, amount: 1500 });
    expect(validateFeeAmount(0).ok).toBe(true);
    expect(validateFeeAmount(-1).ok).toBe(false);
    expect(validateFeeAmount("100").ok).toBe(false);
    expect(clampNonNegativeNumber(-5)).toBe(0);
    expect(clampNonNegativeNumber(250)).toBe(250);
  });

  it("TC-ADMIN-RATE-01 Administrator changes interest / surcharge rates", () => {
    const ok = parseSystemPenaltySettings({
      renewalSurchargePercent: 30,
      monthlyInterestPercent: 3,
      liquorTobaccoAddOnPercent: 25,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.monthlyInterestPercent).toBe(3);
      expect(ok.value.renewalSurchargePercent).toBe(30);
    }

    expect(
      parseSystemPenaltySettings({
        renewalSurchargePercent: -1,
        monthlyInterestPercent: 2,
        liquorTobaccoAddOnPercent: 25,
      }).ok
    ).toBe(false);

    expect(
      parseSystemPenaltySettings({
        renewalSurchargePercent: 25,
        monthlyInterestPercent: -0.5,
        liquorTobaccoAddOnPercent: 25,
      }).ok
    ).toBe(false);

    // Saved rates feed assessment math (effect of admin configuration).
    const withCustom = buildAutomaticRenewalCharges(1000, 13, {
      penalties: { renewalSurchargePercent: 30, monthlyInterestPercent: 3 },
    });
    const withDefault = buildAutomaticRenewalCharges(1000, 13, {
      penalties: {
        renewalSurchargePercent: DEFAULT_SYSTEM_FEE_SETTINGS.renewalSurchargePercent,
        monthlyInterestPercent: DEFAULT_SYSTEM_FEE_SETTINGS.monthlyInterestPercent,
      },
    });
    expect(withCustom.surcharge).toBe(300);
    expect(withDefault.surcharge).toBe(250);
    expect(withCustom.interest).toBeGreaterThan(withDefault.interest);
  });

  it("TC-ADMIN-CFG-01 Administrator saves system configuration", () => {
    const penalties = parseSystemPenaltySettings({
      renewalSurchargePercent: 25,
      monthlyInterestPercent: 2,
      liquorTobaccoAddOnPercent: 25,
      powerDistributionFixedFee: 10000,
      privatePortFixedFee: 50000,
    });
    expect(penalties.ok).toBe(true);

    expect(parseJitPortalEnabled(true)).toEqual({ ok: true, value: true });
    expect(parseJitPortalEnabled(false)).toEqual({ ok: true, value: false });
    expect(parseJitPortalEnabled("yes").ok).toBe(false);

    const extension = parseRenewalExtensionCreate({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      isActive: true,
      waiveSurcharge: true,
      waiveInterest: false,
    });
    expect(extension.ok).toBe(true);

    expect(
      parseRenewalExtensionCreate({
        startDate: "2026-02-01",
        endDate: "2026-01-01",
        isActive: true,
        waiveSurcharge: false,
        waiveInterest: false,
      }).ok
    ).toBe(false);

    expect(
      renewalExtensionRangesOverlap(
        new Date("2026-01-01"),
        new Date("2026-01-15"),
        new Date("2026-01-10"),
        new Date("2026-01-20")
      )
    ).toBe(true);
    expect(
      renewalExtensionRangesOverlap(
        new Date("2026-01-01"),
        new Date("2026-01-10"),
        new Date("2026-01-11"),
        new Date("2026-01-20")
      )
    ).toBe(false);

    expect(formatRenewalExtensionPeriod("2026-01-01", "2026-01-31")).toMatch(/2026/);
  });
});

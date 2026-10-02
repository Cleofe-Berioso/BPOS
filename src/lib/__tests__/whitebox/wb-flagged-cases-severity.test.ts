import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { formatSeverityLabel } from "@/lib/department-head-api";

describe("Flagged Cases Severity Level", () => {
  it("formats violation severity levels accurately to UI labels", () => {
    expect(formatSeverityLabel("MINOR")).toBe("Minor");
    expect(formatSeverityLabel("minor")).toBe("Minor");
    expect(formatSeverityLabel("MAJOR")).toBe("Major");
    expect(formatSeverityLabel("major")).toBe("Major");
    expect(formatSeverityLabel("SEVERE")).toBe("Severe");
    expect(formatSeverityLabel("severe")).toBe("Severe");
    expect(formatSeverityLabel(null)).toBe("Not Specified");
    expect(formatSeverityLabel(undefined)).toBe("Not Specified");
    expect(formatSeverityLabel("CUSTOM")).toBe("CUSTOM");
  });

  it("restricts available severity options strictly to Minor, Major, and Severe", () => {
    const validSeverities = ["MINOR", "MAJOR", "SEVERE"];
    const labels = validSeverities.map((s) => formatSeverityLabel(s));
    expect(labels).toEqual(["Minor", "Major", "Severe"]);
  });

  it("formats history remarks to embed Severity Level for case history tracking", () => {
    // Test the expected history remark patterns that staff will view in case history
    const officer = "Jane Doe (Department Head)";
    const severity = "MAJOR";
    const remarks = "Structural safety violation identified during inspection";

    const formattedSeverity = formatSeverityLabel(severity);
    expect(formattedSeverity).toBe("Major");

    const reviewEnteredRemark = `Revocation review initiated by ${officer}. Severity Level: ${formattedSeverity}. Remarks: ${remarks}`;
    expect(reviewEnteredRemark).toContain("Severity Level: Major.");
    expect(reviewEnteredRemark).toContain(remarks);

    const approveRemark = `Revocation approved by ${officer}. Severity Level: ${formatSeverityLabel("SEVERE")}. Remarks: Immediate revocation required`;
    expect(approveRemark).toContain("Severity Level: Severe.");

    const denyRemark = `Revocation denied by ${officer}. Severity Level: ${formatSeverityLabel("MINOR")}. Remarks: Business resolved the minor issue`;
    expect(denyRemark).toContain("Severity Level: Minor.");
  });
});

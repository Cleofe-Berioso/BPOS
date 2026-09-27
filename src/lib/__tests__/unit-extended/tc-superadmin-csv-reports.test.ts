import { describe, expect, it, vi, beforeEach } from "vitest";
import { escapeCsvCell, buildCsvContent, type CsvColumn } from "@/lib/csv-export";
import { NextRequest } from "next/server";

// Mock dependencies for the export route
vi.mock("@/lib/superadmin-api", () => ({
  requireSuperAdminSession: vi.fn(),
}));

vi.mock("@/lib/superadmin-data", () => ({
  getApplicationSummaryReport: vi.fn().mockResolvedValue([
    {
      applicationNumber: "APP-2026-0001",
      applicationType: "NEW",
      businessName: "Saravia Bakery",
      ownerName: "Juan Dela Cruz",
      status: "Released",
      submittedDate: "2026-01-15",
      lastUpdated: "2026-01-20",
    },
  ]),
  getBusinessRegistryReport: vi.fn().mockResolvedValue([
    {
      businessName: "Magalona Trading",
      tradeName: "Magalona Store",
      owner: "Maria Santos",
      businessType: "Sole Proprietorship",
      lineOfBusiness: "Retail / Groceries",
      address: "Brgy. Poblacion 1, Burgos St.",
      permitNumber: "BP-2026-00045",
      permitValidity: "2026-12-31",
      businessStatus: "Active",
    },
  ]),
  getBusinessClosureReport: vi.fn().mockResolvedValue([
    {
      applicationNumber: "APP-2026-0099",
      businessName: "Old Hardware",
      owner: "Pedro Cruz",
      closureStatus: "Released",
      closureCertStatus: "Released",
      submittedDate: "2026-02-01",
      releasedDate: "2026-02-15",
    },
  ]),
  getInspectionComplianceReport: vi.fn().mockResolvedValue([
    {
      date: "2026-02-10",
      businessName: "Green Cafe",
      applicationNumber: "APP-2026-0010",
      inspector: "Engr. Reyes",
      complianceStatus: "Compliant",
      inspectionStatus: "Verified Compliant",
      decidedBy: "BPLO Chief",
      decidedAt: "2026-02-12",
    },
  ]),
  getAuditTrailReport: vi.fn().mockResolvedValue([
    {
      date: "2026-02-15",
      actorName: "Admin User",
      actorRole: "IT Administrator",
      action: "UPDATE_STATUS",
      module: "APPLICATION",
      entityType: "BusinessApplication",
      description: "Application moved to Released",
      beforeStatus: "FOR_RELEASE",
      afterStatus: "RELEASED",
    },
  ]),
  getSmsDeliveryReport: vi.fn().mockResolvedValue([
    {
      date: "2026-02-16",
      applicationNumber: "APP-2026-0001",
      maskedPhone: "0917****123",
      provider: "Semaphore",
      status: "SENT",
      messageBody: "Your Business Permit APP-2026-0001 is now ready for release.",
    },
  ]),
  getMonthlySummaryReport: vi.fn().mockResolvedValue({
    periodLabel: "January 2026",
    month: 1,
    year: 2026,
    applicationsSubmitted: 25,
    applicationsByType: [
      { type: "NEW", count: 15 },
      { type: "RENEWAL", count: 8 },
      { type: "CLOSURE", count: 2 },
    ],
    applicationsByStatus: [
      { status: "Released", count: 18 },
      { status: "Under Review", count: 7 },
    ],
    releasedApplications: 18,
    returnedForCorrection: 1,
    rejectedApplications: 0,
    permitsReleased: 18,
    closureCertificatesReleased: 2,
    closuresSubmitted: 2,
    inspectionsConducted: 20,
    compliantInspections: 19,
    nonCompliantInspections: 1,
    pendingInspectionReview: 0,
    bploActions: 54,
    auditEvents: 120,
    newUsers: 14,
    verifiedPayments: 18,
    verifiedPaymentAmount: 185000,
    smsSent: 36,
    smsFailed: 0,
  }),
}));

vi.mock("@/lib/business-location", () => ({
  listSuperAdminBusinessLocations: vi.fn().mockResolvedValue([
    {
      locationId: "loc-1",
      businessRecordId: "rec-1",
      applicationId: "app-1",
      applicantName: "Juan Dela Cruz",
      tradeName: "Saravia Bakery",
      businessName: "Saravia Bakery",
      businessType: "Sole Proprietorship",
      ownerName: "Juan Dela Cruz",
      businessCategory: "FOOD_HOSPITALITY",
      businessCategoryLabel: "Food & Hospitality",
      businessCategoryColor: "amber",
      applicationNumber: "APP-2026-0001",
      applicationType: "NEW",
      submittedAt: "2026-01-15T08:00:00Z",
      permitOrCertificateNumber: "BP-2026-0001",
      permitValidUntil: "2026-12-31",
      lineOfBusiness: "Bakery",
      applicationStatus: "RELEASED",
      bploRemarks: null,
      documents: [],
      latitude: 10.852,
      longitude: 122.985,
      address: "Burgos St.",
      barangay: "Poblacion 1",
      status: "VERIFIED",
      remarks: null,
      updatedAt: "2026-01-20T10:00:00Z",
    },
  ]),
}));

describe("TC-CSV-REPORTS — CSV Utilities and Export Route", () => {
  describe("1. escapeCsvCell", () => {
    it("returns empty string for null and undefined", () => {
      expect(escapeCsvCell(null)).toBe("");
      expect(escapeCsvCell(undefined)).toBe("");
    });

    it("formats booleans as Yes or No", () => {
      expect(escapeCsvCell(true)).toBe("Yes");
      expect(escapeCsvCell(false)).toBe("No");
    });

    it("leaves plain alphanumeric strings unquoted", () => {
      expect(escapeCsvCell("APP-2026-0001")).toBe("APP-2026-0001");
      expect(escapeCsvCell("Juan Dela Cruz")).toBe("Juan Dela Cruz");
    });

    it("escapes and quotes strings containing commas, quotes, or newlines", () => {
      expect(escapeCsvCell("Brgy. 1, Burgos St.")).toBe('"Brgy. 1, Burgos St."');
      expect(escapeCsvCell('Said "Hello" to user')).toBe('"Said ""Hello"" to user"');
      expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    });

    it("formats Date objects cleanly", () => {
      const d = new Date("2026-01-15T08:30:00.000Z");
      expect(escapeCsvCell(d)).toBe("2026-01-15 08:30:00");
    });
  });

  describe("2. buildCsvContent", () => {
    interface TestRow {
      code: string;
      name: string;
      amount: number;
    }

    const testColumns: CsvColumn<TestRow>[] = [
      { key: "code", label: "Item Code" },
      { key: "name", label: "Item Name" },
      { key: "amount", label: "Amount Paid", format: (v) => `₱${v}` },
    ];

    const testRows: TestRow[] = [
      { code: "A1", name: "Permit, New", amount: 1500 },
      { code: "A2", name: 'Special "Fire" Fee', amount: 500 },
    ];

    it("starts with UTF-8 BOM byte marker for Excel compatibility", () => {
      const csv = buildCsvContent(testColumns, testRows);
      expect(csv.startsWith("\uFEFF")).toBe(true);
    });

    it("includes report headers and rows formatted according to RFC 4180", () => {
      const csv = buildCsvContent(testColumns, testRows, {
        reportTitle: "Test Report",
        generatedBy: "Admin",
      });

      expect(csv).toContain('"# REPORT: Test Report"');
      expect(csv).toContain('"# GENERATED BY: Admin"');
      expect(csv).toContain("Item Code,Item Name,Amount Paid");
      expect(csv).toContain('A1,"Permit, New",₱1500');
      expect(csv).toContain('A2,"Special ""Fire"" Fee",₱500');
    });
  });

  describe("3. GET /api/superadmin/reports/export endpoint", () => {
    let GET: (req: NextRequest) => Promise<Response>;
    let requireSuperAdminSession: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const apiAuth = await import("@/lib/superadmin-api");
      requireSuperAdminSession = apiAuth.requireSuperAdminSession as unknown as ReturnType<typeof vi.fn>;
      const routeModule = await import("@/app/api/superadmin/reports/export/route");
      GET = routeModule.GET;
    });

    it("rejects unauthorized access when not authenticated as superadmin", async () => {
      requireSuperAdminSession.mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=applications");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Unauthorized");
    });

    it("exports Application Summary CSV with proper headers and data", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=applications");
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(res.headers.get("Content-Disposition")).toContain("ebpls-application-summary-");

      const buffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      // UTF-8 BOM bytes are 0xEF, 0xBB, 0xBF
      expect(uint8[0]).toBe(0xef);
      expect(uint8[1]).toBe(0xbb);
      expect(uint8[2]).toBe(0xbf);

      const text = new TextDecoder("utf-8").decode(uint8);
      expect(text).toContain("Application Number,Business Name,Application Type,Current Status");
      expect(text).toContain("APP-2026-0001,Saravia Bakery");
    });

    it("exports Business Registry Masterlist CSV", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=business-registry");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Business Name,Trade Name,Owner Name,Business Organization Type");
      expect(text).toContain("Magalona Trading,Magalona Store,Maria Santos");
    });

    it("exports Monthly Executive Summary multi-section CSV", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=monthly-summary&month=1&year=2026");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("=== SECTION 1: KEY PERFORMANCE INDICATORS ===");
      expect(text).toContain("=== SECTION 2: APPLICATION WORKLOAD BY TYPE ===");
      expect(text).toContain("=== SECTION 3: APPLICATIONS BY STAGE / STATUS ===");
      expect(text).toContain('"Total Applications Submitted",25');
      expect(text).toContain('"Business Permits Released",18');
    });

    it("exports Business Closure CSV", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=closures");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Closure Application Number,Business Name,Owner Name");
      expect(text).toContain("APP-2026-0099,Old Hardware");
    });

    it("exports Inspection Compliance CSV", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=inspections");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Inspection Date,Business Name,Application Number,Assigned JIT Inspector");
      expect(text).toContain("Green Cafe,APP-2026-0010,Engr. Reyes,Compliant");
    });

    it("exports System Audit Trail CSV", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=audit-trail");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Date & Time,Actor / User,Actor Role,Action Taken,System Module");
      expect(text).toContain("Admin User,IT Administrator,UPDATE_STATUS,APPLICATION");
    });

    it("exports SMS Delivery Log CSV", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=sms");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Date & Time,Application Number,Recipient Phone (Masked)");
      expect(text).toContain("0917****123,Semaphore,SENT");
    });

    it("exports Business GIS Locations CSV", async () => {
      requireSuperAdminSession.mockResolvedValueOnce({
        user: { id: "u-super", name: "Super Admin", role: "SUPER_ADMIN" },
      });

      const req = new NextRequest("http://localhost/api/superadmin/reports/export?reportType=business-locations");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Business Name,Trade Name,Application Number,Applicant Name,Barangay");
      expect(text).toContain("Saravia Bakery,Saravia Bakery,APP-2026-0001,Juan Dela Cruz,Poblacion 1");
    });
  });
});

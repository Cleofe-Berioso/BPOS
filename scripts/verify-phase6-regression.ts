import "./ebpls-env";
import { getJitMapMarkerStatus } from "../src/lib/jit-inspections";
import { listBploBusinessMapLocations, listJitBusinessMapLocations } from "../src/lib/business-location";
import { normalizeBusinessInfo, calculateAgeFromBirthDate } from "../src/lib/business-rules";
import { saveApplicantApplication, SubmitValidationError, DuplicateBusinessIdentityError } from "../src/lib/applications";
import {
  EB_MAGALONA_CITY,
  EB_MAGALONA_COUNTRY,
  EB_MAGALONA_COUNTRY_CODE,
  EB_MAGALONA_PROVINCE,
} from "../src/lib/address-options";
import type { BusinessInfo, SaveApplicationInput } from "../src/lib/applicant-types";
import { prisma } from "../src/lib/prisma";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function randomDigits(length: number): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out.slice(0, length);
}

function buildBaseBusinessInfo(overrides: Partial<BusinessInfo> = {}): BusinessInfo {
  const birthDate = "1991-06-15";
  return normalizeBusinessInfo({
    businessType: "Sole Proprietorship",
    registrationNumber: `DTI-2026-${randomDigits(6)}`,
    paymentFrequency: "ANNUAL",
    tin: randomDigits(9),
    businessName: "Phase 6 Regression Business",
    tradeName: "Phase 6 Trade",
    ownerName: "Phase Six Tester",
    ownerFirstName: "Phase",
    ownerMiddleName: "Six",
    ownerSurname: "Tester",
    sex: "Male",
    nationality: "Filipino",
    email: "applicant@example.com",
    phone: "+639123456789",
    country: EB_MAGALONA_COUNTRY,
    countryCode: EB_MAGALONA_COUNTRY_CODE,
    province: EB_MAGALONA_PROVINCE,
    provinceCode: "",
    cityMunicipality: EB_MAGALONA_CITY,
    streetAddress: "Purok 7",
    barangay: "Barangay 1 (Pob.)",
    mainOfficeCountry: EB_MAGALONA_COUNTRY,
    mainOfficeCountryCode: EB_MAGALONA_COUNTRY_CODE,
    mainOfficeProvince: EB_MAGALONA_PROVINCE,
    mainOfficeCityMunicipality: EB_MAGALONA_CITY,
    mainOfficeBarangay: "Barangay 1 (Pob.)",
    mainOfficeStreetAddress: "Purok 7",
    mainOfficeAddress: "Purok 7, Barangay 1 (Pob.), Enrique B. Magalona, Negros Occidental",
    businessAddress: "Purok 7, Barangay 1 (Pob.), Enrique B. Magalona, Negros Occidental",
    businessLatitude: 10.8786,
    businessLongitude: 122.9789,
    sameAsMainOffice: true,
    businessArea: "120",
    totalFloorArea: "180",
    totalEmployees: "10",
    maleEmployees: "6",
    femaleEmployees: "4",
    employeesWithinMunicipality: "8",
    deliveryVehicles: "1",
    propertyOwnership: "Owned",
    taxDeclarationNumber: "TD-P6-001",
    propertyIdentificationNumber: "PIN-P6-001",
    hasTaxIncentives: "NO",
    taxIncentives: "None",
    businessActivity: "Retail",
    lineOfBusiness: "Wholesalers / Retailers / Dealers / Distributors",
    assetSize: "1500000",
    isMarket: false,
    isAgriculture: false,
    isLiquorOrTobacco: false,
    birthDate,
    ownerAge: String(calculateAgeFromBirthDate(birthDate)),
    capitalInvestment: "200000",
    grossProfit: "350000",
    ...overrides,
  });
}

async function expectSubmitValidationFailure(
  applicantId: string,
  input: SaveApplicationInput,
  expectedFieldContains: string
) {
  const beforeCount = await prisma.businessApplication.count({ where: { applicantId } });

  try {
    await saveApplicantApplication(applicantId, input, []);
    throw new Error(`Expected SubmitValidationError for ${expectedFieldContains}, but submit succeeded.`);
  } catch (error) {
    assert(error instanceof SubmitValidationError, `Expected SubmitValidationError, got: ${String(error)}`);
    const hasExpectedField = error.detail.missingFields.some((field) =>
      field.toLowerCase().includes(expectedFieldContains.toLowerCase())
    );
    assert(
      hasExpectedField,
      `Missing field check did not include '${expectedFieldContains}'. Actual: ${error.detail.missingFields.join(", ")}`
    );
  }

  const afterCount = await prisma.businessApplication.count({ where: { applicantId } });
  assert(beforeCount === afterCount, "Invalid submit should not create or persist new application records.");
}

async function verifyMarkerMappingAndFiltering() {
  assert(getJitMapMarkerStatus(null) === "UNINSPECTED", "Marker mapping failed for null status.");
  assert(
    getJitMapMarkerStatus("DH_VERIFICATION_PENDING") === "PENDING_INSPECTION",
    "Marker mapping failed for DH_VERIFICATION_PENDING."
  );
  assert(
    getJitMapMarkerStatus("VERIFIED_COMPLIANT") === "COMPLIANT",
    "Marker mapping failed for VERIFIED_COMPLIANT."
  );
  assert(getJitMapMarkerStatus("REVOKED") === "REVOKED", "Marker mapping failed for REVOKED.");

  const jitRows = await listJitBusinessMapLocations();
  const bploRows = await listBploBusinessMapLocations();

  const hasGray = jitRows.some((row) => row.businessName === "[DEBUG-SEED] P6 Map Gray Business" && row.mapMarkerStatus === "UNINSPECTED");
  const hasYellow = jitRows.some(
    (row) => row.businessName === "[DEBUG-SEED] P6 Map Yellow Business" && row.mapMarkerStatus === "PENDING_INSPECTION"
  );
  const hasGreen = jitRows.some((row) => row.businessName === "[DEBUG-SEED] P6 Map Green Business" && row.mapMarkerStatus === "COMPLIANT");
  const hasRed = jitRows.some((row) => row.businessName === "[DEBUG-SEED] P6 Map Red Unsettled Business" && row.mapMarkerStatus === "REVOKED");
  const hidesSettledRed = !jitRows.some((row) => row.businessName === "[DEBUG-SEED] P6 Map Red Settled Business");

  assert(hasGray, "JIT map is missing gray marker scenario.");
  assert(hasYellow, "JIT map is missing yellow marker scenario.");
  assert(hasGreen, "JIT map is missing green marker scenario.");
  assert(hasRed, "JIT map is missing red marker scenario.");
  assert(hidesSettledRed, "JIT map should hide settled revoked businesses.");

  const bploHasRevokedUnsettled = bploRows.some(
    (row) => row.businessName === "[DEBUG-SEED] P6 Map Red Unsettled Business"
  );
  const bploHasRevokedSettled = bploRows.some(
    (row) => row.businessName === "[DEBUG-SEED] P6 Map Red Settled Business"
  );

  assert(!bploHasRevokedUnsettled, "BPLO map should not include revoked unsettled business.");
  assert(!bploHasRevokedSettled, "BPLO map should not include revoked settled business.");
}

async function verifyDisabledJitSeed() {
  const disabledJit = await prisma.user.findUnique({
    where: { email: "jit-disabled@example.com" },
    select: { userId: true, role: true, isActive: true },
  });

  assert(disabledJit, "Disabled JIT seed account does not exist.");
  assert(disabledJit.role === "JIT", "Disabled JIT seed account has wrong role.");
  assert(disabledJit.isActive === false, "Disabled JIT seed account should be inactive.");
}

async function verifyPhase3AndPhase4SubmitValidation() {
  const applicant = await prisma.user.findUnique({
    where: { email: "applicant@example.com" },
    select: { userId: true },
  });

  const jit = await prisma.user.findUnique({
    where: { email: "jit@example.com" },
    select: { userId: true },
  });

  assert(applicant?.userId, "Applicant seed user is missing.");
  assert(jit?.userId, "JIT seed user is missing.");

  const normalized = normalizeBusinessInfo(
    buildBaseBusinessInfo({
      country: "Japan",
      countryCode: "JP",
      province: "Tokyo",
      cityMunicipality: "Minato",
      streetAddress: "Somewhere",
    })
  );

  assert(normalized.country === EB_MAGALONA_COUNTRY, "Normalization should enforce fixed country.");
  assert(normalized.countryCode === EB_MAGALONA_COUNTRY_CODE, "Normalization should enforce fixed countryCode.");
  assert(normalized.province === EB_MAGALONA_PROVINCE, "Normalization should enforce fixed province.");
  assert(normalized.cityMunicipality === EB_MAGALONA_CITY, "Normalization should enforce fixed city/municipality.");

  await expectSubmitValidationFailure(
    applicant.userId,
    {
      applicationType: "NEW",
      mode: "SUBMIT",
      formData: buildBaseBusinessInfo({ capitalInvestment: "" }),
      documents: [],
    },
    "capitalInvestment"
  );

  await expectSubmitValidationFailure(
    applicant.userId,
    {
      applicationType: "NEW",
      mode: "SUBMIT",
      formData: buildBaseBusinessInfo({ birthDate: "2015-05-10" }),
      documents: [],
    },
    "birthDate"
  );

  const renewalReg = `DTI-2026-${randomDigits(6)}`;
  const renewalTin = randomDigits(9);

  const renewalBase = await prisma.businessRecord.create({
    data: {
      applicantId: applicant.userId,
      businessType: "Sole Proprietorship",
      registrationNumber: renewalReg,
      tin: BigInt(renewalTin),
      businessName: `[P6-VERIFY] Renewal Gross Profit ${renewalReg}`,
      tradeName: `[P6-VERIFY] Trade ${renewalReg}`,
      ownerName: "Phase Six Renewal",
      nationality: "Filipino",
      email: "applicant@example.com",
      phone: "+639123456789",
      mainOfficeAddress: "Purok 9, Barangay 1 (Pob.), Enrique B. Magalona, Negros Occidental",
      businessAddress: "Purok 9, Barangay 1 (Pob.), Enrique B. Magalona, Negros Occidental",
      sameAsMainOffice: true,
      businessArea: 80,
      totalFloorArea: 120,
      totalEmployees: 5,
      maleEmployees: 3,
      femaleEmployees: 2,
      employeesWithinMunicipality: 4,
      deliveryVehicles: 1,
      propertyOwnership: "Owned",
      taxDeclarationNumber: `TD-${renewalReg}`,
      propertyIdentificationNumber: `PIN-${renewalReg}`,
      taxIncentives: "None",
      businessActivity: "Retail",
      lineOfBusiness: "Trading",
      assetSize: "800000",
      businessStatus: "ACTIVE",
      location: {
        create: {
          latitude: 10.886,
          longitude: 122.986,
          status: "VERIFIED",
          submittedById: applicant.userId,
          verifiedById: jit.userId,
          remarks: "[P6-VERIFY] Temporary renewal eligibility record",
        },
      },
    },
    select: { businessRecordId: true },
  });

  await expectSubmitValidationFailure(
    applicant.userId,
    {
      applicationType: "RENEWAL",
      mode: "SUBMIT",
      businessRecordId: renewalBase.businessRecordId,
      formData: buildBaseBusinessInfo({
        registrationNumber: renewalReg,
        tin: renewalTin,
        grossProfit: "",
      }),
      documents: [],
    },
    "grossProfit"
  );
}

async function verifyRenewalDuplicateHotfix() {
  // HOTFIX: Renewal must not fail duplicate identity check when historical released
  // applications exist for the same business record with the same reg#/TIN in formData.

  const applicant = await prisma.user.findUnique({
    where: { email: "applicant@example.com" },
    select: { userId: true },
  });

  const jit = await prisma.user.findUnique({
    where: { email: "jit@example.com" },
    select: { userId: true },
  });

  assert(applicant?.userId, "Applicant seed user is missing.");
  assert(jit?.userId, "JIT seed user is missing.");

  // Create a fresh business record with unique reg#/TIN each run.
  const hotfixReg = `DTI-2026-${randomDigits(6)}`;
  const hotfixTin = randomDigits(9);

  const hotfixRecord = await prisma.businessRecord.create({
    data: {
      applicantId: applicant.userId,
      businessType: "Sole Proprietorship",
      registrationNumber: hotfixReg,
      tin: BigInt(hotfixTin),
      businessName: `[P6-HOTFIX] Dup Identity Check ${hotfixReg}`,
      tradeName: `[P6-HOTFIX] Trade`,
      ownerName: "Phase Six Hotfix",
      nationality: "Filipino",
      email: "applicant@example.com",
      phone: "+639123456789",
      mainOfficeAddress: "Purok 6, Barangay 2 (Pob.), Enrique B. Magalona, Negros Occidental",
      businessAddress: "Purok 6, Barangay 2 (Pob.), Enrique B. Magalona, Negros Occidental",
      sameAsMainOffice: true,
      businessArea: 60,
      totalFloorArea: 90,
      totalEmployees: 2,
      maleEmployees: 1,
      femaleEmployees: 1,
      employeesWithinMunicipality: 2,
      deliveryVehicles: 0,
      propertyOwnership: "Owned",
      taxDeclarationNumber: `TD-HF-${hotfixReg}`,
      propertyIdentificationNumber: `PIN-HF-${hotfixReg}`,
      taxIncentives: "None",
      businessActivity: "Retail",
      lineOfBusiness: "Trading",
      assetSize: "300000",
      businessStatus: "ACTIVE",
      location: {
        create: {
          latitude: 10.884,
          longitude: 122.981,
          status: "VERIFIED",
          submittedById: applicant.userId,
          verifiedById: jit.userId,
          remarks: "[P6-HOTFIX] Renewal duplicate hotfix eligibility",
        },
      },
    },
    select: { businessRecordId: true },
  });

  // Simulate a historical RELEASED application for this exact business (same reg#/TIN in formData).
  // This is the record that would incorrectly trigger DuplicateBusinessIdentityError before the fix.
  await prisma.businessApplication.create({
    data: {
      applicantId: applicant.userId,
      businessRecordId: hotfixRecord.businessRecordId,
      applicationNumber: `EBPLS-HOTFIX-${randomDigits(6)}`,
      applicationType: "NEW",
      status: "RELEASED",
      formData: buildBaseBusinessInfo({ registrationNumber: hotfixReg, tin: hotfixTin }) as unknown as never,
      submittedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    },
  });

  // RENEWAL with same reg#/TIN as the historical released app must NOT throw
  // DuplicateBusinessIdentityError. Post-fix, the duplicate check skips apps belonging
  // to hotfixRecord.id and the renewal should fail on the missing grossProfit field instead.
  await expectSubmitValidationFailure(
    applicant.userId,
    {
      applicationType: "RENEWAL",
      mode: "SUBMIT",
      businessRecordId: hotfixRecord.businessRecordId,
      formData: buildBaseBusinessInfo({
        registrationNumber: hotfixReg,
        tin: hotfixTin,
        grossProfit: "", // missing — should fail here, NOT on duplicate identity
      }),
      documents: [],
    },
    "grossProfit"
  );

  // NEW application with the same hotfixReg must STILL be blocked (BusinessRecord check).
  // This confirms NEW duplicate protection is fully intact after the fix.
  const beforeBlockCount = await prisma.businessApplication.count({ where: { applicantId: applicant.userId } });
  try {
    await saveApplicantApplication(
      applicant.userId,
      {
        applicationType: "NEW",
        mode: "SUBMIT",
        formData: buildBaseBusinessInfo({
          registrationNumber: hotfixReg,
          tin: `${randomDigits(8)}0`, // different TIN, same reg# — BusinessRecord check must still fire
        }),
        documents: [],
      },
      []
    );
    throw new Error("Expected DuplicateBusinessIdentityError for NEW with taken registrationNumber, but submit succeeded.");
  } catch (error) {
    assert(
      error instanceof DuplicateBusinessIdentityError,
      `Expected DuplicateBusinessIdentityError for NEW with taken reg#, got: ${String(error)}`
    );
  }
  const afterBlockCount = await prisma.businessApplication.count({ where: { applicantId: applicant.userId } });
  assert(beforeBlockCount === afterBlockCount, "Blocked NEW submission must not persist any record.");
}

async function main() {
  console.log("Running Phase 6 regression verifier...");

  await verifyMarkerMappingAndFiltering();
  console.log("  ✓ Marker mapping and map filtering checks passed");

  await verifyDisabledJitSeed();
  console.log("  ✓ Disabled JIT seed checks passed");

  await verifyPhase3AndPhase4SubmitValidation();
  console.log("  ✓ Phase 3/4 submit validation and no-persistence checks passed");

  await verifyRenewalDuplicateHotfix();
  console.log("  ✓ Renewal duplicate identity hotfix checks passed");

  console.log("Phase 6 regression verifier passed.");
}

main()
  .catch((error) => {
    console.error("Phase 6 regression verifier failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

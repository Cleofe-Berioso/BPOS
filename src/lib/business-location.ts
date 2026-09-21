import { prisma } from "@/lib/prisma";
import { mapDbStatusToUi } from "@/lib/application-mappers";
import { buildPaginatedResult, resolvePagination, type PaginatedResult } from "@/lib/pagination";
import {
  inferMapBusinessCategory,
  MAP_CATEGORY_META,
  type MapBusinessCategory,
} from "@/lib/business-map-categories";
import { getJitMapMarkerStatus, getJitMapMarkerColor } from "@/lib/jit-inspections";
import { getJitInspectionCycleStartedAt } from "@/lib/jit-settings";
import { EB_MAGALONA_BOUNDS, EB_MAGALONA_CENTER, isWithinEbMagalona } from "@/lib/eb-magalona";
import { normalizeEbMagalonaBarangayName } from "@/lib/business-rules";

type ApplicationType = "NEW" | "RENEWAL" | "CLOSURE";
type BusinessMapApplicationType = "NEW" | "RENEWAL";
type LocationStatus = "PENDING" | "VERIFIED" | "NEEDS_CORRECTION";

export interface ApplicantBusinessLocationRow {
  businessRecordId: string;
  businessName: string;
  registrationNumber: string;
  applicationNumber: string;
  applicationType: ApplicationType;
  permitOrCertificateNumber: string | null;
  permitValidUntil: string | null;
  location: {
    id: string;
    latitude: number;
    longitude: number;
    address: string | null;
    barangay: string | null;
    status: LocationStatus;
    remarks: string | null;
    updatedAt: string;
  } | null;
  canEditLocation: boolean;
}

export interface BusinessLocationMapRow {
  locationId: string;
  businessRecordId: string;
  applicationId: string;
  applicantName: string;
  tradeName: string | null;
  businessName: string;
  businessType: string | null;
  ownerName: string;
  businessCategory: MapBusinessCategory;
  businessCategoryLabel: string;
  businessCategoryColor: string;
  applicationNumber: string;
  applicationType: BusinessMapApplicationType;
  submittedAt: string | null;
  permitOrCertificateNumber: string | null;
  permitValidUntil: string | null;
  lineOfBusiness: string | null;
  applicationStatus: string;
  bploRemarks: string | null;
  documents: Array<{
    id: string;
    documentName: string;
    fileName: string;
    uploadedAt: string;
  }>;
  latitude: number;
  longitude: number;
  address: string | null;
  barangay: string | null;
  status: LocationStatus;
  remarks: string | null;
  updatedAt: string;
}

export interface BusinessMapFilters {
  type?: "ALL" | BusinessMapApplicationType;
  owner?: string;
  category?: "ALL" | MapBusinessCategory;
  search?: string;
  barangay?: string;
}

const ACTIVE_PERMITTED_MAP_APP_STATUSES = ["RELEASED"] as const;

function readFormString(formData: unknown, key: string): string | null {
  if (typeof formData !== "object" || !formData) return null;
  const value = (formData as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveLocationBarangay(
  locationBarangay: string | null | undefined,
  formData: unknown
): string | null {
  const fromLocation = locationBarangay?.trim() || null;
  if (fromLocation) return fromLocation;
  return (
    readFormString(formData, "barangay") ??
    readFormString(formData, "businessBarangay") ??
    null
  );
}

function barangayMatchesFilter(candidate: string | null | undefined, filter: string): boolean {
  const rawFilter = filter.trim();
  if (!rawFilter) return true;
  const rawCandidate = candidate?.trim() ?? "";
  if (!rawCandidate) return false;

  const canonicalFilter = normalizeEbMagalonaBarangayName(rawFilter).toLowerCase();
  const canonicalCandidate = normalizeEbMagalonaBarangayName(rawCandidate).toLowerCase();
  return (
    canonicalCandidate === canonicalFilter ||
    rawCandidate.toLowerCase() === rawFilter.toLowerCase()
  );
}

function parseCoordinate(input: unknown, kind: "latitude" | "longitude"): number {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) {
    throw new Error(`${kind} must be a valid number`);
  }

  if (kind === "latitude" && (value < -90 || value > 90)) {
    throw new Error("latitude must be between -90 and 90");
  }

  if (kind === "longitude" && (value < -180 || value > 180)) {
    throw new Error("longitude must be between -180 and 180");
  }

  return Math.round(value * 1_000_000) / 1_000_000;
}

function toOptionalTrimmedString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value.length > 0 ? value : null;
}

function isLocationEditable(status: LocationStatus): boolean {
  return status !== "VERIFIED";
}

function toApplicantRow(record: {
  businessRecordId: string;
  businessName: string;
  registrationNumber: string;
  permitExpirationDate: Date | null;
  location: {
    businessLocationId: string;
    latitude: number;
    longitude: number;
    address: string | null;
    barangay: string | null;
    status: LocationStatus;
    remarks: string | null;
    updatedAt: Date;
  } | null;
  releasedApplication: {
    applicationNumber: string;
    applicationType: ApplicationType;
    permitOrCertificateNumber: string | null;
  };
}): ApplicantBusinessLocationRow {
  return {
    businessRecordId: record.businessRecordId,
    businessName: record.businessName,
    registrationNumber: record.registrationNumber,
    applicationNumber: record.releasedApplication.applicationNumber,
    applicationType: record.releasedApplication.applicationType,
    permitOrCertificateNumber: record.releasedApplication.permitOrCertificateNumber,
    permitValidUntil: record.permitExpirationDate ? record.permitExpirationDate.toISOString() : null,
    location: record.location
      ? {
          id: record.location.businessLocationId,
          latitude: record.location.latitude,
          longitude: record.location.longitude,
          address: record.location.address,
          barangay: record.location.barangay,
          status: record.location.status,
          remarks: record.location.remarks,
          updatedAt: record.location.updatedAt.toISOString(),
        }
      : null,
    canEditLocation: record.location ? isLocationEditable(record.location.status) : true,
  };
}

async function resolveLatestReleasedByBusinessRecord(
  businessRecordIds: string[]
): Promise<
  Map<
    string,
    {
      applicationNumber: string;
      applicationType: ApplicationType;
      permitOrCertificateNumber: string | null;
    }
  >
> {
  if (businessRecordIds.length === 0) {
    return new Map();
  }

  const releasedApplications = await prisma.businessApplication.findMany({
    where: {
      status: "RELEASED",
      businessRecordId: {
        in: businessRecordIds,
      },
    },
    select: {
      businessRecordId: true,
      applicationNumber: true,
      applicationType: true,
      updatedAt: true,
      permitIssuance: {
        select: {
          documentNumber: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const byRecord = new Map<
    string,
    {
      applicationNumber: string;
      applicationType: ApplicationType;
      permitOrCertificateNumber: string | null;
    }
  >();

  for (const row of releasedApplications) {
    if (!row.businessRecordId) continue;
    if (byRecord.has(row.businessRecordId)) continue;

    byRecord.set(row.businessRecordId, {
      applicationNumber: row.applicationNumber,
      applicationType: row.applicationType as ApplicationType,
      permitOrCertificateNumber: row.permitIssuance?.documentNumber ?? null,
    });
  }

  return byRecord;
}

export async function listApplicantReleasedBusinessLocations(
  applicantId: string
): Promise<ApplicantBusinessLocationRow[]> {
  const records = await prisma.businessRecord.findMany({
    where: {
      applicantId,
      businessStatus: "ACTIVE",
      applications: {
        some: {
          status: "RELEASED",
        },
      },
    },
    select: {
      businessRecordId: true,
      businessName: true,
      registrationNumber: true,
      permitExpirationDate: true,
      location: {
        select: {
          businessLocationId: true,
          latitude: true,
          longitude: true,
          address: true,
          barangay: true,
          status: true,
          remarks: true,
          updatedAt: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const releasedMeta = await resolveLatestReleasedByBusinessRecord(
    records.map((row: (typeof records)[number]) => row.businessRecordId)
  );

  return records
    .filter((row: (typeof records)[number]) => releasedMeta.has(row.businessRecordId))
    .map((row: (typeof records)[number]) =>
      toApplicantRow({
        ...row,
        location: row.location
          ? {
              ...row.location,
              status: row.location.status as LocationStatus,
            }
          : null,
        releasedApplication: releasedMeta.get(row.businessRecordId) as {
          applicationNumber: string;
          applicationType: ApplicationType;
          permitOrCertificateNumber: string | null;
        },
      })
    );
}

export async function submitApplicantBusinessLocation(
  applicantId: string,
  businessRecordId: string,
  payload: {
    latitude: unknown;
    longitude: unknown;
    address?: unknown;
    barangay?: unknown;
  }
): Promise<ApplicantBusinessLocationRow> {
  const latitude = parseCoordinate(payload.latitude, "latitude");
  const longitude = parseCoordinate(payload.longitude, "longitude");
  const address = toOptionalTrimmedString(payload.address);
  const barangay = toOptionalTrimmedString(payload.barangay);

  if (!address) {
    throw new Error("businessLocationAddress is required");
  }

  const record = await prisma.businessRecord.findFirst({
    where: {
      businessRecordId,
      applicantId,
      applications: {
        some: {
          status: "RELEASED",
        },
      },
    },
    select: {
      businessRecordId: true,
      businessName: true,
      registrationNumber: true,
      location: {
        select: {
          businessLocationId: true,
          status: true,
        },
      },
    },
  });

  if (!record) {
    throw new Error("Released business record not found");
  }

  if (record.location?.status === "VERIFIED") {
    throw new Error("Verified location cannot be edited unless returned for correction");
  }

  await prisma.businessLocation.upsert({
    where: {
      businessRecordId,
    },
    create: {
      businessRecordId,
      latitude,
      longitude,
      address,
      barangay,
      status: "PENDING",
      submittedById: applicantId,
    },
    update: {
      latitude,
      longitude,
      address,
      barangay,
      status: "PENDING",
      submittedById: applicantId,
      verifiedById: null,
      remarks: null,
    },
  });

  const [updated] = await listApplicantReleasedBusinessLocations(applicantId).then((rows) =>
    rows.filter((row: ApplicantBusinessLocationRow) => row.businessRecordId === businessRecordId)
  );

  if (!updated) {
    throw new Error("Unable to load updated location");
  }

  return updated;
}

export async function upsertBusinessLocationForBusinessRecord(
  dbClient: typeof prisma = prisma,
  params: {
    businessRecordId: string;
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    barangay?: string | null;
    submittedById: string;
  }
): Promise<void> {
  const { businessRecordId, latitude, longitude, address, barangay, submittedById } = params;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return;
  }

  if (!isWithinEbMagalona(latitude, longitude)) {
    return;
  }

  await dbClient.businessLocation.upsert({
    where: { businessRecordId },
    create: {
      businessRecordId,
      latitude,
      longitude,
      address: address ?? null,
      barangay: barangay ?? null,
      status: "PENDING",
      submittedById,
    },
    update: {
      latitude,
      longitude,
      address: address ?? null,
      barangay: barangay ?? null,
      status: "PENDING",
      submittedById,
      verifiedById: null,
      remarks: null,
    },
  });
}

export async function listActivePermittedBusinessLocations(
  filters: BusinessMapFilters = {}
): Promise<BusinessLocationMapRow[]> {
  const locations = await prisma.businessLocation.findMany({
    where: {
      businessRecord: {
        businessStatus: "ACTIVE",
        applications: {
          some: {
            status: { in: [...ACTIVE_PERMITTED_MAP_APP_STATUSES] },
            applicationType: { in: ["NEW", "RENEWAL"] },
          },
        },
      },
    },
    select: {
      businessLocationId: true,
      latitude: true,
      longitude: true,
      address: true,
      barangay: true,
      status: true,
      remarks: true,
      updatedAt: true,
      businessRecord: {
        select: {
          businessRecordId: true,
          businessName: true,
          tradeName: true,
          ownerName: true,
          lineOfBusiness: true,
          permitExpirationDate: true,
          applicant: {
            select: {
              name: true,
            },
          },
          applications: {
            where: {
              status: { in: [...ACTIVE_PERMITTED_MAP_APP_STATUSES] },
              applicationType: { in: ["NEW", "RENEWAL"] },
            },
            orderBy: {
              updatedAt: "desc",
            },
            take: 1,
            select: {
              businessApplicationId: true,
              applicationNumber: true,
              applicationType: true,
              status: true,
              submittedAt: true,
              formData: true,
              documents: {
                select: {
                  applicationDocumentId: true,
                  documentName: true,
                  fileName: true,
                  uploadedAt: true,
                },
                orderBy: {
                  uploadedAt: "desc",
                },
              },
              history: {
                where: {
                  actorRole: "BPLO",
                  remarks: {
                    not: null,
                  },
                },
                select: {
                  remarks: true,
                  createdAt: true,
                },
                orderBy: {
                  createdAt: "desc",
                },
                take: 1,
              },
              permitIssuance: {
                select: {
                  documentNumber: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const rows = locations
    .map((location: (typeof locations)[number]) => {
      const latestApplication = location.businessRecord.applications[0];
      if (!latestApplication) return null;

      const lineOfBusiness =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).lineOfBusiness as string | undefined)
          : undefined;

      const businessType =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).businessType as string | undefined)
          : undefined;

      const tradeName =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).tradeName as string | undefined)
          : undefined;

      const ownerNameFromForm =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).ownerName as string | undefined)
          : undefined;

      const category = inferMapBusinessCategory({
        businessType: businessType ?? null,
        lineOfBusiness: (lineOfBusiness ?? location.businessRecord.lineOfBusiness ?? "").trim(),
      });
      const categoryMeta = MAP_CATEGORY_META[category];

      return {
        locationId: location.businessLocationId,
        businessRecordId: location.businessRecord.businessRecordId,
        applicationId: latestApplication.businessApplicationId,
        applicantName: location.businessRecord.applicant?.name ?? "-",
        tradeName: (tradeName ?? location.businessRecord.tradeName ?? null)?.trim() || null,
        businessName: location.businessRecord.businessName,
        businessType: businessType?.trim() || null,
        ownerName: (ownerNameFromForm ?? location.businessRecord.ownerName).trim(),
        businessCategory: category,
        businessCategoryLabel: categoryMeta.label,
        businessCategoryColor: categoryMeta.color,
        applicationNumber: latestApplication.applicationNumber,
        applicationType: latestApplication.applicationType as BusinessMapApplicationType,
        submittedAt: latestApplication.submittedAt ? latestApplication.submittedAt.toISOString() : null,
        permitOrCertificateNumber: latestApplication.permitIssuance?.documentNumber ?? null,
        permitValidUntil: location.businessRecord.permitExpirationDate
          ? location.businessRecord.permitExpirationDate.toISOString()
          : null,
        lineOfBusiness: (lineOfBusiness ?? location.businessRecord.lineOfBusiness ?? null)?.trim() || null,
        applicationStatus: mapDbStatusToUi(latestApplication.status),
        bploRemarks: latestApplication.history[0]?.remarks?.trim() || null,
        documents: latestApplication.documents.map((doc) => ({
          id: doc.applicationDocumentId,
          documentName: doc.documentName,
          fileName: doc.fileName,
          uploadedAt: doc.uploadedAt.toISOString(),
        })),
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        barangay: resolveLocationBarangay(location.barangay, latestApplication.formData),
        status: location.status as LocationStatus,
        remarks: location.remarks,
        updatedAt: location.updatedAt.toISOString(),
      } satisfies BusinessLocationMapRow;
    })
    .filter((row: BusinessLocationMapRow | null): row is BusinessLocationMapRow => Boolean(row));

  let filtered = rows;

  if (filters.type && filters.type !== "ALL") {
    filtered = filtered.filter((row: BusinessLocationMapRow) => row.applicationType === filters.type);
  }

  if (filters.category && filters.category !== "ALL") {
    filtered = filtered.filter((row: BusinessLocationMapRow) => row.businessCategory === filters.category);
  }

  if (filters.owner?.trim()) {
    const owner = filters.owner.trim().toLowerCase();
    filtered = filtered.filter((row: BusinessLocationMapRow) => row.ownerName.toLowerCase().includes(owner));
  }

  if (filters.search?.trim()) {
    const search = filters.search.trim().toLowerCase();
    filtered = filtered.filter(
      (row: BusinessLocationMapRow) =>
        row.businessName.toLowerCase().includes(search) ||
        row.ownerName.toLowerCase().includes(search)
    );
  }

  if (filters.barangay?.trim()) {
    const barangay = filters.barangay.trim();
    filtered = filtered.filter((row: BusinessLocationMapRow) =>
      barangayMatchesFilter(row.barangay, barangay)
    );
  }

  return filtered;
}

export async function listActivePermittedBusinessLocationsPaginated(
  filters: BusinessMapFilters = {},
  pagination?: { page?: number | string; pageSize?: number | string }
): Promise<PaginatedResult<BusinessLocationMapRow>> {
  const { page, pageSize, skip, take } = resolvePagination(pagination);
  const search = filters.search?.trim();
  const barangay = filters.barangay?.trim();

  // Barangay often lives on application formData while BusinessLocation.barangay is null
  // (e.g. auto-created at permit release). Resolve + normalize in memory so filtering
  // still works for unverified / incomplete location rows.
  if (barangay) {
    const matched = await listActivePermittedBusinessLocations(filters);
    const totalCount = matched.length;
    const records = matched.slice(skip, skip + take);
    return buildPaginatedResult(records, totalCount, page, pageSize);
  }

  const businessRecordWhere: Record<string, unknown> = {
    businessStatus: "ACTIVE",
    applications: {
      some: {
        status: { in: [...ACTIVE_PERMITTED_MAP_APP_STATUSES] },
        applicationType: { in: ["NEW", "RENEWAL"] },
      },
    },
  };

  if (search) {
    businessRecordWhere.OR = [
      { businessName: { contains: search, mode: "insensitive" } },
      { tradeName: { contains: search, mode: "insensitive" } },
      { ownerName: { contains: search, mode: "insensitive" } },
      { applicant: { name: { contains: search, mode: "insensitive" } } },
      {
        applications: {
          some: {
            applicationNumber: { contains: search, mode: "insensitive" },
          },
        },
      },
      {
        applications: {
          some: {
            permitIssuance: {
              is: {
                documentNumber: { contains: search, mode: "insensitive" },
              },
            },
          },
        },
      },
    ];
  }

  const where: Record<string, unknown> = {
    businessRecord: businessRecordWhere,
  };

  const [locations, totalCount] = await Promise.all([
    prisma.businessLocation.findMany({
      where,
      select: {
        businessLocationId: true,
        latitude: true,
        longitude: true,
        address: true,
        barangay: true,
        status: true,
        remarks: true,
        updatedAt: true,
        businessRecord: {
          select: {
            businessRecordId: true,
            businessName: true,
            tradeName: true,
            ownerName: true,
            lineOfBusiness: true,
            permitExpirationDate: true,
            applicant: {
              select: {
                name: true,
              },
            },
            applications: {
              where: {
                status: { in: [...ACTIVE_PERMITTED_MAP_APP_STATUSES] },
                applicationType: { in: ["NEW", "RENEWAL"] },
              },
              orderBy: {
                updatedAt: "desc",
              },
              take: 1,
              select: {
                businessApplicationId: true,
                applicationNumber: true,
                applicationType: true,
                status: true,
                submittedAt: true,
                formData: true,
                documents: {
                  select: {
                    applicationDocumentId: true,
                    documentName: true,
                    fileName: true,
                    uploadedAt: true,
                  },
                  orderBy: {
                    uploadedAt: "desc",
                  },
                },
                history: {
                  where: {
                    actorRole: "BPLO",
                    remarks: {
                      not: null,
                    },
                  },
                  select: {
                    remarks: true,
                    createdAt: true,
                  },
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: 1,
                },
                permitIssuance: {
                  select: {
                    documentNumber: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      skip,
      take,
    }),
    prisma.businessLocation.count({ where }),
  ]);

  const rows = locations
    .map((location: (typeof locations)[number]) => {
      const latestApplication = location.businessRecord.applications[0];
      if (!latestApplication) return null;

      const lineOfBusiness =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).lineOfBusiness as string | undefined)
          : undefined;

      const businessType =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).businessType as string | undefined)
          : undefined;

      const tradeName =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).tradeName as string | undefined)
          : undefined;

      const ownerNameFromForm =
        typeof latestApplication.formData === "object" && latestApplication.formData
          ? ((latestApplication.formData as Record<string, unknown>).ownerName as string | undefined)
          : undefined;

      const category = inferMapBusinessCategory({
        businessType: businessType ?? null,
        lineOfBusiness: (lineOfBusiness ?? location.businessRecord.lineOfBusiness ?? "").trim(),
      });
      const categoryMeta = MAP_CATEGORY_META[category];

      return {
        locationId: location.businessLocationId,
        businessRecordId: location.businessRecord.businessRecordId,
        applicationId: latestApplication.businessApplicationId,
        applicantName: location.businessRecord.applicant?.name ?? "-",
        tradeName: (tradeName ?? location.businessRecord.tradeName ?? null)?.trim() || null,
        businessName: location.businessRecord.businessName,
        businessType: businessType?.trim() || null,
        ownerName: (ownerNameFromForm ?? location.businessRecord.ownerName).trim(),
        businessCategory: category,
        businessCategoryLabel: categoryMeta.label,
        businessCategoryColor: categoryMeta.color,
        applicationNumber: latestApplication.applicationNumber,
        applicationType: latestApplication.applicationType as BusinessMapApplicationType,
        submittedAt: latestApplication.submittedAt ? latestApplication.submittedAt.toISOString() : null,
        permitOrCertificateNumber: latestApplication.permitIssuance?.documentNumber ?? null,
        permitValidUntil: location.businessRecord.permitExpirationDate
          ? location.businessRecord.permitExpirationDate.toISOString()
          : null,
        lineOfBusiness: (lineOfBusiness ?? location.businessRecord.lineOfBusiness ?? null)?.trim() || null,
        applicationStatus: mapDbStatusToUi(latestApplication.status),
        bploRemarks: latestApplication.history[0]?.remarks?.trim() || null,
        documents: latestApplication.documents.map((doc) => ({
          id: doc.applicationDocumentId,
          documentName: doc.documentName,
          fileName: doc.fileName,
          uploadedAt: doc.uploadedAt.toISOString(),
        })),
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        barangay: resolveLocationBarangay(location.barangay, latestApplication.formData),
        status: location.status as LocationStatus,
        remarks: location.remarks,
        updatedAt: location.updatedAt.toISOString(),
      } satisfies BusinessLocationMapRow;
    })
    .filter((row: BusinessLocationMapRow | null): row is BusinessLocationMapRow => Boolean(row));

  return buildPaginatedResult(rows, totalCount, page, pageSize);
}

export async function listBploBusinessLocations(
  filters: BusinessMapFilters = {}
): Promise<BusinessLocationMapRow[]> {
  return listActivePermittedBusinessLocations(filters);
}

export interface JitBusinessMapRow extends BusinessLocationMapRow {
  latestInspectionStatus: string | null;
  mapMarkerStatus: "UNINSPECTED" | "PENDING_INSPECTION" | "COMPLIANT" | "REVOKED";
  mapMarkerColor: string;
}

/**
 * Get latest inspection status for a list of business record IDs.
 * Returns only the most recent inspection per business.
 */
async function resolveLatestInspectionsByBusinessRecord(
  businessRecordIds: string[]
): Promise<
  Map<
    string,
    {
      status: string;
      isSettled: boolean;
      complianceCaseStatus: string | null;
      revocationSettledAt: Date | null;
    }
  >
> {
  if (businessRecordIds.length === 0) {
    return new Map();
  }

  const cycleStartedAt = await getJitInspectionCycleStartedAt();

  const inspections = await prisma.inspection.findMany({
    where: {
      businessRecordId: {
        in: businessRecordIds,
      },
      ...(cycleStartedAt ? { createdAt: { gte: cycleStartedAt } } : {}),
    },
    select: {
      businessRecordId: true,
      status: true,
      createdAt: true,
      isSettled: true,
      complianceCaseStatus: true,
      revocationSettledAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const latestByRecord = new Map<
    string,
    {
      status: string;
      createdAt: Date;
      isSettled: boolean;
      complianceCaseStatus: string | null;
      revocationSettledAt: Date | null;
    }
  >();

  for (const inspection of inspections) {
    if (!latestByRecord.has(inspection.businessRecordId)) {
      latestByRecord.set(inspection.businessRecordId, {
        status: inspection.status,
        createdAt: inspection.createdAt,
        isSettled: Boolean(inspection.isSettled),
        complianceCaseStatus: inspection.complianceCaseStatus ?? null,
        revocationSettledAt: inspection.revocationSettledAt,
      });
    }
  }

  return latestByRecord;
}

/**
 * List business locations with JIT inspection status and marker colors.
 * Settled compliance / revocation cases render as green (COMPLIANT).
 */
export async function listJitBusinessMapLocations(
  filters: BusinessMapFilters = {}
): Promise<JitBusinessMapRow[]> {
  const rows = await listActivePermittedBusinessLocations(filters);
  const businessRecordIds = rows.map((row) => row.businessRecordId);

  const inspectionsByRecord = await resolveLatestInspectionsByBusinessRecord(businessRecordIds);

  return rows.map((row) => {
    const inspection = inspectionsByRecord.get(row.businessRecordId);
    const inspectionStatus = inspection?.status ?? null;
    const markerStatus = getJitMapMarkerStatus(inspectionStatus, {
      isSettled: inspection?.isSettled,
      complianceCaseStatus: inspection?.complianceCaseStatus,
      revocationSettledAt: inspection?.revocationSettledAt,
    });
    const markerColor = getJitMapMarkerColor(markerStatus);

    return {
      ...row,
      latestInspectionStatus: inspectionStatus,
      mapMarkerStatus: markerStatus,
      mapMarkerColor: markerColor,
    } satisfies JitBusinessMapRow;
  });
}

/**
 * List business locations for BPLO map (excludes revoked).
 */
export async function listBploBusinessMapLocations(
  filters: BusinessMapFilters = {}
): Promise<BusinessLocationMapRow[]> {
  const rows = await listActivePermittedBusinessLocations(filters);
  const businessRecordIds = rows.map((row) => row.businessRecordId);

  const inspectionsByRecord = await resolveLatestInspectionsByBusinessRecord(businessRecordIds);

  // Filter out revoked businesses
  return rows.filter((row) => {
    const inspection = inspectionsByRecord.get(row.businessRecordId);
    const inspectionStatus = inspection?.status ?? null;
    return inspectionStatus !== "REVOKED";
  });
}

export async function verifyBusinessLocation(
  businessLocationId: string,
  verifierId: string,
  remarks?: unknown
): Promise<BusinessLocationMapRow> {
  const existing = await prisma.businessLocation.findUnique({
    where: {
      businessLocationId,
    },
    select: {
      businessLocationId: true,
      businessRecordId: true,
    },
  });

  if (!existing) {
    throw new Error("Business location not found");
  }

  const hasValidApplication = await prisma.businessRecord.findFirst({
    where: {
      businessRecordId: existing.businessRecordId,
      businessStatus: "ACTIVE",
      applications: {
        some: {
          status: { in: [...ACTIVE_PERMITTED_MAP_APP_STATUSES] },
        },
      },
    },
    select: { businessRecordId: true },
  });

  if (!hasValidApplication) {
    throw new Error("Business location is not associated with a releasable business application");
  }

  await prisma.businessLocation.update({
    where: {
      businessLocationId,
    },
    data: {
      status: "VERIFIED",
      verifiedById: verifierId,
      remarks: toOptionalTrimmedString(remarks),
    },
  });

  const rows = await listBploBusinessLocations();
  const updated = rows.find((row) => row.locationId === businessLocationId);
  if (!updated) {
    throw new Error("Unable to load verified location");
  }

  return updated;
}

export async function returnBusinessLocationForCorrection(
  businessLocationId: string,
  verifierId: string,
  remarks: unknown
): Promise<BusinessLocationMapRow> {
  const correctionRemarks = toOptionalTrimmedString(remarks);
  if (!correctionRemarks) {
    throw new Error("Remarks are required when returning location for correction");
  }

  const existing = await prisma.businessLocation.findUnique({
    where: {
      businessLocationId,
    },
    select: {
      businessLocationId: true,
    },
  });

  if (!existing) {
    throw new Error("Business location not found");
  }

  const hasValidApplication = await prisma.businessLocation.findFirst({
    where: {
      businessLocationId,
      businessRecord: {
        businessStatus: "ACTIVE",
        applications: {
          some: {
            status: { in: [...ACTIVE_PERMITTED_MAP_APP_STATUSES] },
          },
        },
      },
    },
    select: { businessLocationId: true },
  });

  if (!hasValidApplication) {
    throw new Error("Business location is not associated with a releasable business application");
  }

  await prisma.businessLocation.update({
    where: {
      businessLocationId,
    },
    data: {
      status: "NEEDS_CORRECTION",
      verifiedById: verifierId,
      remarks: correctionRemarks,
    },
  });

  const rows = await listBploBusinessLocations();
  const updated = rows.find((row) => row.locationId === businessLocationId);
  if (!updated) {
    throw new Error("Unable to load updated location");
  }

  return updated;
}

export async function listSuperAdminBusinessLocations(): Promise<BusinessLocationMapRow[]> {
  return listBploBusinessLocations();
}

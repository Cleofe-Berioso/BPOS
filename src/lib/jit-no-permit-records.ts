import { prisma } from "@/lib/prisma";
import { buildPaginatedResult, resolvePagination, type PaginatedResult } from "@/lib/pagination";

export interface JitNoPermitRecordRow {
  id: string;
  ticketNumber: string;
  ticketStatus: "OPEN" | "RESOLVED";
  businessName: string;
  personAttended: string;
  lineOfBusiness: string;
  findings: string;
  remarks: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  createdAt: string;
  createdBy: { name: string };
}

export async function listJitNoPermitRecordsPaginated(
  createdById: string,
  pagination?: { page?: number | string; pageSize?: number | string }
): Promise<PaginatedResult<JitNoPermitRecordRow>> {
  const { page, pageSize, skip, take } = resolvePagination(pagination);
  const where = { createdById };

  const [records, totalCount] = await Promise.all([
    prisma.jitNoPermitRecord.findMany({
      where,
      select: {
        jitNoPermitRecordId: true,
        ticketNumber: true,
        ticketStatus: true,
        businessName: true,
        personAttended: true,
        lineOfBusiness: true,
        findings: true,
        remarks: true,
        latitude: true,
        longitude: true,
        address: true,
        createdAt: true,
        createdBy: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.jitNoPermitRecord.count({ where }),
  ]);

  return buildPaginatedResult(
    records.map((record) => ({
      id: record.jitNoPermitRecordId,
      ticketNumber: record.ticketNumber,
      ticketStatus: record.ticketStatus,
      businessName: record.businessName,
      personAttended: record.personAttended,
      lineOfBusiness: record.lineOfBusiness,
      findings: record.findings,
      remarks: record.remarks,
      latitude: record.latitude,
      longitude: record.longitude,
      address: record.address,
      createdAt: record.createdAt.toISOString(),
      createdBy: record.createdBy,
    })),
    totalCount,
    page,
    pageSize
  );
}

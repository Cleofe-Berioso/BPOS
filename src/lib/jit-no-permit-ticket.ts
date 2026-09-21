import { JitNoPermitTicketStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildDefaultFindings,
  DEFAULT_NO_PERMIT_REQUIRED_ACTION,
  NO_PERMIT_NOTICE_TITLE,
  resolveInspectingOfficeLabel,
} from "@/lib/jit-no-permit-ticket-copy";

const TICKET_NUMBER_REGEX = /^NP-(\d{4})-(\d{6})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE_LOCATION_METERS = 50;

export interface CreateJitNoPermitTicketInput {
  businessName: string;
  personAttended: string;
  lineOfBusiness: string;
  remarks?: string | null;
  findings?: string | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  createdById: string;
}

export interface JitNoPermitNoticePrintData {
  noticeTitle: string;
  ticketNumber: string;
  establishmentName: string;
  witness: string;
  locationLabel: string;
  recordedAtLabel: string;
  inspectingOfficeLabel: string;
  inspectingPersonnelLabel: string;
  findings: string;
  requiredAction: string;
}

export interface DuplicateOpenTicketResult {
  id: string;
  ticketNumber: string;
}

export function normalizeBusinessName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeOptionalAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/\s+/g, " ");
}

export function normalizeOptionalEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || !EMAIL_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function normalizeOptionalPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/[\s-]/g, "").trim();
  if (!compact) return null;
  if (/^\+639\d{9}$/.test(compact)) return compact;
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^639\d{9}$/.test(compact)) return `+${compact}`;
  return null;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function isSameLocation(
  candidate: { latitude: number; longitude: number; address: string | null },
  existing: { latitude: number; longitude: number; address: string | null }
): boolean {
  const candidateAddress = normalizeOptionalAddress(candidate.address);
  const existingAddress = normalizeOptionalAddress(existing.address);

  if (candidateAddress && existingAddress && candidateAddress === existingAddress) {
    return true;
  }

  return haversineMeters(candidate.latitude, candidate.longitude, existing.latitude, existing.longitude) <= DUPLICATE_LOCATION_METERS;
}

export async function findDuplicateOpenTicket(
  input: Pick<CreateJitNoPermitTicketInput, "businessName" | "latitude" | "longitude" | "address">
): Promise<DuplicateOpenTicketResult | null> {
  const normalizedName = normalizeBusinessName(input.businessName);

  const openRecords = await prisma.jitNoPermitRecord.findMany({
    where: {
      ticketStatus: JitNoPermitTicketStatus.OPEN,
    },
    select: {
      jitNoPermitRecordId: true,
      ticketNumber: true,
      businessName: true,
      latitude: true,
      longitude: true,
      address: true,
    },
  });

  const duplicate = openRecords.find(
    (record) =>
      normalizeBusinessName(record.businessName) === normalizedName &&
      isSameLocation(
        { latitude: input.latitude, longitude: input.longitude, address: input.address ?? null },
        { latitude: record.latitude, longitude: record.longitude, address: record.address }
      )
  );

  return duplicate ? { id: duplicate.jitNoPermitRecordId, ticketNumber: duplicate.ticketNumber } : null;
}

export async function generateNoPermitTicketNumber(
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `NP-${year}-`;

  const existing = await db.jitNoPermitRecord.findMany({
    where: {
      ticketNumber: { startsWith: prefix },
    },
    select: { ticketNumber: true },
  });

  let maxSeq = 0;
  for (const row of existing) {
    const match = TICKET_NUMBER_REGEX.exec(row.ticketNumber);
    if (match && Number.parseInt(match[1], 10) === year) {
      const seq = Number.parseInt(match[2], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  let nextSeq = maxSeq + 1;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const dup = await db.jitNoPermitRecord.findFirst({
      where: { ticketNumber: candidate },
      select: { jitNoPermitRecordId: true },
    });
    if (!dup) return candidate;
    nextSeq += 1;
  }

  throw new Error("Unable to generate unique no-permit ticket number");
}

function formatLocationLabel(input: {
  address: string | null;
  latitude: number;
  longitude: number;
}): string {
  const coords = `Lat ${input.latitude.toFixed(6)}, Lng ${input.longitude.toFixed(6)}`;
  if (input.address?.trim()) {
    return `${input.address.trim()} (${coords})`;
  }
  return coords;
}

function formatRecordedAtLabel(value: Date): string {
  return value.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildNoPermitNoticePrintData(record: {
  ticketNumber: string;
  businessName: string;
  personAttended: string;
  address: string | null;
  latitude: number;
  longitude: number;
  createdAt: Date;
  inspectingOffice: string | null;
  findings: string;
  requiredAction: string;
  createdBy: { name: string };
}): JitNoPermitNoticePrintData {
  const inspectingOffice = record.inspectingOffice?.trim() || resolveInspectingOfficeLabel();

  return {
    noticeTitle: NO_PERMIT_NOTICE_TITLE,
    ticketNumber: record.ticketNumber,
    establishmentName: record.businessName,
    witness: record.personAttended,
    locationLabel: formatLocationLabel(record),
    recordedAtLabel: formatRecordedAtLabel(record.createdAt),
    inspectingOfficeLabel: inspectingOffice,
    inspectingPersonnelLabel: record.createdBy.name,
    findings: record.findings,
    requiredAction: record.requiredAction,
  };
}

export async function getJitNoPermitNoticePrintAccess(recordId: string, createdById: string) {
  const record = await prisma.jitNoPermitRecord.findFirst({
    where: {
      jitNoPermitRecordId: recordId,
      createdById,
    },
    select: {
      ticketNumber: true,
      businessName: true,
      personAttended: true,
      address: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      inspectingOffice: true,
      findings: true,
      requiredAction: true,
      createdBy: {
        select: { name: true },
      },
    },
  });

  if (!record) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    notice: buildNoPermitNoticePrintData(record),
  };
}

export async function createJitNoPermitTicket(input: CreateJitNoPermitTicketInput) {
  const duplicate = await findDuplicateOpenTicket(input);
  if (duplicate) {
    return {
      ok: false as const,
      reason: "DUPLICATE_OPEN_TICKET" as const,
      duplicate,
    };
  }

  const findings =
    input.findings?.trim() ||
    buildDefaultFindings({ lineOfBusiness: input.lineOfBusiness, remarks: input.remarks });
  const requiredAction = DEFAULT_NO_PERMIT_REQUIRED_ACTION;
  const inspectingOffice = resolveInspectingOfficeLabel();
  const contactPhone = normalizeOptionalPhone(input.contactPhone);
  const contactEmail = normalizeOptionalEmail(input.contactEmail);

  const record = await prisma.$transaction(async (tx) => {
    const ticketNumber = await generateNoPermitTicketNumber(tx);

    return tx.jitNoPermitRecord.create({
      data: {
        ticketNumber,
        ticketStatus: JitNoPermitTicketStatus.OPEN,
        businessName: input.businessName.trim(),
        personAttended: input.personAttended.trim(),
        lineOfBusiness: input.lineOfBusiness.trim(),
        findings,
        requiredAction,
        remarks: input.remarks?.trim() || null,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address?.trim() || null,
        contactPhone,
        contactEmail,
        inspectingOffice,
        createdById: input.createdById,
      },
      select: {
        jitNoPermitRecordId: true,
        ticketNumber: true,
        ticketStatus: true,
        businessName: true,
        personAttended: true,
        lineOfBusiness: true,
        findings: true,
        requiredAction: true,
        remarks: true,
        latitude: true,
        longitude: true,
        address: true,
        contactPhone: true,
        contactEmail: true,
        inspectingOffice: true,
        notificationStatus: true,
        notificationChannel: true,
        notifiedAt: true,
        createdAt: true,
        createdBy: {
          select: { name: true },
        },
      },
    });
  });

  return {
    ok: true as const,
    record,
  };
}

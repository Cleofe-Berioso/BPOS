import type { ApplicationType, BusinessInfo } from "@/lib/applicant-types";

interface RequiredDocumentContext {
  applicationType: ApplicationType;
  formData: BusinessInfo;
}

/**
 * Documents that are shown in the upload UI but are NOT required for submission.
 * A missing optional document must never block or reject an application.
 */
export const OPTIONAL_DOCUMENTS: ReadonlyArray<string> = [];

const NEW_BASE_DOCUMENTS = [
  "Location Plan / Sketch",
  "Zoning Clearance",
  "Sanitary Clearance",
  "Environment Clearance",
  "Engineering Clearance/ Affidavit (Required)",
  "BFP Clearance",
  "Real Property Tax / RPT Clearance",
  "Assessor's Office Clearance",
  "WATER BILL/ Affidavit (Required)",
] as const;

const BUSINESS_TYPE_DOCUMENTS: Record<BusinessInfo["businessType"], string[]> = {
  "Sole Proprietorship": ["DTI Certificate"],
  "One Person Corporation": ["SEC Certificate"],
  Partnership: ["SEC Certificate"],
  Corporation: ["SEC Certificate"],
  Cooperative: ["CDA Certificate"],
};

const OWNERSHIP_DOCUMENTS: Record<BusinessInfo["propertyOwnership"], string[]> = {
  Owned: ["Transfer Certificate of Title OR Tax Declaration (Certified True Copy, 1 copy)"],
  "Not Owned": ["Contract of Lease OR MOA OR Written Consent (Certified True Copy, 1 copy)"],
};

const RENEWAL_BASE_DOCUMENTS = [
  "Audited Financial Statement OR Unaudited AFS if not required by BIR",
  "Sworn Declaration of Gross Sales / Income Tax Return",
  "Sanitary Office Clearance",
  "Environment Office Clearance",
  "Engineering Clearance/ Affidavit (Required)",
  "BFP Clearance",
  "RPT Clearance",
  "Assessor's Office Clearance",
  "WATER BILL/ Affidavit (Required)",
] as const;

const CLOSURE_REQUIRED_DOCUMENTS = [
  "Closure Letter",
  "Barangay Certification",
  "Proof of Ceased Operation",
] as const;

function uniqueDocuments(docs: string[]): string[] {
  return Array.from(new Set(docs));
}

function getConditionalDocuments(formData: BusinessInfo): string[] {
  const conditional: string[] = [];

  if (formData.isMarket) {
    conditional.push("Market Clearance");
  }

  if (formData.isAgriculture) {
    conditional.push("Agriculture Clearance");
  }

  if (formData.hasTaxIncentives === "YES") {
    conditional.push("Tax Incentive Certificate/Proof");
  }

  return conditional;
}

export function resolveRequiredDocuments(context: RequiredDocumentContext): string[] {
  const { applicationType, formData } = context;
  const conditionalDocuments = getConditionalDocuments(formData);

  if (applicationType === "NEW") {
    return uniqueDocuments([
      ...NEW_BASE_DOCUMENTS,
      ...(BUSINESS_TYPE_DOCUMENTS[formData.businessType] ?? []),
      ...(OWNERSHIP_DOCUMENTS[formData.propertyOwnership] ?? []),
      ...conditionalDocuments,
    ]);
  }

  if (applicationType === "RENEWAL") {
    return uniqueDocuments([...RENEWAL_BASE_DOCUMENTS, ...conditionalDocuments]);
  }

  return uniqueDocuments([...CLOSURE_REQUIRED_DOCUMENTS]);
}

/**
 * Returns documents that may be uploaded voluntarily but must not block submission
 * or validation when absent.
 */
export function resolveOptionalDocuments(): string[] {
  return [...OPTIONAL_DOCUMENTS];
}

export function normalizeDocumentName(name: string): string {
  const normalized = name.trim().toLowerCase();

  const aliases: Record<string, string> = {
    "da clearance": "agriculture clearance",
    "fire safety clearance": "bfp clearance",
    "dti registration certificate": "dti certificate",
    "sec registration certificate": "sec certificate",
    "cda registration certificate": "cda certificate",
    "location sketch / plan": "location plan / sketch",
    "rpt clearance": "real property tax / rpt clearance",
    "assessor's clearance": "assessor's office clearance",
    "sworn declaration of gross sales / receipts": "sworn declaration of gross sales / income tax return",
    "financial statement (audited afs or unaudited afs)": "audited financial statement or unaudited afs if not required by bir",
    "sanitary clearance": "sanitary office clearance",
    "environment clearance": "environment office clearance",
    "engineering clearance": "engineering clearance/ affidavit (required)",
    "engineering office clearance": "engineering clearance/ affidavit (required)",
    "engineering clearance/ affidavit": "engineering clearance/ affidavit (required)",
    "engineering clearance/ affidavit (required)": "engineering clearance/ affidavit (required)",
    "water bill": "water bill/ affidavit (required)",
    "water bill clearance": "water bill/ affidavit (required)",
    "water bill/ affidavit": "water bill/ affidavit (required)",
    "water bill/ affidavit (required)": "water bill/ affidavit (required)",
    "proof of property ownership (transfer certificate of title or tax declaration)": "transfer certificate of title or tax declaration (certified true copy, 1 copy)",
    "proof of property use authorization (contract of lease, moa, or written consent)": "contract of lease or moa or written consent (certified true copy, 1 copy)",
  };

  return aliases[normalized] ?? normalized;
}

/**
 * Determines whether a document requirement is a municipal or government clearance.
 * Only clearance documents qualify for an alternative affidavit when the clearance is unavailable.
 */
export function isClearanceDocument(documentName: string): boolean {
  const normalized = normalizeDocumentName(documentName);
  return normalized.includes("clearance");
}

/**
 * Returns the canonical document name for an affidavit uploaded in lieu of a required clearance.
 */
export function getAffidavitDocumentName(clearanceName: string): string {
  return `Affidavit in lieu of ${clearanceName.trim()}`;
}

/**
 * Checks whether a document name represents an affidavit uploaded in lieu of a clearance.
 */
export function isAffidavitDocument(documentName: string): boolean {
  const normalized = documentName.trim().toLowerCase();
  return (
    normalized.startsWith("affidavit in lieu of") ||
    normalized.startsWith("affidavit of undertaking") ||
    (normalized.includes("affidavit") && normalized.includes("clearance"))
  );
}

/**
 * Extracts the target clearance portion from an affidavit document name.
 */
export function extractClearanceFromAffidavitName(affidavitDocName: string): string | null {
  const trimmed = affidavitDocName.trim();
  const lower = trimmed.toLowerCase();
  if (!isAffidavitDocument(trimmed)) return null;

  let target = "";
  if (lower.startsWith("affidavit in lieu of")) {
    target = trimmed.slice("affidavit in lieu of".length).trim();
  } else if (lower.startsWith("affidavit of undertaking")) {
    target = trimmed
      .slice("affidavit of undertaking".length)
      .trim()
      .replace(/^[-:(]\s*/, "")
      .replace(/\)$/, "")
      .trim();
  } else if (lower.startsWith("affidavit")) {
    target = trimmed
      .slice("affidavit".length)
      .trim()
      .replace(/^[-:(]\s*/, "")
      .replace(/\)$/, "")
      .trim();
  } else if (lower.endsWith("affidavit")) {
    target = trimmed.slice(0, trimmed.length - "affidavit".length).trim().replace(/[-:(]\s*$/, "").trim();
  }

  return target.length > 0 ? target : null;
}

/**
 * Checks whether an uploaded document is an affidavit corresponding to a specific clearance.
 */
export function isAffidavitForClearance(candidateDocumentName: string, clearanceName: string): boolean {
  if (!isClearanceDocument(clearanceName)) return false;
  if (!isAffidavitDocument(candidateDocumentName)) return false;

  const canonClearance = normalizeDocumentName(clearanceName);
  const target = extractClearanceFromAffidavitName(candidateDocumentName);
  if (!target) return false;

  return normalizeDocumentName(target) === canonClearance;
}

/**
 * Checks whether a candidate document satisfies a required document requirement.
 * A non-clearance document must match the requirement (directly or via alias).
 * A clearance document can be satisfied by EITHER the clearance itself OR its corresponding affidavit.
 */
export function isDocumentSatisfyingRequirement(
  requiredDocumentName: string,
  candidateDocumentName: string
): boolean {
  if (normalizeDocumentName(requiredDocumentName) === normalizeDocumentName(candidateDocumentName)) {
    return true;
  }

  if (isClearanceDocument(requiredDocumentName)) {
    return isAffidavitForClearance(candidateDocumentName, requiredDocumentName);
  }

  return false;
}

export function findDocumentSatisfyingRequirement<T extends { documentName: string }>(
  requiredDocumentName: string,
  candidates: T[]
): T | undefined {
  return candidates.find((c) => isDocumentSatisfyingRequirement(requiredDocumentName, c.documentName));
}

export function getMissingRequiredDocuments(required: string[], uploaded: string[]): string[] {
  return required.filter(
    (requiredDoc) => !uploaded.some((uploadedDoc) => isDocumentSatisfyingRequirement(requiredDoc, uploadedDoc))
  );
}

const DOCUMENT_DESCRIPTIONS: Record<string, string> = {
  "location plan / sketch":
    "Sketch or plan showing the business location and site layout for zoning and engineering review.",
  "zoning clearance":
    "Certification that the business location complies with local zoning regulations.",
  "sanitary clearance":
    "Health and sanitation clearance from the municipal sanitary office.",
  "sanitary office clearance":
    "Health and sanitation clearance from the municipal sanitary office.",
  "environment clearance":
    "Environmental compliance clearance from the municipal environment office.",
  "environment office clearance":
    "Environmental compliance clearance from the municipal environment office.",
  "engineering clearance":
    "Structural or building-related clearance from the municipal engineering office.",
  "engineering office clearance":
    "Structural or building-related clearance from the municipal engineering office.",
  "engineering clearance/ affidavit (required)":
    "Structural or building-related clearance or affidavit from the municipal engineering office.",
  "bfp clearance":
    "Fire safety inspection clearance from the Bureau of Fire Protection.",
  "real property tax / rpt clearance":
    "Proof of real property tax compliance for the business premises.",
  "rpt clearance":
    "Proof of real property tax compliance for the business premises.",
  "water bill clearance":
    "Proof of water utility account or clearance for the business premises.",
  "water bill/ affidavit (required)":
    "Proof of water utility account, water bill, or affidavit for the business premises.",
  "assessor's office clearance":
    "Property assessment clearance from the municipal assessor's office.",
  "dti certificate":
    "DTI registration certificate for sole proprietorship businesses.",
  "sec certificate":
    "SEC registration certificate for corporations, partnerships, or one person corporations.",
  "cda certificate":
    "CDA registration certificate for cooperative businesses.",
  "transfer certificate of title or tax declaration (certified true copy, 1 copy)":
    "Proof of property ownership through title or tax declaration.",
  "contract of lease or moa or written consent (certified true copy, 1 copy)":
    "Proof of authorization to use the business premises when property is not owned.",
  "market clearance":
    "Clearance for businesses operating inside a public market or market stall.",
  "agriculture clearance":
    "Department of Agriculture clearance for agriculture-related businesses.",
  "tax incentive certificate/proof":
    "Certificate or proof of the government-granted tax incentive declared by the applicant.",
  "audited financial statement or unaudited afs if not required by bir":
    "Latest financial statement required for renewal assessment.",
  "sworn declaration of gross sales / income tax return":
    "Declared gross sales or income tax return for renewal fee computation.",
  "closure letter":
    "Formal letter requesting business closure.",
  "barangay certification":
    "Barangay certification supporting the closure request.",
  "proof of ceased operation":
    "Evidence that business operations have ceased.",
};

export function getDocumentRequirementDescription(documentName: string): string {
  if (isAffidavitDocument(documentName)) {
    const target = extractClearanceFromAffidavitName(documentName);
    return target
      ? `Notarized or signed affidavit executed in lieu of ${target}, submitted as an alternative when the official clearance is not yet available.`
      : "Affidavit of undertaking submitted as an alternative to the required clearance when the official clearance is not yet available.";
  }
  const normalized = normalizeDocumentName(documentName);
  return (
    DOCUMENT_DESCRIPTIONS[normalized] ??
    "Supporting document required for application review. Upload a clear and readable copy."
  );
}


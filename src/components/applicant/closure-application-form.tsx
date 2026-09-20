"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultBusinessInfo } from "@/lib/applicant-mock";
import { FormStepper } from "@/components/applicant/form-stepper";
import { UploadSlot } from "@/components/applicant/upload-slot";
import {
  applicantErrorPanelClass,
  applicantFormControlClass,
  applicantHighlightPanelClass,
  applicantPanelClass,
  applicantSummaryLabelClass,
  applicantSummaryTileClass,
  applicantSummaryValueClass,
} from "@/components/applicant/applicant-ui-styles";
import { getMissingRequiredDocuments, resolveRequiredDocuments } from "@/lib/required-documents";
import {
  buildDocumentMaxSizeError,
  DOCUMENT_FILE_INPUT_ACCEPT,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  validateDocumentFileUpload,
  validateTotalPendingUploadSize,
} from "@/lib/document-upload-rules";
import type {
  ApplicationDocumentInput,
  BusinessInfo,
  PersistMode,
  SaveApplicationInput,
  SubmitValidationErrorDetail,
} from "@/lib/applicant-types";
import { actionButtonStyles } from "@/components/ui/action-button";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InfoBanner } from "@/components/ui/info-banner";
import { SectionCard } from "@/components/ui/section-card";
import {
  getApplicationSubmitButtonLabel,
  getApplicationSubmitSuccessMessage,
  getResubmissionConfirmMessage,
  isReturnedCorrectionResubmission,
} from "@/lib/resubmission-copy";
import { isValidLineOfBusiness } from "@/lib/business-options";
import { useLineOfBusinessOptions } from "@/hooks/use-line-of-business-options";
import { BUSINESS_ACTIVITY_OPTIONS } from "@/lib/business-rules";

const CLOSURE_BUSINESS_ACTIVITY_OPTIONS = [...BUSINESS_ACTIVITY_OPTIONS] as string[];
const BUSINESS_ACTIVITY_OTHER_OPTION = "Others, please specify";

function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveClosureLineOfBusiness(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  return isValidLineOfBusiness(trimmed) ? trimmed : "";
}

function resolveClosureBusinessActivity(value: string | undefined | null): {
  selected: string;
  otherText: string;
} {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { selected: "", otherText: "" };
  }
  if (trimmed.startsWith("Others:")) {
    return {
      selected: BUSINESS_ACTIVITY_OTHER_OPTION,
      otherText: trimmed.slice("Others:".length).trim(),
    };
  }
  if (trimmed === BUSINESS_ACTIVITY_OTHER_OPTION) {
    return { selected: BUSINESS_ACTIVITY_OTHER_OPTION, otherText: "" };
  }
  if (CLOSURE_BUSINESS_ACTIVITY_OPTIONS.includes(trimmed)) {
    return { selected: trimmed, otherText: "" };
  }
  return { selected: BUSINESS_ACTIVITY_OTHER_OPTION, otherText: trimmed };
}

function applyClosureOperationAutofill(
  info: BusinessInfo,
  setters: {
    setClosureLineOfBusiness: (value: string) => void;
    setClosureBusinessActivity: (value: string) => void;
    setClosureBusinessActivityOther: (value: string) => void;
    setClosureLastDateOfOperation: (value: string) => void;
  }
) {
  const line = resolveClosureLineOfBusiness(info.lineOfBusiness);
  if (line) {
    setters.setClosureLineOfBusiness(line);
  }

  const activity = resolveClosureBusinessActivity(info.businessActivity);
  if (activity.selected) {
    setters.setClosureBusinessActivity(activity.selected);
    setters.setClosureBusinessActivityOther(activity.otherText);
  }

  setters.setClosureLastDateOfOperation(todayDateInputValue());
}

const steps = [
  {
    title: "Select Business to Close",
    description: "Choose the registered business record for closure.",
  },
  {
    title: "Upload Requirements",
    description: "Attach closure documents and proof of ceased operations.",
  },
  {
    title: "Review and Submit",
    description: "Confirm the closure package before final validation.",
  },
];

function ReviewStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className={applicantSummaryTileClass}>
      <p className={applicantSummaryLabelClass}>{label}</p>
      <p className={applicantSummaryValueClass}>{value}</p>
      {helper ? <p className="mt-1 ui-caption">{helper}</p> : null}
    </div>
  );
}

function ValidationPanel({
  detail,
  onBack,
}: {
  detail: SubmitValidationErrorDetail;
  onBack?: () => void;
}) {
  return (
    <div className={applicantErrorPanelClass}>
      <p className="font-semibold">Submission requirements still missing</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="ui-caption font-semibold uppercase tracking-wide">
            Missing Fields
          </p>
          <ul className="mt-2 space-y-1">
            {detail.missingFields.length > 0 ? (
              detail.missingFields.map((item) => <li key={item}>• {item}</li>)
            ) : (
              <li>• None</li>
            )}
          </ul>
        </div>
        <div>
          <p className="ui-caption font-semibold uppercase tracking-wide">
            Missing Documents
          </p>
          <ul className="mt-2 space-y-1">
            {detail.missingDocuments.length > 0 ? (
              detail.missingDocuments.map((item) => <li key={item}>• {item}</li>)
            ) : (
              <li>• None</li>
            )}
          </ul>
        </div>
      </div>
      {onBack ? (
        <button type="button" onClick={onBack} className={`${actionButtonStyles("secondary", "sm")} mt-3`}>
          Back
        </button>
      ) : null}
    </div>
  );
}

type ClosureRecord = {
  id: string;
  registrationNumber: string;
  businessName: string;
  hasRevokedPermit?: boolean;
  businessInfo: BusinessInfo;
  closureEligibility: {
    eligible: boolean;
    isComplianceForcedClosure: boolean;
    reasonCode: string | null;
    userFriendlyReason: string | null;
    blockingInspectionId: string | null;
    complianceCaseStatus: string | null;
    nonComplianceType: string | null;
  };
};

type ClosureTypeValue = "RETIREMENT" | "NON_COMPLIANT_RELATED" | "OTHERS" | "";

const CLOSURE_TYPE_OPTIONS: Array<{ value: ClosureTypeValue; label: string }> = [
  { value: "RETIREMENT", label: "Retirement" },
  { value: "NON_COMPLIANT_RELATED", label: "Non-compliant Related" },
  { value: "OTHERS", label: "Others" },
];

function isComplianceForcedClosureRecord(record: ClosureRecord | undefined) {
  return Boolean(record?.closureEligibility.isComplianceForcedClosure);
}

function humanizeClosureEligibilityReason(record: ClosureRecord | undefined): string | null {
  return record?.closureEligibility.userFriendlyReason ?? null;
}

async function parseApiResponseSafely(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 413) {
    return {
      error:
        "The uploaded files exceeded the server limit (4.5 MB on Vercel). Please compress your documents or upload smaller copies.",
    };
  }

  const responseText = await response.text();

  try {
    return responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    return {
      error:
        response.status === 413
          ? "The uploaded files exceeded the server upload limit. Please compress your files."
          : response.status >= 500
            ? `The server encountered an error (HTTP ${response.status}). Please try again later.`
            : "The server returned an unexpected response. Please check your connection or contact support.",
      rawResponse: responseText.slice(0, 300),
    };
  }
}

export function ClosureApplicationForm() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("applicationId");

  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState<string | undefined>(editId ?? undefined);
  const [draftLoading, setDraftLoading] = useState(Boolean(editId));
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [records, setRecords] = useState<
    ClosureRecord[]
  >([]);
  const [selectedBusinessName, setSelectedBusinessName] = useState(defaultBusinessInfo.businessName);
  const [selectedBusinessInfo, setSelectedBusinessInfo] = useState<BusinessInfo>(defaultBusinessInfo);
  const [closureType, setClosureType] = useState<ClosureTypeValue>("");
  const [closureTypeOtherReason, setClosureTypeOtherReason] = useState("");
  const [closureLineOfBusiness, setClosureLineOfBusiness] = useState("");
  const lineOfBusinessOptions = useLineOfBusinessOptions([closureLineOfBusiness]);
  const [closureBusinessActivity, setClosureBusinessActivity] = useState("");
  const [closureBusinessActivityOther, setClosureBusinessActivityOther] = useState("");
  const [closureLastDateOfOperation, setClosureLastDateOfOperation] = useState("");

  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, ApplicationDocumentInput>>({});
  const [pendingDocuments, setPendingDocuments] = useState<Record<string, File>>({});
  const [pendingDocumentPreviews, setPendingDocumentPreviews] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationDetail, setValidationDetail] = useState<SubmitValidationErrorDetail | null>(null);
  const [existingApplicationAccess, setExistingApplicationAccess] = useState<{
    canEdit: boolean;
    status: string;
  } | null>(null);

  const isResubmission = isReturnedCorrectionResubmission({
    editId,
    applicationStatus: existingApplicationAccess?.status,
  });

  const requiredDocs = useMemo(
    () =>
      resolveRequiredDocuments({
        applicationType: "CLOSURE",
        formData: selectedBusinessInfo,
      }),
    [selectedBusinessInfo]
  );

  const uploadedRequiredCount = requiredDocs.filter((doc) => uploadedDocuments[doc]).length;
  const selectedRecord = records.find((item) => item.id === selectedBusinessId);
  const isComplianceForcedClosure = isComplianceForcedClosureRecord(selectedRecord);
  const selectedBusinessIdRef = useRef(selectedBusinessId);
  const pendingDocumentPreviewsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    pendingDocumentPreviewsRef.current = pendingDocumentPreviews;
  }, [pendingDocumentPreviews]);

  useEffect(() => {
    return () => {
      for (const previewUrl of Object.values(pendingDocumentPreviewsRef.current)) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    selectedBusinessIdRef.current = selectedBusinessId;
  }, [selectedBusinessId]);

  useEffect(() => {
    if (!isComplianceForcedClosure) return;
    if (closureType === "NON_COMPLIANT_RELATED") return;

    setClosureType("NON_COMPLIANT_RELATED");
    setClosureTypeOtherReason("");
  }, [closureType, isComplianceForcedClosure]);

  // Fill empty operation fields from the selected business once records are available.
  useEffect(() => {
    if (!selectedBusinessId || records.length === 0) return;
    const selected = records.find((item) => item.id === selectedBusinessId);
    if (!selected) return;

    if (!closureLineOfBusiness) {
      const line = resolveClosureLineOfBusiness(selected.businessInfo.lineOfBusiness);
      if (line) setClosureLineOfBusiness(line);
    }

    if (!closureBusinessActivity) {
      const activity = resolveClosureBusinessActivity(selected.businessInfo.businessActivity);
      if (activity.selected) {
        setClosureBusinessActivity(activity.selected);
        setClosureBusinessActivityOther(activity.otherText);
      }
    }

    if (!closureLastDateOfOperation) {
      setClosureLastDateOfOperation(todayDateInputValue());
    }
  }, [
    selectedBusinessId,
    records,
    closureLineOfBusiness,
    closureBusinessActivity,
    closureLastDateOfOperation,
  ]);

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      const response = await fetch("/api/applicant/business-records?applicationType=CLOSURE", { cache: "no-store" });
      const data = (await parseApiResponseSafely(response)) as {
        records?: ClosureRecord[];
        complianceForcedRecords?: ClosureRecord[];
      };

      if (!active || !response.ok || !data.records) return;

      setRecords(data.records);
      // When editing a draft, business selection comes from the saved application — do not auto-pick.
      if (editId) return;

      if (data.records[0] && !selectedBusinessIdRef.current) {
        selectedBusinessIdRef.current = data.records[0].id;
        setSelectedBusinessId(data.records[0].id);
        setSelectedBusinessName(data.records[0].businessName);
        const nextInfo = {
          ...defaultBusinessInfo,
          ...data.records[0].businessInfo,
          paymentFrequency: data.records[0].businessInfo.paymentFrequency ?? "ANNUAL",
        };
        setSelectedBusinessInfo(nextInfo);
        applyClosureOperationAutofill(nextInfo, {
          setClosureLineOfBusiness,
          setClosureBusinessActivity,
          setClosureBusinessActivityOther,
          setClosureLastDateOfOperation,
        });
        if (data.records[0].closureEligibility.isComplianceForcedClosure) {
          setClosureType("NON_COMPLIANT_RELATED");
          setClosureTypeOtherReason("");
        }
      }
    }

    void loadRecords();
    return () => {
      active = false;
    };
  }, [editId]);

  useEffect(() => {
    let active = true;

    async function loadExistingApplication() {
      if (!editId) {
        setDraftLoading(false);
        return;
      }
      setDraftLoading(true);

      const response = await fetch(`/api/applicant/applications/${editId}`, { cache: "no-store" });
      const data = (await parseApiResponseSafely(response)) as {
        application?: {
          id: string;
          status: string;
          canEdit: boolean;
          businessRecordId?: string;
          formData: BusinessInfo;
          closureType?: ClosureTypeValue;
          closureTypeOtherReason?: string | null;
          documents: ApplicationDocumentInput[];
        };
      };

      if (!active || !response.ok || !data.application) {
        setDraftLoading(false);
        return;
      }

      setApplicationId(data.application.id);
      setExistingApplicationAccess({
        canEdit: Boolean(data.application.canEdit),
        status: data.application.status,
      });
      setSelectedBusinessInfo({
        ...defaultBusinessInfo,
        ...data.application.formData,
        paymentFrequency: data.application.formData.paymentFrequency ?? "ANNUAL",
      });
      setSelectedBusinessName(data.application.formData.businessName);
      setClosureType(data.application.closureType ?? "");
      setClosureTypeOtherReason(data.application.closureTypeOtherReason ?? "");
      // Restore closure operation fields from saved formData; fill gaps from business record / today.
      const savedFormData = data.application.formData as unknown as Record<string, string | undefined>;
      const savedLine = (savedFormData.closureLineOfBusiness ?? "").trim();
      const savedActivityRaw = (savedFormData.closureBusinessActivity ?? "").trim();
      const savedLastDate = (savedFormData.closureLastDateOfOperation ?? "").trim();
      const restoredActivity = resolveClosureBusinessActivity(savedActivityRaw);

      const lineFromRecord = resolveClosureLineOfBusiness(data.application.formData.lineOfBusiness);
      const activityFromRecord = resolveClosureBusinessActivity(data.application.formData.businessActivity);

      setClosureLineOfBusiness(savedLine || lineFromRecord);
      if (savedActivityRaw) {
        setClosureBusinessActivity(restoredActivity.selected);
        setClosureBusinessActivityOther(restoredActivity.otherText);
      } else if (activityFromRecord.selected) {
        setClosureBusinessActivity(activityFromRecord.selected);
        setClosureBusinessActivityOther(activityFromRecord.otherText);
      } else {
        setClosureBusinessActivity("");
        setClosureBusinessActivityOther("");
      }
      setClosureLastDateOfOperation(savedLastDate || todayDateInputValue());
      if (data.application.businessRecordId) {
        selectedBusinessIdRef.current = data.application.businessRecordId;
        setSelectedBusinessId(data.application.businessRecordId);
      }
      setUploadedDocuments(
        data.application.documents.reduce<Record<string, ApplicationDocumentInput>>((acc, doc) => {
          acc[doc.documentName] = doc;
          return acc;
        }, {})
      );
      setPendingDocuments({});
      setPendingDocumentPreviews({});
      setDraftLoading(false);
    }

    void loadExistingApplication();
    return () => {
      active = false;
    };
  }, [editId]);

  if (editId && draftLoading) {
    return (
      <SectionCard title="Loading saved draft" description="Restoring your closure draft values.">
        <LoadingState message="Loading draft…" compact />
      </SectionCard>
    );
  }

  function next() {
    if (step === 0 && !selectedBusinessId) {
      setStatusMessage({ kind: "error", text: "Select an existing business record before proceeding." });
      return;
    }

    if (step === 0) {
      if (!closureType) {
        setStatusMessage({ kind: "error", text: "Closure type is required." });
        return;
      }

      if (closureType === "OTHERS" && !closureTypeOtherReason.trim()) {
        setStatusMessage({ kind: "error", text: "Please specify the closure reason for Others." });
        return;
      }

      if (isComplianceForcedClosure && closureType !== "NON_COMPLIANT_RELATED") {
        setStatusMessage({ kind: "error", text: "This business requires non-compliant related closure processing." });
        return;
      }
    }

    if (step === 1 && requiredDocs.length > 0 && uploadedRequiredCount < requiredDocs.length) {
      setStatusMessage({
        kind: "error",
        text: "Upload all required closure documents before moving to review.",
      });
      return;
    }

    setStatusMessage(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function handleFinalSubmit() {
    if (isResubmission && !window.confirm(getResubmissionConfirmMessage("CLOSURE"))) {
      return;
    }
    void persist("SUBMIT");
  }

  async function persist(mode: PersistMode) {
    setSubmitting(true);
    setStatusMessage(null);
    setValidationDetail(null);

    if (mode === "SUBMIT") {
      if (!closureType) {
        setStatusMessage({ kind: "error", text: "Closure type is required." });
        setSubmitting(false);
        return null;
      }

      if (closureType === "OTHERS" && !closureTypeOtherReason.trim()) {
        setStatusMessage({ kind: "error", text: "Please specify the closure reason for Others." });
        setSubmitting(false);
        return null;
      }

      if (isComplianceForcedClosure && closureType !== "NON_COMPLIANT_RELATED") {
        setStatusMessage({ kind: "error", text: "This business requires non-compliant related closure processing." });
        setSubmitting(false);
        return null;
      }

      const missingDocuments = getMissingRequiredDocuments(requiredDocs, [
        ...Object.values(uploadedDocuments).map((doc) => doc.documentName),
        ...Object.keys(pendingDocuments),
      ]);

      if (missingDocuments.length > 0) {
        setStep(1);
        setValidationDetail({ missingFields: [], missingDocuments });
        setStatusMessage({
          kind: "error",
          text: "Upload all required closure documents before submitting.",
        });
        setSubmitting(false);
        return null;
      }
    }

    const selected = records.find((item) => item.id === selectedBusinessId);
    const resolvedActivity =
      closureBusinessActivity === "Others, please specify"
        ? closureBusinessActivityOther.trim()
          ? `Others: ${closureBusinessActivityOther.trim()}`
          : ""
        : closureBusinessActivity;
    const closureOperationData = {
      closureLineOfBusiness: closureLineOfBusiness.trim() || undefined,
      closureBusinessActivity: resolvedActivity || undefined,
      closureLastDateOfOperation: closureLastDateOfOperation.trim() || undefined,
    };
    const payload: SaveApplicationInput = {
      applicationId,
      applicationType: "CLOSURE",
      businessRecordId: selectedBusinessId || undefined,
      closureType: closureType || undefined,
      closureTypeOtherReason: closureTypeOtherReason.trim() || undefined,
      formData: { ...(selected?.businessInfo ?? selectedBusinessInfo), ...closureOperationData },
      documents: Object.values(uploadedDocuments),
      mode,
    };

    const hasPendingFiles = Object.keys(pendingDocuments).length > 0;
    if (mode === "SUBMIT" && hasPendingFiles) {
      const totalSizeError = validateTotalPendingUploadSize(Object.values(pendingDocuments));
      if (totalSizeError) {
        setStatusMessage({
          kind: "error",
          text: totalSizeError,
        });
        setSubmitting(false);
        return null;
      }
    }

    const draftTargetUrl = applicationId ? `/api/applicant/applications/${applicationId}` : "/api/applicant/applications";
    const draftTargetMethod = applicationId ? "PATCH" : "POST";
    const saveUrl = mode === "SUBMIT" ? "/api/applicant/applications" : draftTargetUrl;
    const saveMethod = mode === "SUBMIT" ? "POST" : draftTargetMethod;

    const response = hasPendingFiles
      ? await (async () => {
          const formData = new FormData();
          formData.append("payload", JSON.stringify(payload));
          for (const [documentName, file] of Object.entries(pendingDocuments)) {
            formData.append("documentNames", documentName);
            formData.append("documentFiles", file, file.name);
          }

          return fetch(saveUrl, {
            method: saveMethod,
            body: formData,
          });
        })()
      : await fetch(saveUrl, {
          method: saveMethod,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const data = (await parseApiResponseSafely(response)) as {
      application?: { id: string; applicationNumber: string; status: string };
      error?: string;
      detail?: SubmitValidationErrorDetail;
      rawResponse?: string;
    };
    setSubmitting(false);

    if (!response.ok || !data.application) {
      const detail =
        typeof data.rawResponse === "string" && data.rawResponse.length > 0
          ? ` (${data.rawResponse})`
          : "";
      setStatusMessage({
        kind: "error",
        text:
          data.error ??
          `Unable to save closure application (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).${detail}`,
      });
      if (data.detail) setValidationDetail(data.detail);
      return null;
    }

    setApplicationId(data.application.id);

    if (mode === "SUBMIT") {
      for (const previewUrl of Object.values(pendingDocumentPreviews)) {
        URL.revokeObjectURL(previewUrl);
      }
      setPendingDocuments({});
      setPendingDocumentPreviews({});

      setStatusMessage({
        kind: "success",
        text: getApplicationSubmitSuccessMessage("CLOSURE", isResubmission, data.application.applicationNumber),
      });
      return data.application.id;
    }

    if (hasPendingFiles || Object.keys(uploadedDocuments).length > 0) {
      try {
        const docsResponse = await fetch(`/api/applicant/applications/${data.application.id}/documents`, {
          cache: "no-store",
        });
        const docsData = (await parseApiResponseSafely(docsResponse)) as {
          documents?: Array<{
            id?: string;
            documentName: string;
            fileName: string;
            mimeType?: string;
            sizeBytes?: number;
            uploadedAt?: string;
            validationStatus?: string;
            validationRemarks?: string | null;
          }>;
        };
        if (docsResponse.ok && Array.isArray(docsData.documents)) {
          setUploadedDocuments(
            docsData.documents.reduce<Record<string, ApplicationDocumentInput>>((acc, doc) => {
              acc[doc.documentName] = doc as ApplicationDocumentInput;
              return acc;
            }, {})
          );
        }
      } catch {
        // Keep local metadata if refresh fails; files are already persisted server-side.
      }
    }

    for (const previewUrl of Object.values(pendingDocumentPreviews)) {
      URL.revokeObjectURL(previewUrl);
    }
    setPendingDocuments({});
    setPendingDocumentPreviews({});
    setStatusMessage({
      kind: "success",
      text: `Closure draft ${data.application.applicationNumber} saved successfully. Uploaded documents are kept with this draft.`,
    });
    return data.application.id;
  }

  async function handleDocumentUpload(documentName: string, file: File | null) {
    if (!file) return;

    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      setStatusMessage({ kind: "error", text: buildDocumentMaxSizeError(file.name) });
      return;
    }

    const fileValidationError = validateDocumentFileUpload(file);
    if (fileValidationError) {
      setStatusMessage({ kind: "error", text: fileValidationError });
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    const previousPreviewUrl = pendingDocumentPreviews[documentName];
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    setUploadedDocuments((current) => ({
      ...current,
      [documentName]: {
        documentName,
        fileName: file.name,
      },
    }));
    setPendingDocuments((current) => ({
      ...current,
      [documentName]: file,
    }));
    setPendingDocumentPreviews((current) => ({
      ...current,
      [documentName]: nextPreviewUrl,
    }));
  }

  async function handleDocumentDelete(documentName: string) {
    const doc = uploadedDocuments[documentName];
    const hasSavedDocument = Boolean(doc?.id && applicationId);

    if (!hasSavedDocument) {
      const previewUrl = pendingDocumentPreviews[documentName];
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setUploadedDocuments((current) => {
        const nextState = { ...current };
        delete nextState[documentName];
        return nextState;
      });
      setPendingDocuments((current) => {
        const nextState = { ...current };
        delete nextState[documentName];
        return nextState;
      });
      setPendingDocumentPreviews((current) => {
        const nextState = { ...current };
        delete nextState[documentName];
        return nextState;
      });
      return;
    }

    setSubmitting(true);
    const response = await fetch(`/api/applicant/applications/${applicationId}/documents/${doc.id}`, {
      method: "DELETE",
    });
    setSubmitting(false);

    if (!response.ok) return;

    setUploadedDocuments((current) => {
      const nextState = { ...current };
      delete nextState[documentName];
      return nextState;
    });
    setPendingDocuments((current) => {
      const nextState = { ...current };
      delete nextState[documentName];
      return nextState;
    });
    setPendingDocumentPreviews((current) => {
      const nextState = { ...current };
      delete nextState[documentName];
      return nextState;
    });
    setStatusMessage({
      kind: "success",
      text: `${documentName} removed.`,
    });
  }

  return (
    <div className="ui-page-stack">
      <FormStepper steps={steps} currentStep={step} />

      {statusMessage ? (
        <InfoBanner
          title={statusMessage.kind === "success" ? "Closure update" : "Closure issue"}
          description={statusMessage.text}
          variant={statusMessage.kind === "success" ? "success" : "danger"}
        />
      ) : null}

      {step === 0 ? (
        <SectionCard
          title="Select Business to Close"
          description="Closure starts from an existing registered business record so the correct business history is preserved."
        >
          {records.length === 0 ? (
            <EmptyState
              title="No records available yet"
              description="No action is required right now. This closure form will populate once you have an existing business record."
            />
          ) : (
            <div className="space-y-4">
              <FormField
                label="Existing Business Record"
                hint="Choose the registered business record that will be closed."
                required
              >
                <select
                  className={applicantFormControlClass}
                  value={selectedBusinessId}
                  disabled={records.length === 0}
                  onChange={(event) => {
                    const selectedId = event.target.value;
                    selectedBusinessIdRef.current = selectedId;
                    setSelectedBusinessId(selectedId);
                    const selected = records.find((item) => item.id === selectedId);
                    if (selected) {
                      setSelectedBusinessName(selected.businessName);
                      const nextInfo = {
                        ...defaultBusinessInfo,
                        ...selected.businessInfo,
                        paymentFrequency: selected.businessInfo.paymentFrequency ?? "ANNUAL",
                      };
                      setSelectedBusinessInfo(nextInfo);
                      applyClosureOperationAutofill(nextInfo, {
                        setClosureLineOfBusiness,
                        setClosureBusinessActivity,
                        setClosureBusinessActivityOther,
                        setClosureLastDateOfOperation,
                      });
                      if (selected.closureEligibility.isComplianceForcedClosure) {
                        setClosureType("NON_COMPLIANT_RELATED");
                        setClosureTypeOtherReason("");
                      } else {
                        setClosureType("");
                        setClosureTypeOtherReason("");
                      }
                    }
                  }}
                >
                  {records.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.businessName} ({business.registrationNumber})
                      {business.hasRevokedPermit ? " — Revoked permit" : ""}
                    </option>
                  ))}
                </select>
              </FormField>

              {selectedRecord?.hasRevokedPermit ? (
                <InfoBanner
                  title="Revoked permit — closure still required"
                  description="This business permit was revoked and cannot be renewed. You may still file a closure application to complete the business closing process."
                  variant="warning"
                />
              ) : null}

              <FormField
                label="Closure Type"
                hint={
                  isComplianceForcedClosure
                    ? "This business has a compliance-related restriction and must complete closure processing."
                    : "Select the closure type that best matches this filing."
                }
                required
              >
                <select
                  className={applicantFormControlClass}
                  value={closureType}
                  disabled={isComplianceForcedClosure}
                  onChange={(event) => setClosureType(event.target.value as ClosureTypeValue)}
                >
                  <option value="">Select closure type</option>
                  {CLOSURE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {isComplianceForcedClosure ? (
                  <p className="mt-2 text-xs font-medium text-[var(--warning)]">
                    This business requires closure processing because of a compliance-related restriction.
                  </p>
                ) : null}
              </FormField>

              {closureType === "OTHERS" ? (
                <FormField
                  label="Please specify"
                  hint="Provide a short reason for selecting Others."
                  required
                >
                  <textarea
                    aria-label="Please specify"
                    className={`min-h-[96px] ${applicantFormControlClass}`}
                    value={closureTypeOtherReason}
                    onChange={(event) => setClosureTypeOtherReason(event.target.value)}
                    placeholder="Describe the closure reason"
                    disabled={isComplianceForcedClosure}
                  />
                </FormField>
              ) : null}

              <div className={`${applicantHighlightPanelClass} space-y-4`}>
                <p className="text-sm font-semibold text-[var(--foreground)]">Business Operations</p>

                <FormField
                  label="Line of Business"
                  hint="Auto-filled from the selected business record."
                  required
                >
                  <select
                    className={applicantFormControlClass}
                    value={closureLineOfBusiness}
                    onChange={(event) => setClosureLineOfBusiness(event.target.value)}
                  >
                    <option value="" disabled>Select line of business</option>
                    {lineOfBusinessOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  label="Business Activity"
                  hint="Auto-filled from the selected business record."
                  required
                >
                  <select
                    className={applicantFormControlClass}
                    value={closureBusinessActivity}
                    onChange={(event) => {
                      setClosureBusinessActivity(event.target.value);
                      if (event.target.value !== "Others, please specify") {
                        setClosureBusinessActivityOther("");
                      }
                    }}
                  >
                    <option value="" disabled>Select business activity</option>
                    {CLOSURE_BUSINESS_ACTIVITY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </FormField>

                {closureBusinessActivity === "Others, please specify" ? (
                  <FormField
                    label="Please specify business activity"
                    hint="Describe the specific business activity."
                    required
                  >
                    <input
                      type="text"
                      aria-label="Please specify business activity"
                      className={applicantFormControlClass}
                      value={closureBusinessActivityOther}
                      onChange={(event) => setClosureBusinessActivityOther(event.target.value)}
                      placeholder="Enter business activity"
                    />
                  </FormField>
                ) : null}

                <FormField
                  label="Last Date of Operation"
                  hint="Defaults to today's date. Change only if the business stopped earlier."
                  required
                >
                  <input
                    type="date"
                    aria-label="Last Date of Operation"
                    className={applicantFormControlClass}
                    value={closureLastDateOfOperation}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(event) => setClosureLastDateOfOperation(event.target.value)}
                  />
                </FormField>


              </div>

              {selectedRecord ? (
                <div className={applicantPanelClass}>
                  <p className="font-semibold text-[var(--foreground)]">{selectedRecord.businessName}</p>
                  <p className="mt-1">Registration: {selectedRecord.registrationNumber}</p>
                  <p className="mt-1">Business Type: {selectedRecord.businessInfo.businessType}</p>
                  {humanizeClosureEligibilityReason(selectedRecord) ? (
                    <p className="mt-1 text-xs text-[var(--warning)]">{humanizeClosureEligibilityReason(selectedRecord)}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <InfoBanner
            title={`Required documents uploaded: ${uploadedRequiredCount} of ${requiredDocs.length}`}
            description="Upload required files now. Saving a draft keeps them so you do not need to re-upload later."
            variant="info"
          />
          <SectionCard
            title="Upload Requirements"
            description="These documents support closure review and later settlement checking."
          >
            <div className="grid gap-3 md:grid-cols-2">
              {requiredDocs.map((doc) => (
                <UploadSlot
                  key={doc}
                  label={doc}
                  required
                  helperText="Upload a clear file that supports business closure review."
                  disabled={submitting || records.length === 0}
                  fileName={uploadedDocuments[doc]?.fileName}
                  uploadedAt={uploadedDocuments[doc]?.uploadedAt}
                  previewUrl={
                    pendingDocumentPreviews[doc] ??
                    (uploadedDocuments[doc]?.id && applicationId
                      ? `/api/applicant/applications/${applicationId}/documents/${uploadedDocuments[doc].id}/download`
                      : undefined)
                  }
                  onFileChange={(file) => {
                    void handleDocumentUpload(doc, file);
                  }}
                  accept={DOCUMENT_FILE_INPUT_ACCEPT}
                  onRemove={() => {
                    void handleDocumentDelete(doc);
                  }}
                />
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <SectionCard
            title="Review and Submit"
            description="Confirm the selected business and uploaded closure requirements before running final validation."
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={back}
                  className={actionButtonStyles("ghost", "md")}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting || records.length === 0}
                  onClick={() => {
                    void persist("DRAFT");
                  }}
                  className={actionButtonStyles("secondary", "md")}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={submitting || records.length === 0}
                  onClick={handleFinalSubmit}
                  className={actionButtonStyles("primary", "md")}
                >
                  {getApplicationSubmitButtonLabel("CLOSURE", isResubmission)}
                </button>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              <ReviewStat
                label="Business Name"
                value={selectedBusinessName || "-"}
                helper="Selected from your registered business records"
              />
              <ReviewStat
                label="Application Type"
                value="Closure"
                helper="Closure workflow behavior remains unchanged"
              />
              <ReviewStat
                label="Closure Type"
                value={
                  closureType === "RETIREMENT"
                    ? "Retirement"
                    : closureType === "NON_COMPLIANT_RELATED"
                      ? "Non-compliant Related"
                      : closureType === "OTHERS"
                        ? "Others"
                        : "-"
                }
                helper={
                  closureType === "OTHERS"
                    ? closureTypeOtherReason.trim() || "Please specify required"
                    : isComplianceForcedClosure
                      ? "Locked because of compliance-related restriction"
                      : "Required before submission"
                }
              />
              <ReviewStat
                label="Required Documents"
                value={`${uploadedRequiredCount} / ${requiredDocs.length}`}
                helper="Uploaded required document count"
              />
              <ReviewStat
                label="Line of Business"
                value={closureLineOfBusiness || "-"}
                helper="Declared line of business for closure"
              />
              <ReviewStat
                label="Business Activity"
                value={
                  closureBusinessActivity === "Others, please specify" && closureBusinessActivityOther.trim()
                    ? `Others: ${closureBusinessActivityOther.trim()}`
                    : closureBusinessActivity || "-"
                }
                helper="Activity type of closing business"
              />
              <ReviewStat
                label="Last Date of Operation"
                value={closureLastDateOfOperation || "-"}
                helper="Final day of business operations"
              />

            </div>

            <div className={`mt-4 ${applicantPanelClass}`}>
              <p className="font-semibold text-[var(--foreground)]">Before you submit</p>
              <ul className="mt-2 space-y-1">
                <li>• Make sure the selected business record is the one being closed.</li>
                <li>• Confirm the closure type correctly reflects the nature of the business cessation.</li>
                <li>• Confirm each closure requirement has a clear uploaded file.</li>
                <li>• Fees will be assessed by BPLO after application review.</li>
              </ul>
            </div>
          </SectionCard>

          {validationDetail ? <ValidationPanel detail={validationDetail} onBack={back} /> : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={back}
          className={actionButtonStyles("ghost", "md")}
        >
          Back
        </button>
        <button
          type="button"
          disabled={step === steps.length - 1}
          onClick={next}
          className={actionButtonStyles("primary", "md")}
        >
          Next
        </button>
      </div>
    </div>
  );
}

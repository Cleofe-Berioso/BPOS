"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { InfoBanner } from "@/components/ui/info-banner";
import { RoleBadge } from "@/components/ui/role-badge";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { FormField } from "@/components/ui/form-field";
import { ResponsiveDataTable } from "@/components/ui/responsive-data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { actionButtonStyles } from "@/components/ui/action-button";
import type { PaginationPageSize } from "@/lib/pagination";
import {
  superadminAuditPillClass,
  superadminFormControlClass,
  superadminFormPanelClass,
  superadminPanelClass,
  superadminTableClass,
} from "@/components/superadmin/superadmin-ui-styles";


type Flash = { type: "success" | "danger" | "info"; message: string } | null;

type FeeCategoryOption = {
  key: string;
  label: string;
  classifications: string[];
  isCustom?: boolean;
};

type CategoryResponse = {
  success?: boolean;
  category?: FeeCategoryOption;
  categories?: FeeCategoryOption[];
  error?: string;
};

type FeeItem = {
  id: string;
  category: string;
  classification: string;
  amount: number;
  isActive: boolean;
  updatedAt: string;
};

type Penalties = {
  id: string;
  renewalSurchargePercent: number;
  monthlyInterestPercent: number;
  liquorTobaccoAddOnPercent: number;
  powerDistributionFixedFee: number;
  privatePortFixedFee: number;
  updatedAt: string;
};

type RenewalExtension = {
  id: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  waiveSurcharge: boolean;
  waiveInterest: boolean;
  updatedAt: string;
};

type JitPortalEnforcementResult = {
  casesEnforced: number;
  affectedInspectionIds: string[];
  details: Array<{
    inspectionId: string;
    businessRegistrationNumber: string;
    nonComplianceType: string;
    previousStatus: string;
    newStatus: string;
  }>;
};

type JitPortalResponse = {
  jitPortalEnabled: boolean;
  updatedAt: string;
  uninspected?: { uninspectedCount: number; totalInspectableCount: number };
  error?: string;
};

type JitPortalUpdateResponse = {
  success: boolean;
  jitPortalEnabled: boolean;
  enforcementResult?: JitPortalEnforcementResult;
  uninspectedAtDisable?: { uninspectedCount: number; totalInspectableCount: number };
  inspectionCycleStartedAt?: string;
  error?: string;
};

type FeeResponse = { items?: FeeItem[]; categories?: FeeCategoryOption[]; error?: string };
type PenaltyResponse = { penalties?: Penalties; error?: string };
type ExtensionResponse = { extensions?: RenewalExtension[]; error?: string };

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-PH");
}

function formatAmount(value: number): string {
  return `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatExtensionPeriod(startDate: string, endDate: string): string {
  return `${new Date(startDate).toLocaleDateString("en-PH")} - ${new Date(endDate).toLocaleDateString("en-PH")}`;
}

function extensionStatus(extension: RenewalExtension) {
  return extension.isActive ? (
    <span className="inline-flex rounded-full border border-[var(--success)] bg-[var(--success-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--success)]">
      Enabled
    </span>
  ) : (
    <span className={`${superadminAuditPillClass} uppercase tracking-wide`}>
      Disabled
    </span>
  );
}

const EMPTY_PENALTIES: Penalties = {
  id: "",
  renewalSurchargePercent: 25,
  monthlyInterestPercent: 2,
  liquorTobaccoAddOnPercent: 25,
  powerDistributionFixedFee: 10000,
  privatePortFixedFee: 50000,
  updatedAt: "",
};

export function SuperAdminFeeSettingsManager() {
  const [flash, setFlash] = useState<Flash>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [categories, setCategories] = useState<FeeCategoryOption[]>([]);
  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [penalties, setPenalties] = useState<Penalties>(EMPTY_PENALTIES);
  const [extensions, setExtensions] = useState<RenewalExtension[]>([]);
  const [jitPortalEnabled, setJitPortalEnabled] = useState(true);
  const [jitPortalUpdatedAt, setJitPortalUpdatedAt] = useState<string>("");
  const [jitUninspectedCount, setJitUninspectedCount] = useState(0);
  const [jitInspectableCount, setJitInspectableCount] = useState(0);
  const [showJitConfirm, setShowJitConfirm] = useState(false);
  const [jitConfirmValue, setJitConfirmValue] = useState(true);
  const [isJitUpdating, setIsJitUpdating] = useState(false);

  const [feeForm, setFeeForm] = useState({
    category: "",
    classification: "",
    amount: "",
  });

  const [feePage, setFeePage] = useState(1);
  const [feePageSize, setFeePageSize] = useState<PaginationPageSize>(25);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    label: "",
    key: "",
    useDefaultClassifications: true,
    useFixedFeeOnly: false,
  });

  const [penaltyForm, setPenaltyForm] = useState({
    renewalSurchargePercent: "25",
    monthlyInterestPercent: "2",
    liquorTobaccoAddOnPercent: "25",
  });

  const currentYear = new Date().getFullYear();

  const [extensionForm, setExtensionForm] = useState({
    startDate: `${new Date().getFullYear()}-01-01`,
    endDate: "",
    isActive: true,
    waiveSurcharge: true,
    waiveInterest: false,
  });

  async function loadSettings() {
    setIsLoading(true);
    setFlash(null);

    try {
      const [feeRes, penaltiesRes, extRes, jitRes] = await Promise.all([
        fetch("/api/superadmin/settings/fees", { cache: "no-store" }),
        fetch("/api/superadmin/settings/penalties", { cache: "no-store" }),
        fetch("/api/superadmin/settings/extensions", { cache: "no-store" }),
        fetch("/api/superadmin/settings/jit-portal", { cache: "no-store" }),
      ]);

      const feeJson = (await feeRes.json()) as FeeResponse;
      const penaltiesJson = (await penaltiesRes.json()) as PenaltyResponse;
      const extJson = (await extRes.json()) as ExtensionResponse;
      const jitJson = (await jitRes.json()) as JitPortalResponse;

      if (!feeRes.ok || !penaltiesRes.ok || !extRes.ok || !jitRes.ok) {
        setFlash({
          type: "danger",
          message:
            feeJson.error ?? penaltiesJson.error ?? extJson.error ?? jitJson.error ?? "Failed to load system settings.",
        });
        return;
      }

      const nextCategories = feeJson.categories ?? [];
      const nextPenalties = penaltiesJson.penalties ?? EMPTY_PENALTIES;

      setCategories(nextCategories);
      setFeeItems(feeJson.items ?? []);
      setPenalties(nextPenalties);
      setExtensions(extJson.extensions ?? []);
      setJitPortalEnabled(jitJson.jitPortalEnabled ?? true);
      setJitPortalUpdatedAt(jitJson.updatedAt ?? "");
      setJitUninspectedCount(jitJson.uninspected?.uninspectedCount ?? 0);
      setJitInspectableCount(jitJson.uninspected?.totalInspectableCount ?? 0);
      setFeeForm((prev) => {
        const nextCategory =
          prev.category && nextCategories.some((item) => item.key === prev.category)
            ? prev.category
            : nextCategories[0]?.key || "";
        const nextCategoryOption = nextCategories.find((item) => item.key === nextCategory);
        const nextClassification =
          prev.classification && nextCategoryOption?.classifications.includes(prev.classification)
            ? prev.classification
            : nextCategoryOption?.classifications[0] || "";

        return {
          ...prev,
          category: nextCategory,
          classification: nextClassification,
        };
      });
      setPenaltyForm({
        renewalSurchargePercent: String(nextPenalties.renewalSurchargePercent),
        monthlyInterestPercent: String(nextPenalties.monthlyInterestPercent),
        liquorTobaccoAddOnPercent: String(nextPenalties.liquorTobaccoAddOnPercent),
      });
    } catch {
      setFlash({ type: "danger", message: "Failed to load system settings." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const categoryLabelMap = useMemo(() => {
    return new Map(categories.map((item) => [item.key, item.label]));
  }, [categories]);

  const selectedCategory = useMemo(() => {
    return categories.find((item) => item.key === feeForm.category) ?? null;
  }, [categories, feeForm.category]);

  const classificationOptions = selectedCategory?.classifications ?? [];

  const feePagination = useMemo(() => {
    const totalCount = feeItems.length;
    const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / feePageSize);
    const page = Math.min(feePage, totalPages);
    const start = (page - 1) * feePageSize;

    return {
      items: feeItems.slice(start, start + feePageSize),
      totalCount,
      totalPages,
      page,
    };
  }, [feeItems, feePage, feePageSize]);

  useEffect(() => {
    const totalPages = feeItems.length === 0 ? 1 : Math.ceil(feeItems.length / feePageSize);
    if (feePage > totalPages) {
      setFeePage(totalPages);
    }
  }, [feeItems.length, feePage, feePageSize]);

  const summary = useMemo(() => {
    const activeCategories = new Set(feeItems.map((item) => item.category)).size;
    const activeExtension = extensions.find((item) => item.isActive) ?? null;

    return {
      activeCategories,
      renewalSurcharge: penalties.renewalSurchargePercent,
      monthlyInterest: penalties.monthlyInterestPercent,
      activeExtension: activeExtension
        ? formatExtensionPeriod(activeExtension.startDate, activeExtension.endDate)
        : "None",
    };
  }, [extensions, feeItems, penalties.monthlyInterestPercent, penalties.renewalSurchargePercent]);

  const recentUpdates = useMemo(() => {
    const rows = [
      ...feeItems.map((item) => ({
        type: "Fee Table",
        message: `${categoryLabelMap.get(item.category) ?? item.category} / ${item.classification}: ${formatAmount(item.amount)}`,
        updatedAt: item.updatedAt,
      })),
      {
        type: "Penalties",
        message: `Surcharge ${penalties.renewalSurchargePercent}% | Interest ${penalties.monthlyInterestPercent}% | Liquor/Tobacco ${penalties.liquorTobaccoAddOnPercent}%`,
        updatedAt: penalties.updatedAt || new Date(0).toISOString(),
      },
      ...extensions.map((item) => ({
        type: "Extension",
        message: `${formatExtensionPeriod(item.startDate, item.endDate)} (${item.isActive ? "Enabled" : "Disabled"})`,
        updatedAt: item.updatedAt,
      })),
    ];

    return rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8);
  }, [categoryLabelMap, extensions, feeItems, penalties]);

  async function saveFeeItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFlash(null);

    if (!feeForm.category) {
      setFlash({ type: "danger", message: "Business category is required." });
      return;
    }

    if (!feeForm.classification) {
      setFlash({ type: "danger", message: "Size classification is required." });
      return;
    }

    const amount = Number(feeForm.amount);
    if (Number.isNaN(amount) || amount < 0) {
      setFlash({ type: "danger", message: "Fee amount must be a non-negative number." });
      return;
    }

    try {
      const res = await fetch("/api/superadmin/settings/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: feeForm.category,
          classification: feeForm.classification,
          amount,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to save fee table entry." });
        return;
      }

      setFlash({ type: "success", message: "Fee table entry saved." });
      setFeeForm((prev) => ({
        ...prev,
        classification: selectedCategory?.classifications[0] ?? prev.classification,
        amount: "",
      }));
      await loadSettings();
    } catch {
      setFlash({ type: "danger", message: "Failed to save fee table entry." });
    }
  }

  async function saveCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFlash(null);

    if (!categoryForm.label.trim()) {
      setFlash({ type: "danger", message: "Category label is required." });
      return;
    }

    setIsSavingCategory(true);
    try {
      const res = await fetch("/api/superadmin/settings/fees/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: categoryForm.label.trim(),
          key: categoryForm.key.trim() || undefined,
          useDefaultClassifications: !categoryForm.useFixedFeeOnly,
          useFixedFeeOnly: categoryForm.useFixedFeeOnly,
        }),
      });
      const json = (await res.json()) as CategoryResponse;
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to add business category." });
        return;
      }

      const nextCategories = json.categories ?? categories;
      setCategories(nextCategories);

      if (json.category) {
        setFeeForm((prev) => ({
          ...prev,
          category: json.category!.key,
          classification: json.category!.classifications[0] ?? "",
        }));
      }

      setCategoryForm({
        label: "",
        key: "",
        useDefaultClassifications: true,
        useFixedFeeOnly: false,
      });
      setShowAddCategory(false);
      setFlash({ type: "success", message: `Business category "${json.category?.label ?? categoryForm.label}" added.` });
    } catch {
      setFlash({ type: "danger", message: "Failed to add business category." });
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function deleteFeeItem(item: FeeItem) {
    const categoryLabel = categoryLabelMap.get(item.category) ?? item.category;
    const confirmed = window.confirm(
      `Delete fee entry "${categoryLabel} / ${item.classification}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setFlash(null);
    try {
      const res = await fetch("/api/superadmin/settings/fees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to delete fee entry." });
        return;
      }

      setFlash({ type: "success", message: `Deleted fee entry: ${item.classification}.` });
      await loadSettings();
    } catch {
      setFlash({ type: "danger", message: "Failed to delete fee entry." });
    }
  }

  async function deleteCustomCategory(category: FeeCategoryOption) {
    if (!(category.isCustom || category.key.startsWith("CUSTOM_"))) {
      setFlash({ type: "danger", message: "Built-in business categories cannot be deleted." });
      return;
    }

    const confirmed = window.confirm(
      `Delete business category "${category.label}"?\n\nThis removes it from Line of Business on applications and deletes all fee table entries for this category.`
    );
    if (!confirmed) return;

    setFlash(null);
    setIsDeletingCategory(true);
    try {
      const res = await fetch("/api/superadmin/settings/fees/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: category.key }),
      });
      const json = (await res.json()) as CategoryResponse & {
        deleted?: { label: string; deletedFeeItems: number };
      };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to delete business category." });
        return;
      }

      const nextCategories = json.categories ?? categories.filter((item) => item.key !== category.key);
      setCategories(nextCategories);
      setFeeForm((prev) => {
        if (prev.category !== category.key) return prev;
        const nextCategory = nextCategories[0]?.key ?? "";
        const nextOption = nextCategories.find((item) => item.key === nextCategory);
        return {
          ...prev,
          category: nextCategory,
          classification: nextOption?.classifications[0] ?? "",
        };
      });
      setFlash({
        type: "success",
        message: `Deleted category "${json.deleted?.label ?? category.label}" and removed it from Line of Business.`,
      });
      await loadSettings();
    } catch {
      setFlash({ type: "danger", message: "Failed to delete business category." });
    } finally {
      setIsDeletingCategory(false);
    }
  }

  async function savePenalties(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFlash(null);

    const renewalSurchargePercent = Number(penaltyForm.renewalSurchargePercent);
    const monthlyInterestPercent = Number(penaltyForm.monthlyInterestPercent);
    const liquorTobaccoAddOnPercent = Number(penaltyForm.liquorTobaccoAddOnPercent);

    const all = [
      renewalSurchargePercent,
      monthlyInterestPercent,
      liquorTobaccoAddOnPercent,
    ];

    if (all.some((value) => Number.isNaN(value) || value < 0)) {
      setFlash({ type: "danger", message: "Penalty values must be non-negative." });
      return;
    }

    try {
      const res = await fetch("/api/superadmin/settings/penalties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renewalSurchargePercent,
          monthlyInterestPercent,
          liquorTobaccoAddOnPercent,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to save surcharge/interest settings." });
        return;
      }

      setFlash({ type: "success", message: "Surcharge and interest settings updated." });
      await loadSettings();
    } catch {
      setFlash({ type: "danger", message: "Failed to save surcharge/interest settings." });
    }
  }

  async function createExtension(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFlash(null);

    const endYear =
      extensionForm.endDate && !isNaN(new Date(extensionForm.endDate).getTime())
        ? new Date(extensionForm.endDate).getFullYear()
        : currentYear;
    const fixedStartDate = `${endYear}-01-01`;

    if (!extensionForm.endDate) {
      setFlash({ type: "danger", message: "End date is required." });
      return;
    }

    if (new Date(extensionForm.endDate) < new Date(fixedStartDate)) {
      setFlash({ type: "danger", message: "End date cannot be before January 1." });
      return;
    }

    try {
      const res = await fetch("/api/superadmin/settings/extensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...extensionForm,
          startDate: fixedStartDate,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to create renewal extension." });
        return;
      }

      setFlash({ type: "success", message: "Renewal extension saved." });
      setExtensionForm((prev) => ({
        ...prev,
        startDate: `${currentYear}-01-01`,
        endDate: "",
        isActive: true,
        waiveSurcharge: true,
        waiveInterest: false,
      }));
      await loadSettings();
    } catch {
      setFlash({ type: "danger", message: "Failed to create renewal extension." });
    }
  }

  async function toggleExtension(item: RenewalExtension) {
    setFlash(null);
    try {
      const res = await fetch(`/api/superadmin/settings/extensions/${item.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to toggle extension." });
        return;
      }
      setFlash({ type: "success", message: `Extension ${item.isActive ? "disabled" : "enabled"}.` });
      await loadSettings();
    } catch {
      setFlash({ type: "danger", message: "Failed to toggle extension." });
    }
  }

  const flashVariant = flash?.type === "danger" ? "danger" : flash?.type === "success" ? "success" : "info";

  async function saveJitPortalSetting() {
    setShowJitConfirm(false);
    setFlash(null);
    setIsJitUpdating(true);

    try {
      const res = await fetch("/api/superadmin/settings/jit-portal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jitPortalEnabled: jitConfirmValue }),
      });
      const json = (await res.json()) as JitPortalUpdateResponse;

      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to update JIT portal setting." });
        setIsJitUpdating(false);
        return;
      }

      setJitPortalEnabled(json.jitPortalEnabled);
      const disabled = !json.jitPortalEnabled;
      const uninspected = json.uninspectedAtDisable?.uninspectedCount ?? 0;
      const messageParts = [
        `JIT Portal ${json.jitPortalEnabled ? "enabled" : "disabled"}.`,
        disabled
          ? "Previous inspection markers were cleared from the active cycle."
          : "Registered and renewed permits now appear as uninspected (grey) for the new cycle.",
      ];
      if (json.enforcementResult && json.enforcementResult.casesEnforced > 0) {
        messageParts.push(
          `Enforced ${json.enforcementResult.casesEnforced} unresolved compliance case(s).`
        );
      }
      if (disabled && uninspected > 0) {
        messageParts.push(`${uninspected.toLocaleString("en-PH")} business(es) were still uninspected at disable time.`);
      }

      setFlash({ type: "success", message: messageParts.join(" ") });
      await loadSettings();
    } catch {
      setFlash({ type: "danger", message: "Failed to update JIT portal setting." });
    } finally {
      setIsJitUpdating(false);
    }
  }

  function handleJitToggle() {
    setJitConfirmValue(!jitPortalEnabled);
    if (jitPortalEnabled) {
      // Disabling - require confirmation
      setShowJitConfirm(true);
    } else {
      // Enabling - update directly
      void (async () => {
        setFlash(null);
        setIsJitUpdating(true);
        try {
          const res = await fetch("/api/superadmin/settings/jit-portal", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jitPortalEnabled: true }),
          });
          const json = (await res.json()) as JitPortalUpdateResponse;
          if (!res.ok) {
            setFlash({ type: "danger", message: json.error ?? "Failed to enable JIT portal." });
            return;
          }
          setJitPortalEnabled(true);
          setFlash({
            type: "success",
            message:
              "JIT Portal enabled. Registered and renewed permits now appear as uninspected (grey) for the new inspection cycle.",
          });
          await loadSettings();
        } catch {
          setFlash({ type: "danger", message: "Failed to enable JIT portal." });
        } finally {
          setIsJitUpdating(false);
        }
      })();
    }
  }

  function handleCategoryChange(nextCategory: string) {
    const nextCategoryOption = categories.find((item) => item.key === nextCategory);
    setFeeForm((prev) => ({
      ...prev,
      category: nextCategory,
      classification: nextCategoryOption?.classifications[0] ?? "",
    }));
  }

  return (
    <section className="ui-page-stack">
      <PageHeader
        title="System Fee Settings"
        description="Configure fee tables, renewal surcharge/interest rates, and official extension rules."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Configuration Scope" />}
      />

      {flash ? <InfoBanner title={flash.message} variant={flashVariant} /> : null}

      {isLoading ? <LoadingState message="Loading fee settings…" compact /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Active Fee Categories" value={summary.activeCategories.toString()} subtitle="Categories with active configured entries" tone="blue" />
        <StatCard title="Renewal Surcharge" value={`${summary.renewalSurcharge.toLocaleString("en-PH")} %`} subtitle="Applied to late renewals" tone="amber" />
        <StatCard title="Monthly Interest" value={`${summary.monthlyInterest.toLocaleString("en-PH")} %`} subtitle="Applied per late month" tone="slate" />
        <StatCard title="Active Extension" value={summary.activeExtension} subtitle="Current enabled renewal extension" tone="green" />
      </div>

      <SectionCard
        title="Fee Table Maintenance"
        description="Configure Mayor's Permit Fee entries by business category and valid classification. Fixed-fee categories such as Power and Private Port are maintained here."
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="ui-caption">
            Built-in and custom business categories can each have their own fee table entries.
          </p>
          <button
            type="button"
            className={actionButtonStyles(showAddCategory ? "secondary" : "primary", "sm")}
            onClick={() => setShowAddCategory((prev) => !prev)}
          >
            {showAddCategory ? "Hide Add Category" : "Add Category"}
          </button>
        </div>

        {showAddCategory ? (
          <form
            className={`mb-4 grid gap-3 ${superadminFormPanelClass} md:grid-cols-2`}
            onSubmit={saveCategory}
          >
            <FormField label="Category Label" required hint="Display name shown in fee settings and applicant Line of Business dropdowns.">
              <input
                aria-label="Category Label"
                value={categoryForm.label}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, label: e.target.value }))}
                className={superadminFormControlClass}
                placeholder="e.g. Food Processing"
              />
            </FormField>

            <FormField
              label="Size Mode"
              required
              hint="New categories use the standard Micro–Large size tiers, or a single fixed fee."
            >
              <select
                value={categoryForm.useFixedFeeOnly ? "FIXED" : "DEFAULT"}
                onChange={(e) => {
                  const mode = e.target.value;
                  setCategoryForm((prev) => ({
                    ...prev,
                    useFixedFeeOnly: mode === "FIXED",
                    useDefaultClassifications: mode !== "FIXED",
                  }));
                }}
                className={superadminFormControlClass}
              >
                <option value="DEFAULT">Default size tiers (Micro to Large)</option>
                <option value="FIXED">Fixed fee only</option>
              </select>
            </FormField>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className={actionButtonStyles("primary", "sm")}
                disabled={isLoading || isSavingCategory}
              >
                {isSavingCategory ? "Saving…" : "Save Category"}
              </button>
            </div>
          </form>
        ) : null}

        <form className={`grid gap-3 ${superadminFormPanelClass} md:grid-cols-2 xl:grid-cols-5`} onSubmit={saveFeeItem}>
          <FormField label="Business Category" required>
            <select
              value={feeForm.category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className={superadminFormControlClass}
            >
              {categories.length === 0 ? <option value="">No categories available</option> : null}
              {categories.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                  {item.isCustom || item.key.startsWith("CUSTOM_") ? " (Custom)" : ""}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Size Classification" required hint="Only classifications supported by the selected category can be used.">
            <select
              value={feeForm.classification}
              onChange={(e) => setFeeForm((prev) => ({ ...prev, classification: e.target.value }))}
              className={superadminFormControlClass}
            >
              {classificationOptions.length === 0 ? <option value="">No classifications available</option> : null}
              {classificationOptions.map((classification) => (
                <option key={classification} value={classification}>{classification}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Fee Amount" required>
            <input
              type="number"
              min={0}
              step="0.01"
              aria-label="Fee Amount"
              value={feeForm.amount}
              onChange={(e) => setFeeForm((prev) => ({ ...prev, amount: e.target.value }))}
              className={superadminFormControlClass}
            />
          </FormField>

          <div className="flex flex-wrap items-end gap-2 xl:col-span-2">
            <button type="submit" className={actionButtonStyles("primary", "sm")} disabled={isLoading}>
              Save Fee Entry
            </button>
            {selectedCategory && (selectedCategory.isCustom || selectedCategory.key.startsWith("CUSTOM_")) ? (
              <button
                type="button"
                className={actionButtonStyles("danger", "sm")}
                disabled={isLoading || isDeletingCategory}
                onClick={() => void deleteCustomCategory(selectedCategory)}
              >
                {isDeletingCategory ? "Deleting…" : "Delete Category"}
              </button>
            ) : null}
          </div>
        </form>

        <div className="mt-4">
          <ResponsiveDataTable
            title="Configured Fee Table Entries"
            description={
              isLoading
                ? "Loading configured entries..."
                : `${feePagination.totalCount} fee table entries`
            }
            switchAt="xl"
            table={
              feeItems.length === 0 && !isLoading ? (
                <div className="p-5">
                  <EmptyState title="No fee configuration entries yet" description="Add entries to override hardcoded fee defaults." />
                </div>
              ) : (
                <table className={superadminTableClass}>
                  <thead>
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">Category</th>
                      <th className="px-4 py-3.5 font-semibold">Classification</th>
                      <th className="px-4 py-3.5 font-semibold">Amount</th>
                      <th className="px-4 py-3.5 font-semibold">Updated At</th>
                      <th className="px-4 py-3.5 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feePagination.items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-3.5 font-medium text-[var(--foreground)]">{categoryLabelMap.get(item.category) ?? item.category}</td>
                        <td className="px-4 py-3.5 text-[var(--ink-muted)]">{item.classification}</td>
                        <td className="px-4 py-3.5 text-[var(--ink-muted)]">{formatAmount(item.amount)}</td>
                        <td className="px-4 py-3.5 text-[var(--ink-muted)]">{formatDate(item.updatedAt)}</td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            className={actionButtonStyles("danger", "sm")}
                            onClick={() => void deleteFeeItem(item)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
            mobile={
              feeItems.length === 0 && !isLoading ? (
                <div className="p-5">
                  <EmptyState title="No fee configuration entries yet" description="Add entries to override hardcoded fee defaults." />
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {feePagination.items.map((item) => (
                    <article key={item.id} className="app-surface p-4">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{categoryLabelMap.get(item.category) ?? item.category}</p>
                      <p className="ui-caption">{item.classification}</p>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">{formatAmount(item.amount)}</p>
                      <p className="mt-1 ui-caption">Updated: {formatDate(item.updatedAt)}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          className={actionButtonStyles("danger", "sm")}
                          onClick={() => void deleteFeeItem(item)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )
            }
          />

          {feeItems.length > 0 ? (
            <PaginationControls
              basePath="/superadmin/settings"
              queryParams={{}}
              mode="client"
              isLoading={isLoading}
              page={feePagination.page}
              pageSize={feePageSize}
              totalCount={feePagination.totalCount}
              totalPages={feePagination.totalPages}
              recordLabel="fee entries"
              onPageChange={setFeePage}
              onPageSizeChange={(nextSize) => {
                setFeePageSize(nextSize);
                setFeePage(1);
              }}
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Surcharge and Interest Settings"
        description="Configure renewal surcharge, monthly interest, and liquor/tobacco add-on percentages. Fixed-fee category amounts are maintained in the fee table above."
      >
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={savePenalties}>
          <FormField label="Renewal Late Surcharge (%)" required>
            <input
              type="number"
              min={0}
              step="0.01"
              aria-label="Renewal Late Surcharge (%)"
              value={penaltyForm.renewalSurchargePercent}
              onChange={(e) => setPenaltyForm((prev) => ({ ...prev, renewalSurchargePercent: e.target.value }))}
              className={superadminFormControlClass}
            />
          </FormField>

          <FormField label="Monthly Interest (%)" required>
            <input
              type="number"
              min={0}
              step="0.01"
              aria-label="Monthly Interest (%)"
              value={penaltyForm.monthlyInterestPercent}
              onChange={(e) => setPenaltyForm((prev) => ({ ...prev, monthlyInterestPercent: e.target.value }))}
              className={superadminFormControlClass}
            />
          </FormField>

          <FormField label="Liquor/Tobacco Add-on (%)" required>
            <input
              type="number"
              min={0}
              step="0.01"
              aria-label="Liquor/Tobacco Add-on (%)"
              value={penaltyForm.liquorTobaccoAddOnPercent}
              onChange={(e) => setPenaltyForm((prev) => ({ ...prev, liquorTobaccoAddOnPercent: e.target.value }))}
              className={superadminFormControlClass}
            />
          </FormField>

          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <button type="submit" className={actionButtonStyles("primary", "sm")} disabled={isLoading}>
              Save Surcharge Settings
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Renewal Extension Settings"
        description="Create, enable, and disable extension periods with surcharge/interest waiver rules."
      >
        <form className={`grid gap-3 ${superadminFormPanelClass} md:grid-cols-2 xl:grid-cols-3`} onSubmit={createExtension}>
          <FormField label="Start Date" required hint="Fixed to January 1 for the renewal season.">
            <input
              type="text"
              aria-label="Start Date"
              value={`January 1, ${
                extensionForm.endDate && !isNaN(new Date(extensionForm.endDate).getTime())
                  ? new Date(extensionForm.endDate).getFullYear()
                  : currentYear
              }`}
              readOnly
              className={`${superadminFormControlClass} opacity-80 cursor-not-allowed bg-[var(--surface-sunken)] font-medium`}
            />
          </FormField>

          <FormField label="End Date" required>
            <input
              type="date"
              aria-label="End Date"
              value={extensionForm.endDate}
              onChange={(e) => {
                const nextEndDate = e.target.value;
                const endYear =
                  nextEndDate && !isNaN(new Date(nextEndDate).getTime())
                    ? new Date(nextEndDate).getFullYear()
                    : currentYear;
                setExtensionForm((prev) => ({
                  ...prev,
                  endDate: nextEndDate,
                  startDate: `${endYear}-01-01`,
                }));
              }}
              className={superadminFormControlClass}
            />
          </FormField>

          <FormField label="Waive Surcharge During Extension" required>
            <select
              value={extensionForm.waiveSurcharge ? "YES" : "NO"}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, waiveSurcharge: e.target.value === "YES" }))}
              className={superadminFormControlClass}
            >
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </select>
          </FormField>

          <FormField label="Waive Interest During Extension" required>
            <select
              value={extensionForm.waiveInterest ? "YES" : "NO"}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, waiveInterest: e.target.value === "YES" }))}
              className={superadminFormControlClass}
            >
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </select>
          </FormField>

          <FormField label="Enabled Status" required>
            <select
              value={extensionForm.isActive ? "ENABLED" : "DISABLED"}
              onChange={(e) => setExtensionForm((prev) => ({ ...prev, isActive: e.target.value === "ENABLED" }))}
              className={superadminFormControlClass}
            >
              <option value="ENABLED">Enabled</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </FormField>

          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <button type="submit" className={actionButtonStyles("primary", "sm")} disabled={isLoading}>
              Save Extension
            </button>
          </div>
        </form>

        <div className="mt-4">
          <ResponsiveDataTable
            title="Configured Renewal Extensions"
            description={extensions.length === 0 ? "No extensions configured yet." : `${extensions.length} extensions configured`} 
            switchAt="xl"
            table={
              extensions.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No renewal extensions yet" description="Create extension windows for special renewal periods." />
                </div>
              ) : (
                <table className={superadminTableClass}>
                  <thead>
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">Period</th>
                      <th className="px-4 py-3.5 font-semibold">Waive Surcharge</th>
                      <th className="px-4 py-3.5 font-semibold">Waive Interest</th>
                      <th className="px-4 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold">Updated</th>
                      <th className="px-4 py-3.5 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extensions.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-3.5 font-medium text-[var(--foreground)]">
                          {formatExtensionPeriod(item.startDate, item.endDate)}
                        </td>
                        <td className="px-4 py-3.5 text-[var(--ink-muted)]">{item.waiveSurcharge ? "Yes" : "No"}</td>
                        <td className="px-4 py-3.5 text-[var(--ink-muted)]">{item.waiveInterest ? "Yes" : "No"}</td>
                        <td className="px-4 py-3.5">{extensionStatus(item)}</td>
                        <td className="px-4 py-3.5 text-[var(--ink-muted)]">{formatDate(item.updatedAt)}</td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => void toggleExtension(item)}
                            className={actionButtonStyles(item.isActive ? "warning" : "secondary", "sm")}
                          >
                            {item.isActive ? "Disable" : "Enable"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
            mobile={
              extensions.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No renewal extensions yet" description="Create extension windows for special renewal periods." />
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {extensions.map((item) => (
                    <article key={item.id} className="app-surface p-4">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {formatExtensionPeriod(item.startDate, item.endDate)}
                      </p>
                      <p className="mt-1 ui-caption">Waive Surcharge: {item.waiveSurcharge ? "Yes" : "No"}</p>
                      <p className="ui-caption">Waive Interest: {item.waiveInterest ? "Yes" : "No"}</p>
                      <p className="mt-1 ui-caption">Updated: {formatDate(item.updatedAt)}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        {extensionStatus(item)}
                        <button
                          type="button"
                          onClick={() => void toggleExtension(item)}
                          className={actionButtonStyles(item.isActive ? "warning" : "secondary", "sm")}
                        >
                          {item.isActive ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Recent Configuration Updates" description="Latest changes across fee table, penalties, and extension settings.">
        {recentUpdates.length === 0 ? (
          <EmptyState title="No configuration updates yet" description="Saved settings will appear here." />
        ) : (
          <div className="space-y-2">
            {recentUpdates.map((item, index) => (
              <div key={`${item.type}-${index}-${item.updatedAt}`} className={superadminPanelClass}>
                <p className="font-semibold text-[var(--foreground)]">{item.type}</p>
                <p className="mt-1">{item.message}</p>
                <p className="mt-1 ui-caption">{formatDate(item.updatedAt)}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="JIT Portal Access Control"
        description="Enable or disable the JIT Portal system-wide. Disabling clears previous inspection markers from the active cycle and enforces unresolved government-agency compliance cases. Re-enabling starts a fresh cycle so registered and renewed permits show as grey (uninspected) again."
      >
        <div className={superadminFormPanelClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[var(--foreground)]">JIT Portal Status</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {jitPortalEnabled ? (
                  <span className="inline-flex rounded-full border border-[var(--success)] bg-[var(--success-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--success)]">
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--danger)]">
                    Disabled
                  </span>
                )}
              </p>
              {jitPortalEnabled ? (
                <p className="mt-2 text-sm text-[var(--ink-muted)]">
                  Uninspected permitted businesses:{" "}
                  <strong className="text-[var(--foreground)]">
                    {jitUninspectedCount.toLocaleString("en-PH")}
                  </strong>{" "}
                  of {jitInspectableCount.toLocaleString("en-PH")}
                </p>
              ) : null}
              {jitPortalUpdatedAt && <p className="mt-2 ui-caption">Last updated: {formatDate(jitPortalUpdatedAt)}</p>}
            </div>
            <button
              type="button"
              onClick={handleJitToggle}
              disabled={isJitUpdating}
              className={actionButtonStyles(jitPortalEnabled ? "warning" : "primary", "sm")}
            >
              {jitPortalEnabled ? "Disable Portal" : "Enable Portal"}
            </button>
          </div>

          {showJitConfirm && (
            <div className="mt-4 rounded-xl border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-4">
              <p className="font-semibold text-[var(--danger)]">
                {jitUninspectedCount > 0
                  ? "Are you sure to disable it? There are businesses not inspected."
                  : "Disable JIT Portal?"}
              </p>
              <p className="mt-2 text-sm text-[var(--danger)]">
                {jitUninspectedCount > 0 ? (
                  <>
                    <strong>{jitUninspectedCount.toLocaleString("en-PH")}</strong> of{" "}
                    {jitInspectableCount.toLocaleString("en-PH")} registered/renewed permitted businesses still have no
                    inspection in the current cycle.{" "}
                  </>
                ) : null}
                Disabling will prevent JIT users from accessing inspection features, clear previous inspected markers from
                the active map cycle, and mark unresolved government-agency-related flagged cases as expired/unsettled.
                Re-enabling later will show registered and renewed permits as grey (uninspected) again.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={saveJitPortalSetting}
                  disabled={isJitUpdating}
                  className={actionButtonStyles("danger", "sm")}
                >
                  {isJitUpdating ? "Processing..." : "Confirm Disable"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowJitConfirm(false)}
                  disabled={isJitUpdating}
                  className={actionButtonStyles("secondary", "sm")}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </section>
  );
}

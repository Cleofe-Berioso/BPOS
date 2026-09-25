type RoleBadgeValue = "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT" | "VIEW_ONLY";

const ROLE_STYLES: Record<RoleBadgeValue, string> = {
  APPLICANT: "border border-[var(--border-color)] bg-[var(--primary-soft)] text-[var(--primary-strong)]",
  BPLO: "border border-[var(--border-color)] bg-[var(--primary-soft)] text-[var(--primary-strong)]",
  SUPER_ADMIN: "border border-[var(--border-color)] bg-[var(--accent-soft)] text-[var(--foreground)]",
  DEPARTMENT_HEAD: "border border-[var(--border-color)] bg-[var(--primary-soft)] text-[var(--primary-strong)]",
  JIT: "border border-[var(--border-color)] bg-[var(--primary-soft)] text-[var(--primary-strong)]",
  VIEW_ONLY: "border border-[var(--border-color)] bg-[var(--muted-surface)] text-[var(--ink-muted)]",
};

const ROLE_LABELS: Record<RoleBadgeValue, string> = {
  APPLICANT: "APPLICANT",
  BPLO: "BPLO",
  SUPER_ADMIN: "IT Administrator",
  DEPARTMENT_HEAD: "DEPARTMENT HEAD",
  JIT: "JIT Inspector Portal",
  VIEW_ONLY: "VIEW ONLY",
};

export function RoleBadge({
  roleType,
  label,
}: {
  roleType: RoleBadgeValue;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${ROLE_STYLES[roleType]}`}
    >
      {label ?? ROLE_LABELS[roleType]}
    </span>
  );
}

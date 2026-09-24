import Link from "next/link";
import {
  Activity,
  MessageSquareWarning,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  ArrowRight,
  ShieldCheck,
  Send,
} from "lucide-react";
import type {
  DiagnosticActivityItem,
  DiagnosticSmsItem,
} from "@/lib/superadmin-dashboard";

export interface DiagnosticLogsPanelProps {
  feeds: {
    recentActivities: DiagnosticActivityItem[];
    recentSmsLogs: DiagnosticSmsItem[];
  };
  health: {
    databaseReachable: boolean;
    lastSuccessfulDashboardCheck: string;
    recentFailedSmsCount: number;
    recentActivityVolume: number;
  };
  className?: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "Just now";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  } catch {
    return dateString;
  }
}

function formatFullTimestamp(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateString;
  }
}

function formatShortStatus(status: string | null | undefined): string {
  if (!status) return "-";
  switch (status) {
    case "SUBMITTED":
      return "Submitted";
    case "UNDER_REVIEW":
      return "Review";
    case "RETURNED_FOR_CORRECTION":
      return "Returned";
    case "ASSESSED":
      return "Assessed";
    case "DEPARTMENT_HEAD_REVIEW":
      return "DH Review";
    case "DEPARTMENT_HEAD_APPROVED":
      return "DH Approved";
    case "APPROVED_FOR_PAYMENT":
      return "Payment Due";
    case "PAYMENT_VERIFIED":
      return "Paid";
    case "FOR_RELEASE":
      return "For Release";
    case "ISSUED":
      return "Issued";
    case "COMPLIANT":
      return "Compliant";
    case "NON_COMPLIANT":
      return "Non-Compliant";
    case "REVOCATION_REVIEW":
      return "Revoc. Review";
    case "REVOKED":
      return "Revoked";
    case "CLOSED":
      return "Closed";
    default:
      return status
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

function renderRolePill(role: string) {
  switch (role) {
    case "SUPER_ADMIN":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60">
          Admin
        </span>
      );
    case "BPLO":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          BPLO
        </span>
      );
    case "DEPARTMENT_HEAD":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/60">
          Dept Head
        </span>
      );
    case "JIT":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200/60">
          JIT
        </span>
      );
    case "APPLICANT":
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/60">
          Applicant
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200/60">
          {role}
        </span>
      );
  }
}

export function DiagnosticLogsPanel({
  feeds,
  health,
  className = "",
}: DiagnosticLogsPanelProps) {
  const { recentActivities, recentSmsLogs } = feeds;

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs transition-shadow hover:shadow-sm ${className}`}
    >
      {/* Header section */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 border border-slate-200/70 shadow-2xs">
            <Activity className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold tracking-tight text-slate-900">
                Diagnostic logs
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live audit feeds
              </span>
            </div>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">
              Direct audit trail and delivery events for IT root-cause analysis.
              Information is displayed live without requiring navigation.
            </p>
          </div>
        </div>
      </div>

      {/* Two side-by-side audit columns */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Column 1: Live Activity Trail */}
        <div className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 sm:p-3.5">
          {/* Activity Banner Header */}
          <Link
            href="/superadmin/activities"
            className="group rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs transition-all hover:border-amber-300 hover:bg-amber-50/30"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60">
                  <Activity className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 group-hover:text-amber-700 transition-colors">
                    Activity Log
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">
                      {health.recentActivityVolume.toLocaleString("en-PH")}
                    </span>{" "}
                    workflow events in the last 7 days
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 group-hover:translate-x-0.5 transition-transform shrink-0 mt-0.5">
                Full trail <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>

          {/* Section Subtitle */}
          <div className="mt-3.5 mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Recent Workflow Events
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              Latest {recentActivities.length} actions
            </span>
          </div>

          {/* List of Workflow Events */}
          <div className="space-y-2 flex-1">
            {recentActivities.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center">
                <ShieldCheck className="h-6 w-6 text-slate-300" />
                <p className="mt-1.5 text-xs font-semibold text-slate-600">
                  No workflow events recorded
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Actions will appear here as users process applications.
                </p>
              </div>
            ) : (
              recentActivities.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs transition-colors hover:border-slate-300"
                >
                  {/* Top row: Actor Name + Role pill + Relative timestamp */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="truncate text-xs font-bold text-slate-800"
                        title={item.actorName}
                      >
                        {item.actorName}
                      </span>
                      {renderRolePill(item.actorRole)}
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-medium text-slate-400 cursor-default"
                      title={formatFullTimestamp(item.createdAt)}
                    >
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>

                  {/* Middle row: Application Reference + State Transition */}
                  <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px]">
                    <div className="min-w-0">
                      {item.applicationNumber ? (
                        <span className="font-mono text-[11px] font-semibold text-slate-700 truncate">
                          {item.applicationNumber}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          System Event
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 font-medium text-[10px]">
                      {item.fromStatus ? (
                        <>
                          <span
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-medium"
                            title={item.fromStatus}
                          >
                            {formatShortStatus(item.fromStatus)}
                          </span>
                          <span className="text-slate-400">→</span>
                        </>
                      ) : null}
                      <span
                        className="rounded bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700 border border-blue-100"
                        title={item.toStatus}
                      >
                        {formatShortStatus(item.toStatus)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom row: Remarks / Note if available */}
                  {item.remarks ? (
                    <p
                      className="mt-1.5 text-[11px] text-slate-600 italic border-l-2 border-slate-200 pl-2 line-clamp-1"
                      title={item.remarks}
                    >
                      &ldquo;{item.remarks}&rdquo;
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Live SMS Dispatch & Delivery Log */}
        <div className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 sm:p-3.5">
          {/* SMS Banner Header */}
          <Link
            href="/superadmin/reports/print/sms"
            className="group rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs transition-all hover:border-rose-300 hover:bg-rose-50/30"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60">
                  <MessageSquareWarning className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 group-hover:text-rose-700 transition-colors">
                    SMS Delivery Log
                  </p>
                  <p className="text-xs text-slate-500">
                    <span
                      className={`font-semibold ${
                        health.recentFailedSmsCount > 0
                          ? "text-rose-600 font-bold"
                          : "text-slate-700"
                      }`}
                    >
                      {health.recentFailedSmsCount.toLocaleString("en-PH")}
                    </span>{" "}
                    failed SMS in the last 7 days
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 group-hover:translate-x-0.5 transition-transform shrink-0 mt-0.5">
                Full report <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>

          {/* Section Subtitle */}
          <div className="mt-3.5 mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Recent SMS Dispatches
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              Latest {recentSmsLogs.length} attempts
            </span>
          </div>

          {/* List of SMS Dispatches */}
          <div className="space-y-2 flex-1">
            {recentSmsLogs.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center">
                <Send className="h-6 w-6 text-slate-300" />
                <p className="mt-1.5 text-xs font-semibold text-slate-600">
                  No SMS logs recorded
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Notifications will appear here as automated SMS alerts trigger.
                </p>
              </div>
            ) : (
              recentSmsLogs.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-2.5 shadow-2xs transition-colors ${
                    item.status === "FAILED"
                      ? "border-rose-200 bg-rose-50/50 hover:border-rose-300"
                      : "border-slate-200/70 bg-white hover:border-slate-300"
                  }`}
                >
                  {/* Top row: Status badge + Masked recipient + Relative timestamp */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.status === "SENT" ? (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                          SENT
                        </span>
                      ) : item.status === "FAILED" ? (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertTriangle className="h-2.5 w-2.5 text-rose-600" />
                          FAILED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/70">
                          <MinusCircle className="h-2.5 w-2.5 text-amber-600" />
                          SKIPPED
                        </span>
                      )}
                      <span className="font-mono text-xs font-bold text-slate-700 truncate">
                        {item.phoneNumber ?? "No contact"}
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-medium text-slate-400 cursor-default"
                      title={formatFullTimestamp(item.createdAt)}
                    >
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>

                  {/* Middle row: Application Reference + Gateway Provider */}
                  <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px]">
                    <span className="font-mono text-[11px] font-medium text-slate-600 truncate">
                      {item.applicationNumber ?? "Direct Notification"}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {item.provider}
                    </span>
                  </div>

                  {/* Bottom row: Message body snippet or error response */}
                  <div className="mt-1.5">
                    {item.status === "FAILED" && item.providerResponse ? (
                      <p
                        className="text-[11px] font-medium text-rose-700 line-clamp-1"
                        title={item.providerResponse}
                      >
                        <span className="font-bold">Error:</span>{" "}
                        {item.providerResponse}
                      </p>
                    ) : item.messageSnippet ? (
                      <p
                        className="text-[11px] text-slate-500 line-clamp-1"
                        title={item.messageSnippet}
                      >
                        {item.messageSnippet}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        No message body recorded
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  contentClassName = "",
  fill = false,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Fill a split-pane parent and scroll the body instead of the page. */
  fill?: boolean;
}) {
  return (
    <section
      className={`ui-section-card app-surface relative ${fill ? "ui-split-pane overflow-hidden" : "overflow-hidden"} ${className}`}
    >
      {title || description || action ? (
        <div className="flex shrink-0 flex-col gap-1 border-b border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:px-3.5 lg:gap-2 lg:px-4">
          <div className="min-w-0">
            {title ? (
              <h3
                className="ui-section-heading font-semibold tracking-tight"
                style={{
                  fontSize: "var(--text-section-title)",
                  color: "var(--foreground)",
                }}
              >
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="ui-caption mt-0.5 line-clamp-2">{description}</p>
            ) : null}
          </div>
          {action ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className={
          fill
            ? `flex min-h-0 flex-1 flex-col overflow-hidden ${contentClassName}`
            : `px-3 py-2.5 sm:px-3.5 sm:py-3 lg:px-4 ${contentClassName}`
        }
      >
        {children}
      </div>
    </section>
  );
}

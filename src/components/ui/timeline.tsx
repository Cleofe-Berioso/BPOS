import type { ReactNode } from "react";

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp?: string;
  status?: ReactNode;
}

export function Timeline({
  items,
  empty,
}: {
  items: TimelineItem[];
  empty?: ReactNode;
}) {
  if (items.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="relative rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--surface)] px-3.5 py-3.5 sm:px-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-[var(--foreground)] break-words">{item.title}</p>
              {item.description ? (
                <p className="text-sm leading-6 text-[var(--ink-muted)] break-words">{item.description}</p>
              ) : null}
              {item.timestamp ? <p className="ui-caption">{item.timestamp}</p> : null}
            </div>
            {item.status ? <div className="shrink-0">{item.status}</div> : null}
          </div>
          {index < items.length - 1 ? (
            <span
              className="absolute -bottom-2.5 left-5 h-2.5 border-l border-dashed border-[var(--border-color)]"
              aria-hidden="true"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

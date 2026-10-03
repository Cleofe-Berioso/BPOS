import type { ReactNode } from "react";

/**
 * Column definition for ReportTable.
 */
export interface ReportTableColumn {
  /** Matches the key in each row object. */
  key: string;
  /** Column header label. */
  label: string;
  /** Extra Tailwind classes for <td> cells in this column. */
  className?: string;
  /** Extra Tailwind classes for the <th> header cell. */
  headerClassName?: string;
}

interface ReportTableProps {
  columns: ReportTableColumn[];
  /**
   * Each row is a plain object. Missing keys render as "-".
   * Accepts any object whose values are renderable by React.
   */
  rows: Array<Record<string, unknown>>;
  /** Accessible table caption / sub-title shown above the header row. */
  caption?: string;
  /** Text displayed when rows is empty. */
  emptyMessage?: string;
}

/**
 * Generic printable data table for IT Administrator system reports.
 *
 * - Alternating row background (zebra striping)
 * - `report-table-row` class on each <tr> → prevents row page-break (set by ReportPageHeader CSS)
 * - `print:overflow-visible` ensures table is not clipped during print
 * - Server component — no client interactivity
 */
export function ReportTable({
  columns,
  rows,
  caption,
  emptyMessage = "No records found.",
}: ReportTableProps) {
  return (
    <div className="report-table-wrapper overflow-x-auto print:overflow-visible print:w-full">
      <table className="report-table w-full border-collapse text-sm text-black print:text-[10px] print:w-full print:table-auto">
        {caption ? (
          <caption className="px-0 py-2 text-left text-sm font-semibold caption-top print:py-1 print:text-xs">
            {caption}
          </caption>
        ) : null}

        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-2 py-2 text-left text-xs font-semibold print:px-1.5 print:py-1 print:text-[10px] print:leading-tight ${col.headerClassName ?? ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-sm text-gray-600 print:py-3 print:text-xs">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="report-table-row border-b last:border-0 print:border-slate-300">
                {columns.map((col) => (
                  <td key={col.key} className={`px-2 py-2 print:px-1.5 print:py-1 print:text-[10px] print:leading-snug ${col.className ?? ""}`}>
                    {(row[col.key] as ReactNode) ?? "-"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

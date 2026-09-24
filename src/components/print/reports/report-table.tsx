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
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-sm text-black">
        {caption ? (
          <caption className="px-0 py-2 text-left text-sm font-semibold caption-top">
            {caption}
          </caption>
        ) : null}

        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-2 py-2 text-left text-xs font-semibold ${col.headerClassName ?? ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-sm text-gray-600">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
               
              <tr key={rowIdx} className="report-table-row border-b last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className={`px-2 py-2 ${col.className ?? ""}`}>
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

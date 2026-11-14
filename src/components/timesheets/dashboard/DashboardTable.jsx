import { Fragment } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, formatHours } from "@/lib/timesheetReport";

const COL_NO = 56;
const COL_NAME = 208;
const COL_TOTAL = 96;
const LEFT_NAME = COL_NO;
const LEFT_TOTAL = COL_NO + COL_NAME;
const HEAD_H1 = 28;
const HEAD_H2 = 34;

function HourCell({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/35">–</span>;
  }
  return <span className={value === 0 ? "text-muted-foreground" : "text-foreground"}>{formatHours(value)}</span>;
}

export default function DashboardTable({
  report,
  columns,
  headGroups,
  viewMode,
  labels,
  lang = "en",
  isLoading,
  collapsed,
  onToggleVendor,
}) {
  const totalCols = 3 + columns.length;
  const minCol = viewMode === "daily" ? 46 : 78;
  const days = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.en;

  const headFixed = "sticky top-0 z-40 bg-muted border-b border-border text-[11px] font-semibold text-muted-foreground";
  const stickyLeft = (left, extra) =>
    cn("sticky z-20 border-b border-border", extra);

  return (
    <div className="overflow-auto max-h-[66vh] rounded-xl border bg-card shadow-sm">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          {viewMode === "daily" ? (
            <>
              <tr>
                <th rowSpan={2} className={cn(headFixed, "px-2 text-left border-r")} style={{ left: 0, width: COL_NO, minWidth: COL_NO, height: HEAD_H1 + HEAD_H2 }}>
                  {labels.no}
                </th>
                <th rowSpan={2} className={cn(headFixed, "px-2 text-left border-r")} style={{ left: LEFT_NAME, width: COL_NAME, minWidth: COL_NAME }}>
                  {labels.employee}
                </th>
                <th rowSpan={2} className={cn(headFixed, "px-2 text-right border-r")} style={{ left: LEFT_TOTAL, width: COL_TOTAL, minWidth: COL_TOTAL }}>
                  {labels.total}
                </th>
                {headGroups.map((g) => (
                  <th
                    key={g.key}
                    colSpan={g.dates.length}
                    className="sticky top-0 z-30 bg-secondary border-b border-l border-border px-1 text-center text-[11px] font-semibold text-foreground"
                    style={{ height: HEAD_H1 }}
                  >
                    {labels.week}{String(g.isoWeek).padStart(2, "0")}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "sticky z-30 border-b border-border px-1 text-center text-[10px] leading-tight font-normal",
                      c.isWeekend ? "bg-amber-50 text-amber-700" : "bg-card text-muted-foreground"
                    )}
                    style={{ top: HEAD_H1, height: HEAD_H2, minWidth: minCol }}
                  >
                    <div className="font-semibold text-foreground">{days[c.dow]}</div>
                    <div>{format(c.date, "dd.MM")}</div>
                  </th>
                ))}
              </tr>
            </>
          ) : (
            <tr>
              <th className={cn(headFixed, "px-2 text-left border-r")} style={{ left: 0, width: COL_NO, minWidth: COL_NO, height: HEAD_H2 }}>
                {labels.no}
              </th>
              <th className={cn(headFixed, "px-2 text-left border-r")} style={{ left: LEFT_NAME, width: COL_NAME, minWidth: COL_NAME }}>
                {labels.employee}
              </th>
              <th className={cn(headFixed, "px-2 text-right border-r")} style={{ left: LEFT_TOTAL, width: COL_TOTAL, minWidth: COL_TOTAL }}>
                {labels.total}
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="sticky top-0 z-30 bg-card border-b border-l border-border px-1 text-center text-[10px] leading-tight font-normal text-muted-foreground"
                  style={{ height: HEAD_H2, minWidth: minCol }}
                >
                  <div className="text-[11px] font-semibold text-foreground">{labels.week}{String(c.isoWeek).padStart(2, "0")}</div>
                  <div>
                    {format(c.dates[0].date, "dd.MM")}–{format(c.dates[c.dates.length - 1].date, "dd.MM")}
                  </div>
                </th>
              ))}
            </tr>
          )}
        </thead>

        <tbody>
          {report.vendorGroups.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="px-4 py-16 text-center text-sm text-muted-foreground">
                {isLoading ? labels.loading : labels.empty}
              </td>
            </tr>
          )}

          {report.vendorGroups.map((group) => {
            const isCollapsed = collapsed.has(group.vendor);
            return (
              <Fragment key={group.vendor || "__none__"}>
                <tr>
                  <td colSpan={totalCols} className="sticky left-0 z-20 bg-secondary border-y border-border px-2 py-1.5">
                    <button type="button" onClick={() => onToggleVendor(group.vendor)} className="flex items-center gap-2 text-left">
                      <ChevronDown className={cn("w-3.5 h-3.5 text-primary transition-transform", isCollapsed && "-rotate-90")} />
                      <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        {group.vendor || labels.noVendor}
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        · {group.employeeCount} {labels.employeesShort}
                      </span>
                    </button>
                  </td>
                </tr>

                {!isCollapsed &&
                  group.rows.map((row) => (
                    <tr key={row.employeeKey}>
                      <td
                        className={stickyLeft(0, "bg-card px-2 py-1 text-xs text-muted-foreground whitespace-nowrap")}
                        style={{ left: 0, width: COL_NO, minWidth: COL_NO }}
                      >
                        {row.number || "—"}
                      </td>
                      <td
                        className={stickyLeft(LEFT_NAME, "bg-card border-r px-2 py-1 text-sm font-medium whitespace-nowrap")}
                        style={{ left: LEFT_NAME, width: COL_NAME, minWidth: COL_NAME, maxWidth: COL_NAME }}
                        title={row.name}
                      >
                        <div className="overflow-hidden text-ellipsis" style={{ maxWidth: COL_NAME - 18 }}>{row.name}</div>
                      </td>
                      <td
                        className={stickyLeft(LEFT_TOTAL, "bg-muted border-r px-2 py-1 text-sm font-semibold text-right")}
                        style={{ left: LEFT_TOTAL, width: COL_TOTAL, minWidth: COL_TOTAL }}
                      >
                        {formatHours(row.total)}
                      </td>
                      {row.cells.map((v, i) => (
                        <td
                          key={columns[i].key}
                          className={cn("border-b border-border px-1 py-1 text-center text-xs", columns[i].isWeekend && "bg-amber-50/60")}
                          style={{ minWidth: minCol }}
                        >
                          <HourCell value={v} />
                        </td>
                      ))}
                    </tr>
                  ))}

                <tr className="bg-muted">
                  <td className="sticky z-20 bg-muted border-b border-border px-2 py-1.5" style={{ left: 0, minWidth: COL_NO }} />
                  <td
                    className="sticky z-20 bg-muted border-b border-r border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ left: LEFT_NAME, minWidth: COL_NAME }}
                  >
                    {labels.subtotal}
                  </td>
                  <td
                    className="sticky z-20 bg-muted border-b border-r border-border px-2 py-1.5 text-sm font-bold text-right"
                    style={{ left: LEFT_TOTAL, minWidth: COL_TOTAL }}
                  >
                    {formatHours(group.total)}
                  </td>
                  {group.columnTotals.map((v, i) => (
                    <td key={columns[i].key} className="border-b border-border px-1 py-1.5 text-center text-xs font-semibold">
                      {v === null ? <span className="text-muted-foreground/35">–</span> : formatHours(v)}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}

          {report.vendorGroups.length > 0 && (
            <tr className="bg-secondary border-t-2 border-primary/40">
              <td className="sticky z-20 bg-secondary border-b border-border px-2 py-2" style={{ left: 0, minWidth: COL_NO }} />
              <td
                className="sticky z-20 bg-secondary border-b border-r border-border px-2 py-2 text-xs font-bold uppercase tracking-wide text-foreground"
                style={{ left: LEFT_NAME, minWidth: COL_NAME }}
              >
                {labels.grandTotal}
              </td>
              <td
                className="sticky z-20 bg-secondary border-b border-r border-border px-2 py-2 text-sm font-bold text-right"
                style={{ left: LEFT_TOTAL, minWidth: COL_TOTAL }}
              >
                {formatHours(report.grandTotal)}
              </td>
              {report.columnTotals.map((v, i) => (
                <td key={columns[i].key} className="border-b border-border px-1 py-2 text-center text-xs font-bold">
                  {v === null ? <span className="text-muted-foreground/35">–</span> : formatHours(v)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
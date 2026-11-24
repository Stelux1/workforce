import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/translations";

export function MarginBadge({ pct }) {
  return (
    <span className="inline-block rounded-md bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5">
      {pct === null || pct === undefined ? "—" : `${pct.toFixed(1)}%`}
    </span>
  );
}

/** Kartica sa tabelom „najprofitabilniji". columns: [{ key, label, align, render(row) }]. */
export default function TopTable({ title, viewAllTo, columns, rows }) {
  const t = useT();
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <Link to={viewAllTo} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
            {t("View All")} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("No approved hours in this period")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 text-xs text-muted-foreground">
                  {columns.map((c, i) => (
                    <th key={c.key} className={`py-2 px-2 font-medium ${i === 0 ? "text-left rounded-l-md" : c.align === "left" ? "text-left" : "text-right"} ${i === columns.length - 1 ? "rounded-r-md" : ""}`}>
                      {t(c.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    {columns.map((c, i) => (
                      <td key={c.key} className={`py-2.5 px-2 ${i === 0 ? "text-left" : c.align === "left" ? "text-left" : "text-right"} ${c.className || ""}`}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

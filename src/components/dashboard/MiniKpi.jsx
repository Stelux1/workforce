import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Manja KPI kartica za drugi red table (Active Workers, Approved Hours, Payables…). Isto kao KpiCard: `to` je
 * filtrirana izvorna lista, `extra` ostale valute, `empty` = „—" bez izmišljene nule, `sub` = obuhvat/objašnjenje.
 */
export default function MiniKpi({ title, value, icon: Icon, to, extra = [], sub, empty = false, tone }) {
  const body = (
    <Card className={cn("p-4 h-full", to && "transition-all group-hover:shadow-md group-hover:border-primary/40")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 shrink-0 rounded-lg flex items-center justify-center", tone === "warning" ? "bg-warning-soft" : "bg-primary/10")}>
          <Icon className={cn("w-5 h-5", tone === "warning" ? "text-warning" : "text-primary")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate" title={title}>{title}</p>
          <p className={cn("mt-0.5 text-xl font-bold tracking-tight truncate", empty && "text-muted-foreground")}>{value}</p>
          {extra.length > 0 && <p className="text-xs text-muted-foreground truncate" title={extra.join(" · ")}>{extra.join(" · ")}</p>}
          {sub && <p className="text-xs text-muted-foreground leading-snug">{sub}</p>}
        </div>
      </div>
    </Card>
  );
  if (!to) return body;
  return (
    <Link to={to} aria-label={title} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      {body}
    </Link>
  );
}

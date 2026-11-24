import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * KPI kartica: ikonica u kvadratu, naslov, vrednost i badge promene u odnosu na prethodni period.
 * `to` = adresa FILTRIRANE izvorne liste (kartica postaje link: hover + tastatura).
 * `change` = { text, good } ili null (nema osnovice → badge se ne prikazuje).
 * `extra` = ostale valute ispod glavne vrednosti (valute se ne sabiraju, T28); `sub` = kratak opis obuhvata.
 * `empty` = nema podataka: vrednost je „—", ne izmišljena nula (spec §3.3).
 */
export default function KpiCard({ title, value, icon: Icon, tone = "primary", change, up = true, to, extra = [], sub, empty = false }) {
  const green = tone === "green";
  const card = (
    <Card className={cn("p-4 sm:p-5 h-full", to && "transition-all group-hover:shadow-md group-hover:border-primary/40 group-hover:-translate-y-0.5")}>
      <div className="flex items-center gap-4">
        <div className={cn("w-14 h-14 shrink-0 rounded-xl flex items-center justify-center", green ? "bg-success-soft" : "bg-primary/10")}>
          <Icon className={cn("w-6 h-6", green ? "text-success" : "text-primary")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground/80 leading-tight line-clamp-2" title={title}>{title}</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <p className={cn("text-2xl lg:text-[28px] leading-8 font-bold tracking-tight", empty && "text-muted-foreground")}>{value}</p>
            {change && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold", change.good ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive")}>
                {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {change.text}
              </span>
            )}
          </div>
          {extra.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground truncate" title={extra.join(" · ")}>{extra.join(" · ")}</p>}
          {sub && <p className="mt-0.5 text-xs text-muted-foreground truncate" title={sub}>{sub}</p>}
        </div>
      </div>
    </Card>
  );
  if (!to) return card;
  return (
    <Link
      to={to}
      aria-label={title}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}

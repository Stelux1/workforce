import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useL } from "@/lib/translations";
import { cn } from "@/lib/utils";

const TONES = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-warning-soft text-warning",
  info: "bg-primary/10 text-primary",
};

/**
 * Action Center (spec §3.3). `items` = actionItems(...) već filtrirane (samo count > 0): { key, count, tone, label, detail?, to }.
 * Svaka stavka vodi na filtriranu izvornu listu.
 */
export default function ActionCenter({ items, loading, error }) {
  const L = useL();
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          {L("Action Center", "Centar za akcije", "Centrum akcií")}
          {!loading && items.length > 0 && <span className="rounded-full bg-warning-soft text-warning text-xs font-semibold px-2 py-0.5">{items.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <>
            {error && (
              <p className="mb-2 flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {L("Some alerts could not be loaded.", "Neka upozorenja nisu učitana.", "Niektoré upozornenia sa nepodarilo načítať.")}
              </p>
            )}
            {items.length === 0 ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
                <CheckCircle2 className="w-4 h-4 text-success" />
                {L("Nothing needs your attention.", "Ništa ne traži vašu pažnju.", "Nič nevyžaduje vašu pozornosť.")}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {items.map((i) => (
                  <li key={i.key}>
                    <Link to={i.to} className="flex items-center gap-3 py-2.5 px-1 rounded-md hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <span className={cn("min-w-8 text-center rounded-full text-xs font-semibold px-2 py-0.5", TONES[i.tone] || TONES.info)}>{i.count}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{i.label}</span>
                        {i.detail && <span className="block text-xs text-muted-foreground truncate">{i.detail}</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

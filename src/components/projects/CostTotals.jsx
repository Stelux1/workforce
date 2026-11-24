// Zbir troškova: UVEK po valuti (T28). EUR ekvivalent je poseban red i samo za troškove sa kursom i datumom kursa.
import { useMemo } from "react";
import { AlertTriangle, Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { sortCurrencies } from "@/lib/finance/currency";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { costTotalsByCurrency, costsEurEquivalent, formatMoney } from "@/lib/projectCosts";

export default function CostTotals({ costs, T, lang, showBillable = false }) {
  const locale = intlLocale(lang);
  const totals = useMemo(() => costTotalsByCurrency(costs), [costs]);
  const currencies = sortCurrencies(Object.keys(totals));
  const eq = useMemo(() => costsEurEquivalent(costs), [costs]);
  const billable = useMemo(() => costTotalsByCurrency(costs.filter((c) => c.billable)), [costs]);
  const billableCurrencies = sortCurrencies(Object.keys(billable));
  const foreign = currencies.some((c) => c !== "EUR");

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        {currencies.length === 0 ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Coins className="w-4 h-4 text-primary" /></div>
            <p className="text-sm text-muted-foreground">{T.noTotal}</p>
          </div>
        ) : currencies.map((cur) => (
          <div key={cur} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 min-w-[12rem]">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Coins className="w-4 h-4 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{T.total} · {cur}</p>
              <p className="text-xl font-bold tabular-nums">{formatMoney(totals[cur], cur, locale)}</p>
            </div>
          </div>
        ))}
        {showBillable && billableCurrencies.length > 0 && (
          <div className="rounded-xl border border-dashed px-4 py-3 min-w-[12rem]" title={T.billableCandidatesHint}>
            <p className="text-xs text-muted-foreground">{T.billableCandidates}</p>
            {billableCurrencies.map((cur) => (
              <p key={cur} className="text-sm font-semibold tabular-nums">{formatMoney(billable[cur], cur, locale)}</p>
            ))}
          </div>
        )}
      </div>

      {foreign && (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs space-y-1">
          <p>
            <span className="font-medium">{T.eurEquivalent}:</span>{" "}
            <span className="tabular-nums font-semibold">{formatMoney(eq.eur, "EUR", locale)}</span>
            <span className="text-muted-foreground"> — {T.eurEquivalentHint}</span>
          </p>
          {eq.rates.length > 0 && (
            <p className="text-muted-foreground">
              {eq.rates.map((r) => `${r.currency}: ${r.unitsPerEur} / EUR (${formatIsoDate(r.rateDate, lang)})`).join(" · ")}
            </p>
          )}
          {eq.excluded.missingRate.length > 0 && (
            <p className="text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{T.excludedMissing(eq.excluded.missingRate.length)}</p>
          )}
          {eq.excluded.rateWithoutDate.length > 0 && (
            <p className="text-warning flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{T.excludedUndated(eq.excluded.rateWithoutDate.length)}</p>
          )}
        </div>
      )}
    </Card>
  );
}

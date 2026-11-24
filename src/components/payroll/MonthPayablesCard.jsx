// Mesečni obračun → obaveze istog meseca (spec §7, W2-E): koliko je obračunato kao obaveza (po B2C), isplaćeno i
// preostalo po valuti, i za direktne radnike poređenje obaveze sa iznosom „za isplatu" sa listića (D17/D21).
// Razliku Finance unosi kao korekciju sa razlogom na stranici obaveza. Vidi se samo uz payroll.view (RLS).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/AuthContext";
import { payablesTotals } from "@/lib/finance/payables";
import { currenciesOf, monthRange, netComparison, payableRows } from "@/lib/payroll/payablesList";
import { usePayablesLabels } from "./payablesLabels";
import { PayableStatusBadge, fetchByIds, money, personName } from "./payablesShared";

export default function MonthPayablesCard({ month, run, payslips = [] }) {
  const { T, lang } = usePayablesLabels();
  const { can } = useAuth();
  const { from, to } = monthRange(month);
  const q = useQuery({
    queryKey: ["payables", "month", from],
    enabled: can("payroll.view"),
    queryFn: async () => {
      const payables = await base44.entities.Payable.filter({ period_start: from, period_end: to }, "period_start");
      const ids = payables.map((p) => p.id);
      const [lines, payments] = await Promise.all([
        fetchByIds("PayableLine", "payable_id", ids, "created_date"),
        fetchByIds("Payment", "payable_id", ids, "payment_date"),
      ]);
      return { payables: payables.filter((p) => p.status !== "cancelled"), lines, payments };
    },
  });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => base44.entities.Employee.list("last_name"), enabled: can("payroll.view") });

  const rows = useMemo(() => (q.data ? payableRows(q.data.payables, { ...q.data, employees }) : []), [q.data, employees]);
  if (!can("payroll.view") || q.isLoading || q.isError) return null;

  const link = `/payroll/payables?from=${from}&to=${to}`;
  const totals = payablesTotals(rows.map((r) => r.payable), q.data.payments);
  const compare = rows
    .filter((r) => r.payeeType === "employee")
    .map((r) => ({ row: r, net: netComparison(r, { runs: run ? [run] : [], payslips }) }))
    .filter((x) => x.net && x.net.payout !== null && x.net.difference !== 0);

  return (
    <Card data-testid="month-payables">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{T.title}</CardTitle>
          <Link to={link} className="text-xs text-primary hover:underline inline-flex items-center gap-1">{T.view}<ArrowUpRight className="w-3 h-3" /></Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{T.empty}. {T.emptyHint}</p>
        ) : (
          <>
            {currenciesOf(rows).map((cur) => totals[cur] && (
              <div key={cur} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div><p className="text-xs text-muted-foreground">{T.calculated}</p><p className="font-semibold tabular-nums">{money(totals[cur].calculated, cur, lang)}</p></div>
                <div><p className="text-xs text-muted-foreground">{T.confirmed}</p><p className="font-semibold tabular-nums">{money(totals[cur].confirmed, cur, lang)}</p></div>
                <div><p className="text-xs text-muted-foreground">{T.paid}</p><p className="font-semibold tabular-nums text-success">{money(totals[cur].paid, cur, lang)}</p></div>
                <div><p className="text-xs text-muted-foreground">{T.remaining}</p><p className="font-semibold tabular-nums">{money(totals[cur].remaining, cur, lang)}</p></div>
              </div>
            ))}
            {compare.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{T.netHint}</p>
                <ul className="divide-y rounded-lg border">
                  {compare.map(({ row, net }) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="flex items-center gap-2">{personName(employees.find((e) => e.id === row.payeeId))}<PayableStatusBadge status={row.status} T={T} /></span>
                      <span className="tabular-nums text-xs">
                        {T.total}: {money(net.payable, row.currency, lang)} · {T.netPayout}: {money(net.payout, row.currency, lang)} ·{" "}
                        <span className="font-semibold text-warning">{T.netDiff}: {money(net.difference, row.currency, lang)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

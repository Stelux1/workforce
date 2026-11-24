// Prikaz Financial Report-a (spec §10, §2.2) — zajednički za karticu projekta i centralne Financial Reports.
// Sve brojke dolaze iz `financialReport(...)` (src/lib/payroll/projectReport.js → financialSummary). Ovde se samo
// prikazuje, po valuti (T28), uz odvojene sekcije za interni obračun i za novčane tokove (T17).
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BarChart2, Clock, Coins, Info, Lock, Receipt, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sortCurrencies } from "@/lib/finance/currency";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { formatMoney } from "@/lib/projectCosts";
import { problemMessage } from "@/lib/payroll/payrollMonth";
import { reportVisibility } from "@/lib/payroll/projectReport";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";

const BILLING_STATUS_LABEL = {
  in_preparation: ["In preparation", "U pripremi", "V príprave"],
  ready_for_accounting: ["Ready for accounting", "Spremno za knjigovodstvo", "Pripravené pre účtovníctvo"],
  sent_to_accounting: ["Sent to accounting", "Poslato knjigovodstvu", "Odoslané účtovníctvu"],
  invoiced_externally: ["Invoiced externally", "Fakturisano eksterno", "Fakturované externe"],
};
const PAY_STATUS_LABEL = {
  unpaid: ["Unpaid", "Neplaćeno", "Neuhradené"],
  partially_paid: ["Partially paid", "Delimično plaćeno", "Čiastočne uhradené"],
  paid: ["Paid", "Plaćeno", "Uhradené"],
};

function useMoney() {
  const { lang } = useLang();
  const locale = intlLocale(lang);
  return {
    lang,
    locale,
    m: (amount, cur) => formatMoney(amount, cur, locale),
    h: (n) => `${Number(n || 0).toLocaleString(locale, { maximumFractionDigits: 2 })} h`,
    pct: (n) => new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) / 100),
    d: (iso) => (iso ? formatIsoDate(String(iso).slice(0, 10), lang) : "—"),
  };
}

/** Iznosi po valuti, jedan ispod drugog. Prazno → „—". */
function MoneyList({ map, className = "" }) {
  const { m } = useMoney();
  const curs = sortCurrencies(Object.keys(map || {}));
  if (!curs.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex flex-col items-end tabular-nums ${className}`}>
      {curs.map((c) => <span key={c}>{m(map[c], c)}</span>)}
    </span>
  );
}

function Hidden() {
  const L = useL();
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={L("You do not have permission to see this amount.", "Nemate pravo da vidite ovaj iznos.", "Nemáte oprávnenie vidieť túto sumu.")}>
      <Lock className="w-3 h-3" />{L("hidden", "skriveno", "skryté")}
    </span>
  );
}

function SectionTitle({ icon: Icon, children, hint }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">{children}</h3>
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function EmptyFlow({ status, what = ["this data", "ove podatke", "tieto údaje"] }) {
  const L = useL();
  const text = {
    denied: L(`You do not have permission to see ${what[0]}.`, `Nemate pravo da vidite ${what[1]}.`, `Nemáte oprávnenie vidieť ${what[2]}.`),
    missing: L("No data — this module is not set up yet.", "Nema podataka — ovaj modul još nije uključen.", "Žiadne údaje — tento modul ešte nie je nastavený."),
    loading: L("Loading…", "Učitavanje…", "Načítava sa…"),
    error: L("Could not load the data.", "Podaci nisu učitani.", "Údaje sa nepodarilo načítať."),
    none: L("No data for the selected period and filters.", "Nema podataka za izabrani period i filtere.", "Žiadne údaje pre zvolené obdobie a filtre."),
    notAttributable: L("Not available for an employee or job role filter — billing and payouts are recorded per client/payee, not per worker or role.",
      "Nije dostupno uz filter radnika ili uloge — obračun klijentu i isplate se vode po klijentu/primaocu, ne po radniku ili ulozi.",
      "Nie je dostupné pri filtri pracovníka alebo pozície — vyúčtovanie a výplaty sa evidujú podľa klienta/príjemcu."),
  }[status];
  return (
    <p className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"} flex items-center gap-2`}>
      {status === "denied" ? <Lock className="w-4 h-4" /> : <Info className="w-4 h-4" />}{text}
    </p>
  );
}

// ───────────────────────── interni obračun ─────────────────────────

function SummaryTable({ summary, vis }) {
  const L = useL();
  const { m, pct } = useMoney();
  const curs = sortCurrencies(summary.currencies);
  const cols = [
    { key: "laborRevenue", label: L("Labor Revenue", "Prihod od rada", "Tržby z práce"), hint: L("Approved hours × B2B × client coefficient", "Odobreni sati × B2B × koeficijent klijenta", "Schválené hodiny × B2B × koeficient klienta") },
    { key: "payrollCost", label: L("Payroll Cost", "Trošak rada", "Mzdové náklady"), hint: L("Approved hours × B2C × worker coefficient — calculated, not paid; not gross 2", "Odobreni sati × B2C × koeficijent radnika — obračun, ne isplata; nije bruto 2", "Schválené hodiny × B2C × koeficient pracovníka — výpočet, nie výplata; nie hrubá mzda 2") },
    { key: "laborMargin", label: L("Labor Margin", "Marža rada", "Marža práce") },
    { key: "additionalCosts", label: L("Additional Costs", "Dodatni troškovi", "Dodatočné náklady") },
    { key: "netProfit", label: L("Net Project Profit", "Neto rezultat projekta", "Čistý výsledok projektu"), hint: L("Internal calculation", "Interni obračun", "Interný výpočet") },
    { key: "profitMargin", label: L("Profit Margin", "Profitna marža", "Zisková marža") },
  ];
  if (!curs.length) {
    return <p className="text-sm text-muted-foreground">{L("No approved hours or costs in the selected period.", "Nema odobrenih sati ni troškova u izabranom periodu.", "V zvolenom období nie sú schválené hodiny ani náklady.")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[720px]" data-testid="financial-summary-table">
        <thead>
          <tr className="text-xs text-muted-foreground border-b">
            <th className="text-left font-medium pb-2">{L("Currency", "Valuta", "Mena")}</th>
            {cols.map((c) => <th key={c.key} className="text-right font-medium pb-2 px-2" title={c.hint}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {curs.map((cur) => {
            const k = summary.byCurrency[cur];
            return (
              <tr key={cur} className="border-b last:border-0">
                <td className="py-2 font-semibold">{cur}</td>
                {cols.map((c) => {
                  if (!vis[c.key]) return <td key={c.key} className="py-2 px-2 text-right"><Hidden /></td>;
                  const v = k[c.key];
                  if (c.key === "profitMargin") {
                    return <td key={c.key} className="py-2 px-2 text-right tabular-nums">{v === null ? <span className="text-muted-foreground" title={L("Labor revenue is 0", "Prihod od rada je 0", "Tržby z práce sú 0")}>—</span> : pct(v)}</td>;
                  }
                  const tone = c.key === "netProfit" || c.key === "laborMargin" ? (v < 0 ? "text-destructive" : "text-success") : "";
                  return <td key={c.key} className={`py-2 px-2 text-right tabular-nums font-semibold ${tone}`}>{m(v, cur)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConvertedPanel({ converted, vis }) {
  const L = useL();
  const { m, d, pct } = useMoney();
  if (!converted) return null;
  const c = converted;
  const item = (key, label) => (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">
        {!vis[key] ? <Hidden /> : c[key] === null ? <span className="text-warning">{L("not calculated", "nije izračunato", "nevypočítané")}</span>
          : key === "profitMargin" ? pct(c[key]) : m(c[key], c.to)}
      </p>
    </div>
  );
  return (
    <div className="mt-4 rounded-xl border border-dashed p-3 space-y-3" data-testid="financial-converted">
      <p className="text-xs font-medium">
        {L(`Converted to ${c.to} at the rate valid on ${d(c.date)} — original amounts per currency stay above.`,
          `Preračunato u ${c.to} po kursu važećem na ${d(c.date)} — originalni iznosi po valuti ostaju gore.`,
          `Prepočítané na ${c.to} kurzom platným k ${d(c.date)} — pôvodné sumy podľa meny zostávajú vyššie.`)}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {item("laborRevenue", L("Labor Revenue", "Prihod od rada", "Tržby z práce"))}
        {item("payrollCost", L("Payroll Cost", "Trošak rada", "Mzdové náklady"))}
        {item("laborMargin", L("Labor Margin", "Marža rada", "Marža práce"))}
        {item("additionalCosts", L("Additional Costs", "Dodatni troškovi", "Dodatočné náklady"))}
        {item("netProfit", L("Net Project Profit", "Neto rezultat", "Čistý výsledok"))}
        {item("profitMargin", L("Profit Margin", "Profitna marža", "Zisková marža"))}
      </div>
      <ul className="text-xs space-y-1">
        {c.used.map((u) => (
          <li key={`${u.costId || ""}${u.currency}${u.rateDate}`} className="text-muted-foreground">
            {u.costId
              ? L(`Cost in ${u.currency}: rate recorded on the cost, 1 EUR = ${u.unitsPerEur} ${u.currency} (${d(u.rateDate)})`,
                `Trošak u ${u.currency}: kurs upisan uz trošak, 1 EUR = ${u.unitsPerEur} ${u.currency} (${d(u.rateDate)})`,
                `Náklad v ${u.currency}: kurz zapísaný pri náklade, 1 EUR = ${u.unitsPerEur} ${u.currency} (${d(u.rateDate)})`)
              : L(`Rate: 1 EUR = ${u.unitsPerEur} ${u.currency}, rate date ${d(u.rateDate)}${u.source ? ` (${u.source})` : ""}`,
                `Kurs: 1 EUR = ${u.unitsPerEur} ${u.currency}, datum kursa ${d(u.rateDate)}${u.source ? ` (${u.source})` : ""}`,
                `Kurz: 1 EUR = ${u.unitsPerEur} ${u.currency}, dátum kurzu ${d(u.rateDate)}${u.source ? ` (${u.source})` : ""}`)}
          </li>
        ))}
        {c.missing.map((cur) => (
          <li key={`missing-${cur}`} className="text-warning font-medium">
            {L(`${cur}: no exchange rate on or before ${d(c.date)} — not included in the ${c.to} total.`,
              `${cur}: nema kursa na dan ${d(c.date)} ili ranije — nije uključeno u zbir u ${c.to}.`,
              `${cur}: žiadny kurz k ${d(c.date)} alebo skôr — nie je zahrnuté v súčte v ${c.to}.`)}
          </li>
        ))}
        {c.costsWithoutRateDate.length > 0 && (
          <li className="text-warning font-medium">
            {L(`${c.costsWithoutRateDate.length} cost(s) have a rate without a date — not included in the EUR total.`,
              `${c.costsWithoutRateDate.length} trošak/troškova ima kurs bez datuma — nije uključeno u EUR zbir.`,
              `${c.costsWithoutRateDate.length} náklad(ov) má kurz bez dátumu — nie je zahrnuté v súčte EUR.`)}
          </li>
        )}
        {c.costsMissingRate.length > 0 && (
          <li className="text-warning font-medium">
            {L(`${c.costsMissingRate.length} cost(s) have no exchange rate — not included in the EUR total.`,
              `${c.costsMissingRate.length} trošak/troškova nema kurs — nije uključeno u EUR zbir.`,
              `${c.costsMissingRate.length} náklad(ov) nemá kurz — nie je zahrnuté v súčte EUR.`)}
          </li>
        )}
      </ul>
    </div>
  );
}

function CostRateIssues({ costs }) {
  const L = useL();
  const { m } = useMoney();
  const undated = sortCurrencies(Object.keys(costs.withoutRateDate || {}));
  const missing = sortCurrencies(Object.keys(costs.missingRate || {}));
  if (!undated.length && !missing.length) return null;
  return (
    <ul className="mt-3 text-xs space-y-1">
      {undated.map((cur) => (
        <li key={`u-${cur}`} className="text-warning">
          {m(costs.withoutRateDate[cur], cur)} · {L("rate without date — shown in its own currency, never in an EUR total", "kurs bez datuma — prikazano u svojoj valuti, nikad u EUR zbiru", "kurz bez dátumu — zobrazené vo vlastnej mene, nikdy v súčte EUR")}
        </li>
      ))}
      {missing.map((cur) => (
        <li key={`m-${cur}`} className="text-warning">
          {m(costs.missingRate[cur], cur)} · {L("no exchange rate recorded", "nema upisanog kursa", "bez zapísaného kurzu")}
        </li>
      ))}
    </ul>
  );
}

function Breakdown({ report, names, vis, scope }) {
  const L = useL();
  const { h } = useMoney();
  const dims = [
    scope === "central" && { key: "project", label: L("By project", "Po projektu", "Podľa projektu"), col: L("Project", "Projekat", "Projekt"), names: names.project },
    scope === "central" && { key: "client", label: L("By client", "Po klijentu", "Podľa klienta"), col: L("Client", "Klijent", "Klient"), names: names.client },
    { key: "employee", label: L("By employee", "Po radniku", "Podľa pracovníka"), col: L("Employee", "Radnik", "Pracovník"), names: names.employee },
    { key: "role", label: L("By job role", "Po ulozi", "Podľa pozície"), col: L("Job role", "Uloga", "Pozícia"), names: names.role },
  ].filter(Boolean);
  const none = L("Not set", "Nije upisano", "Nezadané");
  return (
    <Tabs defaultValue={dims[0].key}>
      <TabsList className="h-auto flex-wrap justify-start">
        {dims.map((d) => <TabsTrigger key={d.key} value={d.key}>{d.label}</TabsTrigger>)}
      </TabsList>
      {dims.map((d) => {
        const rows = report.breakdown[d.key] || [];
        const showCosts = d.key === "project" && vis.additionalCosts;
        return (
          <TabsContent key={d.key} value={d.key} className="mt-3">
            {rows.length === 0 ? <EmptyFlow status="none" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-medium pb-2">{d.col}</th>
                      <th className="text-right font-medium pb-2">{L("Approved hours", "Odobreni sati", "Schválené hodiny")}</th>
                      <th className="text-right font-medium pb-2">{L("Labor Revenue", "Prihod od rada", "Tržby z práce")}</th>
                      <th className="text-right font-medium pb-2">{L("Payroll Cost", "Trošak rada", "Mzdové náklady")}</th>
                      {showCosts && <th className="text-right font-medium pb-2">{L("Additional Costs", "Dodatni troškovi", "Dodatočné náklady")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={JSON.stringify(r.key)} className="border-b last:border-0 align-top">
                        <td className="py-2 font-medium">{r.key === null ? <span className="italic text-muted-foreground">{none}</span> : d.names.get(r.key) || <span className="text-muted-foreground">{String(r.key).slice(0, 8)}</span>}</td>
                        <td className="py-2 text-right tabular-nums">{h(r.hours)}</td>
                        <td className="py-2 text-right">{vis.laborRevenue ? <MoneyList map={r.revenue} /> : <Hidden />}</td>
                        <td className="py-2 text-right">{vis.payrollCost ? <MoneyList map={r.cost} /> : <Hidden />}</td>
                        {showCosts && <td className="py-2 text-right"><MoneyList map={r.additionalCosts} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {["role", "employee"].includes(d.key) && rows.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {L("Rows are rounded per worker and hour type; the sum of rows can differ from the total by a cent.",
                  "Redovi se zaokružuju po radniku i vrsti sati; zbir redova može odstupiti od ukupnog za cent.",
                  "Riadky sa zaokrúhľujú podľa pracovníka a druhu hodín; súčet riadkov sa môže od celku líšiť o cent.")}
              </p>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

// ───────────────────────── novčani tokovi (T17) ─────────────────────────

function BillingPanel({ flow, section, vis, names }) {
  const L = useL();
  const { m, d, h } = useMoney();
  const what = ["client billing", "obračun klijentu", "vyúčtovanie klientovi"];
  const body = () => {
    if (!vis.billing) return <EmptyFlow status="denied" what={what} />;
    if (flow.status !== "ok") return <EmptyFlow status={flow.status} what={what} />;
    if (!section) return <EmptyFlow status="missing" what={what} />;
    if (section.notAttributable) return <EmptyFlow status="notAttributable" />;
    const curs = sortCurrencies(Object.keys(section.totals));
    return (
      <div className="space-y-4">
        {curs.length === 0 ? <EmptyFlow status="none" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]" data-testid="financial-billing-totals">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left font-medium pb-2">{L("Currency", "Valuta", "Mena")}</th>
                  <th className="text-right font-medium pb-2">{L("Internal calculation", "Interni obračun", "Interný výpočet")}</th>
                  <th className="text-right font-medium pb-2">{L("Invoiced externally", "Eksterno fakturisano", "Externe fakturované")}</th>
                  <th className="text-right font-medium pb-2">{L("Received", "Primljeno", "Prijaté")}</th>
                  <th className="text-right font-medium pb-2">{L("Outstanding", "Otvoreno potraživanje", "Otvorená pohľadávka")}</th>
                  <th className="text-right font-medium pb-2" title={L("Calculated minus received, where no external invoice is recorded — not a confirmed receivable", "Obračunato minus primljeno, gde eksterni račun nije upisan — nije potvrđeno potraživanje", "Vypočítané mínus prijaté, kde nie je zapísaná externá faktúra — nie potvrdená pohľadávka")}>{L("Estimated unpaid", "Procenjeno nenaplaćeno", "Odhad neuhradené")}</th>
                </tr>
              </thead>
              <tbody>
                {curs.map((cur) => {
                  const t = section.totals[cur];
                  return (
                    <tr key={cur} className="border-b last:border-0">
                      <td className="py-2 font-semibold">{cur}</td>
                      <td className="py-2 text-right tabular-nums">{m(t.calculated, cur)}</td>
                      <td className="py-2 text-right tabular-nums">{m(t.invoiced, cur)}</td>
                      <td className="py-2 text-right tabular-nums text-success">{m(t.received, cur)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{m(t.outstanding, cur)}{t.overdue > 0 && <span className="block text-xs text-destructive">{L("overdue", "dospelo", "po splatnosti")} {m(t.overdue, cur)}</span>}</td>
                      <td className="py-2 text-right tabular-nums text-warning">{m(t.estimatedUnpaid, cur)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {section.rows.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-primary">{L(`Billing summaries (${section.rows.length})`, `Obračuni klijentu (${section.rows.length})`, `Vyúčtovania (${section.rows.length})`)}</summary>
            <ul className="mt-2 divide-y">
              {section.rows.map(({ summary: s, balance: b }) => (
                <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{names.client.get(s.client_id) || "—"}</span>
                    {s.project_id && <span className="text-muted-foreground"> · {names.project.get(s.project_id) || "—"}</span>}
                    <span className="text-muted-foreground"> · {d(s.period_start)} – {d(s.period_end)}</span>
                    <span className="ml-2 text-xs rounded-full bg-muted px-2 py-0.5">{L(...(BILLING_STATUS_LABEL[s.status] || [s.status, s.status, s.status]))}</span>
                    {s.ext_invoice_reference && <span className="ml-2 text-xs text-muted-foreground">{L("ext. invoice", "eksterni račun", "externá faktúra")} {s.ext_invoice_reference}</span>}
                  </span>
                  <span className="tabular-nums text-xs">
                    {b.calculated === null ? L("calculated when it leaves preparation", "iznos se zamrzava pri izlasku iz pripreme", "suma sa zmrazí pri opustení prípravy") : m(b.calculated, b.currency)}
                    {" · "}{L(...PAY_STATUS_LABEL[b.status])}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {section.clientWide.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {L(`${section.clientWide.length} billing summary(ies) cover all projects of the client — not attributed to this project:`,
              `${section.clientWide.length} obračun(a) obuhvata sve projekte klijenta — nije pripisano ovom projektu:`,
              `${section.clientWide.length} vyúčtovanie(í) pokrýva všetky projekty klienta — nepriradené k tomuto projektu:`)}{" "}
            {Object.entries(section.clientWideTotals).map(([cur, t]) => `${m(t.calculated, cur)}`).join(" · ")}
          </p>
        )}
        {section.unlinkedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {L("Client payments not linked to a billing summary", "Uplate klijenta nevezane za obračun", "Platby klienta nepriradené k vyúčtovaniu")}: <MoneyList map={section.unlinkedReceived} className="!inline-flex !flex-row gap-2" />
          </p>
        )}
        {vis.laborRevenue && Object.keys(section.unbilled.revenue).length > 0 && (
          <p className="text-xs">
            <span className="text-muted-foreground">{L("Approved work not yet in any billing summary", "Odobren rad koji još nije ni u jednom obračunu klijentu", "Schválená práca, ktorá ešte nie je v žiadnom vyúčtovaní")}: </span>
            <MoneyList map={section.unbilled.revenue} className="!inline-flex !flex-row gap-2 font-semibold" /> · {h(section.unbilled.hours)}
          </p>
        )}
      </div>
    );
  };
  return (
    <Card className="p-4 shadow-card">
      <SectionTitle icon={ArrowDownToLine} hint={L("Manually recorded external invoices and client payments — separate from the internal calculation. Teamora does not issue invoices.",
        "Ručno upisani eksterni računi i uplate klijenta — odvojeno od internog obračuna. Teamora ne izdaje fakture.",
        "Ručne zapísané externé faktúry a platby klienta — oddelene od interného výpočtu. Teamora nevystavuje faktúry.")}>
        {L("Client billing & payments received", "Obračun klijentu i primljene uplate", "Vyúčtovanie klientovi a prijaté platby")}
      </SectionTitle>
      {body()}
    </Card>
  );
}

function PayablesPanel({ flow, section, vis }) {
  const L = useL();
  const { m } = useMoney();
  const what = ["payroll payables", "obaveze i isplate", "záväzky a výplaty"];
  const body = () => {
    if (!vis.payables) return <EmptyFlow status="denied" what={what} />;
    if (flow.status !== "ok") return <EmptyFlow status={flow.status} what={what} />;
    if (!section) return <EmptyFlow status="missing" what={what} />;
    if (section.notAttributable) return <EmptyFlow status="notAttributable" />;
    const curs = sortCurrencies(Object.keys(section.totals));
    if (!curs.length) return <EmptyFlow status="none" />;
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]" data-testid="financial-payables-totals">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium pb-2">{L("Currency", "Valuta", "Mena")}</th>
                <th className="text-right font-medium pb-2">{L("Confirmed payables", "Potvrđene obaveze", "Potvrdené záväzky")}</th>
                <th className="text-right font-medium pb-2">{L("Paid", "Isplaćeno", "Vyplatené")}</th>
                <th className="text-right font-medium pb-2">{L("Remaining", "Preostalo", "Zostáva")}</th>
                <th className="text-right font-medium pb-2">{L("Drafts", "Nacrti", "Koncepty")}</th>
              </tr>
            </thead>
            <tbody>
              {curs.map((cur) => {
                const t = section.totals[cur];
                return (
                  <tr key={cur} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{cur}</td>
                    <td className="py-2 text-right tabular-nums">{m(t.confirmed, cur)}</td>
                    <td className="py-2 text-right tabular-nums text-success">{m(t.paid, cur)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{m(t.remaining, cur)}{t.overdue > 0 && <span className="block text-xs text-destructive">{L("overdue", "dospelo", "po splatnosti")} {m(t.overdue, cur)}</span>}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{t.draftCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {section.scopeShare && (
          <p className="text-xs text-muted-foreground">
            {L("Payable lines for this scope", "Stavke obaveza za ovaj obuhvat", "Položky záväzkov pre tento rozsah")}: <MoneyList map={section.scopeShare} className="!inline-flex !flex-row gap-2 font-semibold text-foreground" />
            {section.spansOtherScope && ` — ${L("some payables also include work outside the filter; paid/remaining are for the whole payable (a payment is not split).", "neke obaveze obuhvataju i rad van filtera; isplaćeno/preostalo važi za celu obavezu (isplata se ne deli).", "niektoré záväzky zahŕňajú aj prácu mimo filtra; vyplatené/zostáva platí pre celý záväzok (platba sa nedelí).")}`}
          </p>
        )}
      </div>
    );
  };
  return (
    <Card className="p-4 shadow-card">
      <SectionTitle icon={ArrowUpFromLine} hint={L("Actual payouts to workers and vendors — separate from Payroll Cost, which is the calculation from approved hours.",
        "Stvarne isplate radnicima i vendorima — odvojeno od troška rada, koji je obračun iz odobrenih sati.",
        "Skutočné výplaty pracovníkom a dodávateľom — oddelene od mzdových nákladov, ktoré sú výpočtom zo schválených hodín.")}>
        {L("Payroll payables & payments", "Obaveze prema radnicima i isplate", "Záväzky voči pracovníkom a výplaty")}
      </SectionTitle>
      {body()}
    </Card>
  );
}

// ───────────────────────── stranica ─────────────────────────

/**
 * @param {{report, names:{project:Map,client:Map,employee:Map,role:Map}, perms, flows:{billing:{status},payables:{status}},
 *   scope:'project'|'central', projectNames?: Map}} props
 */
export default function FinancialReportView({ report, names, perms, flows, scope = "central" }) {
  const L = useL();
  const { lang, m, h } = useMoney();
  const vis = reportVisibility(perms);
  const s = report.summary;
  const est = s.pendingEstimate;
  const problems = s.problems || [];
  const empNames = names.employee;
  const projNames = names.project;

  return (
    <div className="space-y-5">
      {/* Odobreni rad */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-4 h-4 text-primary" />{L("Approved hours", "Odobreni sati", "Schválené hodiny")}</div>
          <p className="text-2xl font-bold tabular-nums mt-1" data-testid="financial-approved-hours">{h(s.approvedHours)}</p>
        </Card>
        <Card className="p-4 shadow-card md:col-span-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Scale className="w-4 h-4 text-primary" />{L("Pending (submitted, not approved) — estimate, not included", "Na čekanju (predato, nije odobreno) — procena, nije uračunato", "Čaká (odovzdané, neschválené) — odhad, nezapočítané")}</div>
          <p className="text-sm mt-1 tabular-nums">
            {est.hours > 0 ? (
              <>
                <span className="font-semibold">{h(est.hours)}</span>
                {vis.laborRevenue && Object.keys(est.laborRevenue).length > 0 && <> · {L("revenue", "prihod", "tržby")} {Object.entries(est.laborRevenue).map(([c, v]) => m(v, c)).join(" · ")}</>}
                {vis.payrollCost && Object.keys(est.payrollCost).length > 0 && <> · {L("payroll cost", "trošak rada", "mzdové náklady")} {Object.entries(est.payrollCost).map(([c, v]) => m(v, c)).join(" · ")}</>}
              </>
            ) : <span className="text-muted-foreground">{L("None", "Nema", "Žiadne")}</span>}
          </p>
        </Card>
      </div>

      {/* Interni obračun po valuti */}
      <Card className="p-4 shadow-card">
        <SectionTitle icon={BarChart2} hint={L("Internal management calculation by currency. It is not an official accounting balance or a complete cash-flow statement.",
          "Interni menadžerski obračun po valuti. Nije zvanični računovodstveni bilans niti kompletan cash-flow izveštaj.",
          "Interný manažérsky výpočet podľa meny. Nie je to oficiálna účtovná súvaha ani úplný prehľad peňažných tokov.")}>
          {L("Profitability (internal calculation)", "Profitabilnost (interni obračun)", "Ziskovosť (interný výpočet)")}
        </SectionTitle>
        <SummaryTable summary={s} vis={vis} />
        {vis.payrollCost && s.missingCostRate > 0 && (
          <p className="text-xs text-warning mt-2">{L(`${s.missingCostRate} approved line(s) have no worker rate — not in Payroll Cost.`, `${s.missingCostRate} odobrenih linija nema tarifu radnika — nije u trošku rada.`, `${s.missingCostRate} schválených riadkov nemá sadzbu pracovníka — nie je v mzdových nákladoch.`)}</p>
        )}
        {vis.laborRevenue && s.missingRevenueRate > 0 && (
          <p className="text-xs text-warning mt-1">{L(`${s.missingRevenueRate} approved line(s) have no client rate — not in Labor Revenue.`, `${s.missingRevenueRate} odobrenih linija nema tarifu klijenta — nije u prihodu.`, `${s.missingRevenueRate} schválených riadkov nemá sadzbu klienta — nie je v tržbách.`)}</p>
        )}
        {report.costs.notAttributable && (
          <p className="text-xs text-muted-foreground mt-1">{L("Additional costs are not linked to a job role, so they are not included with a job role filter.", "Dodatni troškovi nisu vezani za ulogu, pa nisu uključeni uz filter uloge.", "Dodatočné náklady nie sú viazané na pozíciu, preto nie sú zahrnuté pri filtri pozície.")}</p>
        )}
        <CostRateIssues costs={report.costs} />
        <ConvertedPanel converted={s.converted} vis={vis} />
      </Card>

      {problems.length > 0 && (
        <Card className="p-4 border-warning/40 bg-warning-soft">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h3 className="font-semibold text-sm">{L("Timesheets not included — fix before relying on these numbers", "Satnice koje nisu uračunate — proverite pre nego što se oslonite na brojke", "Nezapočítané výkazy — skontrolujte pred použitím čísel")}</h3>
          </div>
          <ul className="space-y-1 text-xs list-disc pl-5">
            {problems.slice(0, 20).map((p, i) => (
              <li key={`${p.timesheetId}-${p.code}-${i}`}>{problemMessage({ ...p, employeeName: empNames.get(p.employeeId) || "—", projectName: projNames.get(p.projectId) }, lang)}</li>
            ))}
            {problems.length > 20 && <li>… +{problems.length - 20}</li>}
          </ul>
        </Card>
      )}

      {/* Razrada */}
      <Card className="p-4 shadow-card">
        <SectionTitle icon={Coins}>{L("Breakdown", "Razrada", "Rozpis")}</SectionTitle>
        <Breakdown report={report} names={names} vis={vis} scope={scope} />
      </Card>

      {/* Dodatni troškovi po kategoriji */}
      <Card className="p-4 shadow-card">
        <SectionTitle icon={Receipt} hint={L("Project costs in the period (by cost date). A cost already booked through payroll cannot be added again.", "Troškovi projekta u periodu (po datumu troška). Trošak već knjižen kroz obračun ne može se dodati ponovo.", "Náklady projektu v období (podľa dátumu nákladu). Náklad už zaúčtovaný cez mzdy nemožno pridať znova.")}>
          {L("Additional costs by category", "Dodatni troškovi po kategoriji", "Dodatočné náklady podľa kategórie")}
        </SectionTitle>
        {!vis.additionalCosts ? <EmptyFlow status="denied" what={["project costs", "troškove projekta", "náklady projektu"]} />
          : report.costs.byCategory.length === 0 ? <EmptyFlow status="none" /> : (
            <ul className="divide-y">
              {report.costs.byCategory.map((c) => (
                <li key={c.key} className="py-2 flex items-start justify-between gap-3 text-sm">
                  <span className="font-medium">{c.name || <span className="italic text-muted-foreground">{L("No category", "Bez kategorije", "Bez kategórie")}</span>} <span className="text-xs text-muted-foreground">({c.count})</span></span>
                  <MoneyList map={c.byCurrency} className="font-semibold" />
                </li>
              ))}
            </ul>
          )}
      </Card>

      {/* Novčani tokovi — odvojeno od obračuna (T17) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BillingPanel flow={flows.billing} section={report.billing} vis={vis} names={names} />
        <PayablesPanel flow={flows.payables} section={report.payables} vis={vis} />
      </div>
    </div>
  );
}

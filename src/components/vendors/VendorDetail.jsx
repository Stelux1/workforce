// Detalj vendora (spec §11): ugovorni periodi, povezani radnici i obaveze plaćanja.
// Ugovore menja ko menja vendore (employees.manage / engagement.manage — RLS vendor_contracts); obaveze se prikazuju
// samo uz payroll.view (bez prava sekcija ne postoji, a RLS payables ionako ne vraća redove).
import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Edit, ExternalLink, FileSignature, Plus, Trash2, Users, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import VendorContractDialog from "@/components/vendors/VendorContractDialog";
import { DueBadge, PayableStatusBadge, fetchByIds, money, periodText, personName } from "@/components/payroll/payablesShared";
import { usePayablesLabels } from "@/components/payroll/payablesLabels";
import { useAuth } from "@/lib/AuthContext";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { payableRows, dueState } from "@/lib/payroll/payablesList";
import {
  contractPayload, contractState, currentContract, sortContracts, vendorPayablesSummary, vendorPayablesUrl, vendorWorkers,
} from "@/lib/vendorOverview";

const todayIso = () => format(new Date(), "yyyy-MM-dd");

const STATE_CLASS = {
  active: "bg-success-soft text-success",
  upcoming: "bg-primary/10 text-primary",
  expired: "bg-warning-soft text-warning",
  ended: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function Section({ icon: Icon, title, action, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" aria-hidden />{title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }) {
  return <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

function Skeleton() {
  return <div className="h-16 animate-pulse rounded-lg bg-muted" />;
}

function ErrorLine({ error, L }) {
  return <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{L("Couldn't load", "Učitavanje nije uspelo", "Nepodarilo sa načítať")}: {error?.message}</p>;
}

export default function VendorDetail({ vendor, open, onOpenChange, onEdit, lang }) {
  const L = useL();
  const { T: PT } = usePayablesLabels();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("employees.manage") || can("engagement.manage");
  const canPayables = can("payroll.view");
  const today = todayIso();
  const vendorId = vendor?.id;
  const [contractForm, setContractForm] = useState(null);
  const [deleteContract, setDeleteContract] = useState(null);

  const date = (iso) => (iso ? formatIsoDate(iso, lang) : "—");

  const contractsQ = useQuery({
    queryKey: ["vendor-contracts", vendorId],
    enabled: open && !!vendorId,
    queryFn: () => base44.entities.VendorContract.filter({ vendor_id: vendorId }, "-start_date"),
  });
  const workersQ = useQuery({
    queryKey: ["vendor-workers", vendorId],
    enabled: open && !!vendorId,
    queryFn: async () => {
      const history = await base44.entities.EmploymentHistory.filter({ vendor_id: vendorId }, "-start_date");
      const employees = await fetchByIds("Employee", "id", history.map((h) => h.employee_id), "last_name");
      return { history, employees };
    },
  });
  const payablesQ = useQuery({
    queryKey: ["payables", "vendor", vendorId],
    enabled: open && !!vendorId && canPayables,
    queryFn: async () => {
      const payables = await base44.entities.Payable.filter({ vendor_id: vendorId }, "-period_start");
      const payments = await fetchByIds("Payment", "payable_id", payables.map((p) => p.id), "payment_date");
      return { payables, payments };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["vendor-contracts"] });
  };
  const saveContract = useMutation({
    mutationFn: (draft) => {
      const row = contractPayload({ ...draft, vendor_id: vendorId });
      const { id, ...data } = row;
      return id ? base44.entities.VendorContract.update(id, data) : base44.entities.VendorContract.create(data);
    },
    onSuccess: () => {
      invalidate();
      setContractForm(null);
      toast.success(L("Contract period saved", "Ugovorni period sačuvan", "Zmluvné obdobie bolo uložené"));
    },
  });
  const removeContract = useMutation({
    mutationFn: (id) => base44.entities.VendorContract.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success(L("Contract period deleted", "Ugovorni period obrisan", "Zmluvné obdobie bolo odstránené"));
    },
  });

  if (!vendor) return null;

  const contracts = sortContracts(contractsQ.data || []);
  const current = currentContract(contracts, today);
  const workers = workersQ.data ? vendorWorkers(workersQ.data.history, vendorId, { employees: workersQ.data.employees, today }) : null;
  const rows = payablesQ.data ? payableRows(payablesQ.data.payables, { payments: payablesQ.data.payments, vendors: [vendor], today }) : [];
  const summary = payablesQ.data ? vendorPayablesSummary(rows, today) : null;

  const stateLabel = {
    active: L("Active", "Aktivan", "Aktívna"),
    upcoming: L("Upcoming", "Predstoji", "Nadchádzajúca"),
    expired: L("Expired", "Istekao", "Vypršala"),
    ended: L("Ended", "Završen", "Ukončená"),
    cancelled: L("Cancelled", "Otkazan", "Zrušená"),
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto space-y-6">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <SheetTitle className="text-lg">{vendor.name}</SheetTitle>
                <SheetDescription>
                  {[vendor.vendor_id, vendor.legal_name, [vendor.city, vendor.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
                </SheetDescription>
              </div>
              {canManage && (
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onEdit}>
                  <Edit className="h-3.5 w-3.5" />{L("Edit", "Izmeni", "Upraviť")}
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-3 shadow-card">
              <p className="text-xs text-muted-foreground">{L("Active workers", "Aktivni radnici", "Aktívni pracovníci")}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{workers ? workers.activeCount : "…"}</p>
              {workers && <p className="text-xs text-muted-foreground">{L("of", "od", "z")} {workers.totalCount} {L("linked", "povezanih", "prepojených")}</p>}
            </div>
            <div className="rounded-lg border bg-card p-3 shadow-card">
              <p className="text-xs text-muted-foreground">{L("Current contract", "Važeći ugovor", "Platná zmluva")}</p>
              <p className="mt-0.5 truncate text-base font-semibold">{contractsQ.isLoading ? "…" : current?.reference || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {current ? `${date(current.start_date)} – ${current.end_date ? date(current.end_date) : L("open-ended", "bez roka", "neurčito")}` : L("No valid contract today", "Danas nema važećeg ugovora", "Dnes nie je platná žiadna zmluva")}
              </p>
            </div>
            {canPayables && (
              <div className="rounded-lg border bg-card p-3 shadow-card">
                <p className="text-xs text-muted-foreground">{L("Open payables", "Otvorene obaveze", "Otvorené záväzky")}</p>
                {summary ? (
                  summary.byCurrency.length ? summary.byCurrency.map((c) => (
                    <p key={c.currency} className="mt-0.5 text-base font-semibold tabular-nums">{money(c.remaining, c.currency, lang)}</p>
                  )) : <p className="mt-0.5 text-base font-semibold tabular-nums">{money(0, vendor.default_currency || "EUR", lang)}</p>
                ) : <p className="mt-0.5 text-base font-semibold">…</p>}
                {summary && summary.overdueCount > 0 && (
                  <p className="text-xs font-medium text-destructive">{summary.overdueCount} {L("overdue", "dospelo", "po splatnosti")}</p>
                )}
              </div>
            )}
          </div>

          {/* ───── ugovorni periodi ───── */}
          <Section
            icon={FileSignature}
            title={L("Contract periods", "Ugovorni periodi", "Zmluvné obdobia")}
            action={canManage && (
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={() => setContractForm({ vendor_id: vendorId, status: "active", currency: vendor.default_currency || "EUR", payment_terms_days: vendor.payment_terms_days ?? "", reference: contracts.length ? "" : vendor.contract_reference || "" })}>
                <Plus className="h-3.5 w-3.5" />{L("Add period", "Dodaj period", "Pridať obdobie")}
              </Button>
            )}
          >
            {contractsQ.isLoading ? <Skeleton /> : contractsQ.error ? <ErrorLine error={contractsQ.error} L={L} /> : contracts.length === 0 ? (
              <Muted>
                {L("No contract periods recorded.", "Nema evidentiranih ugovornih perioda.", "Žiadne zaznamenané zmluvné obdobia.")}
                {vendor.contract_reference && <> {L("Contract ref. on the vendor:", "Broj ugovora na dobavljaču:", "Č. zmluvy pri dodávateľovi:")} <span className="font-medium text-foreground">{vendor.contract_reference}</span></>}
              </Muted>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-3 py-2 font-medium">{L("Reference", "Broj", "Číslo")}</th>
                      <th className="px-3 py-2 font-medium">{L("Period", "Period", "Obdobie")}</th>
                      <th className="px-3 py-2 font-medium hidden sm:table-cell">{L("Terms", "Rok", "Splatnosť")}</th>
                      <th className="px-3 py-2 font-medium">{L("Status", "Status", "Stav")}</th>
                      {canManage && <th className="w-16 px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => {
                      const st = contractState(c, today);
                      return (
                        <tr key={c.id} className="border-b last:border-0 align-top">
                          <td className="px-3 py-2">
                            <p className="font-medium">{c.reference}</p>
                            {c.notes && <p className="text-xs text-muted-foreground line-clamp-2">{c.notes}</p>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">{date(c.start_date)} – {c.end_date ? date(c.end_date) : L("open-ended", "bez roka", "neurčito")}</td>
                          <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap">
                            {c.payment_terms_days != null ? `${c.payment_terms_days} ${L("days", "dana", "dní")}` : "—"} · {c.currency}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATE_CLASS[st]}`}>{stateLabel[st]}</span>
                          </td>
                          {canManage && (
                            <td className="px-2 py-1.5">
                              <div className="flex justify-end gap-0.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={L("Edit", "Izmeni", "Upraviť")}
                                  onClick={() => setContractForm({ ...c, vendor_id: vendorId, payment_terms_days: c.payment_terms_days ?? "", end_date: c.end_date || "" })}>
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={L("Delete", "Obriši", "Odstrániť")} onClick={() => setDeleteContract(c)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ───── povezani radnici ───── */}
          <Section icon={Users} title={`${L("Linked workers", "Povezani radnici", "Prepojení pracovníci")}${workers ? ` (${workers.activeCount}/${workers.totalCount})` : ""}`}>
            {workersQ.isLoading ? <Skeleton /> : workersQ.error ? <ErrorLine error={workersQ.error} L={L} /> : !workers?.totalCount ? (
              <Muted>{L("No workers are engaged through this vendor.", "Nijedan radnik nije angažovan preko ovog dobavljača.", "Cez tohto dodávateľa nie je zapojený žiadny pracovník.")}</Muted>
            ) : (
              <ul className="divide-y rounded-lg border">
                {workers.workers.map((w) => (
                  <li key={w.employeeId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link to={`/employees/${w.employeeId}`} className="font-medium hover:text-primary hover:underline">{personName(w.employee)}</Link>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        <CalendarRange className="mr-1 inline h-3 w-3" aria-hidden />
                        {date(w.start)} – {w.end ? date(w.end) : L("open-ended", "bez roka", "neurčito")}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${w.active ? "bg-success-soft text-success" : w.upcoming ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {w.active ? L("Active", "Aktivan", "Aktívny") : w.upcoming ? L("Starts later", "Počinje kasnije", "Začína neskôr") : L("Former", "Bivši", "Bývalý")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ───── obaveze plaćanja (payroll.view) ───── */}
          {canPayables && (
            <Section
              icon={Wallet}
              title={L("Payment obligations", "Obaveze plaćanja", "Platobné záväzky")}
              action={summary && rows.length > 0 && (
                <Button asChild size="sm" variant="ghost" className="gap-1.5">
                  <Link to={vendorPayablesUrl(vendorId, summary.openRows.length ? summary.openRows : rows, { onlyOpen: summary.openRows.length > 0 })}>
                    {L("Open in Payables", "Otvori u Obavezama", "Otvoriť v Záväzkoch")}<ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            >
              {payablesQ.isLoading ? <Skeleton /> : payablesQ.error ? <ErrorLine error={payablesQ.error} L={L} /> : !summary.openCount ? (
                <Muted>
                  {L("No open payables to this vendor.", "Nema otvorenih obaveza prema ovom dobavljaču.", "Voči tomuto dodávateľovi nie sú otvorené záväzky.")}
                  {summary.draftCount > 0 && <> {summary.draftCount} {L("draft(s) awaiting confirmation.", "u nacrtu čeka potvrdu.", "konceptov čaká na potvrdenie.")}</>}
                </Muted>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {summary.byCurrency.map((c) => (
                      <span key={c.currency} className="rounded-full bg-muted px-2.5 py-1">
                        {c.currency}: {L("remaining", "preostalo", "zostáva")} <b className="tabular-nums">{money(c.remaining, c.currency, lang)}</b>
                        {c.overdue > 0 && <> · <span className="text-destructive">{L("overdue", "dospelo", "po splatnosti")} <b className="tabular-nums">{money(c.overdue, c.currency, lang)}</b></span></>}
                      </span>
                    ))}
                    {summary.nextDue && <span className="rounded-full bg-muted px-2.5 py-1">{L("Next due", "Sledeće dospeće", "Najbližšia splatnosť")}: <b>{date(summary.nextDue)}</b></span>}
                  </div>
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left">
                          <th className="px-3 py-2 font-medium">{L("Period", "Period", "Obdobie")}</th>
                          <th className="px-3 py-2 text-right font-medium">{L("Remaining", "Preostalo", "Zostáva")}</th>
                          <th className="px-3 py-2 font-medium hidden sm:table-cell">{L("Due", "Dospeće", "Splatnosť")}</th>
                          <th className="px-3 py-2 font-medium">{L("Status", "Status", "Stav")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.openRows.map((r) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{periodText(r.periodStart, r.periodEnd, lang)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <p className="font-medium">{money(r.balance.remaining, r.currency, lang)}</p>
                              <p className="text-xs text-muted-foreground">{L("of", "od", "z")} {money(r.balance.total, r.currency, lang)}</p>
                            </td>
                            <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap">
                              <p>{date(r.dueDate)}</p>
                              <DueBadge state={dueState(r, today)} T={PT} />
                            </td>
                            <td className="px-3 py-2"><PayableStatusBadge status={r.status} T={PT} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Section>
          )}
        </SheetContent>
      </Sheet>

      <VendorContractDialog
        open={!!contractForm}
        onOpenChange={(o) => { if (!o) setContractForm(null); }}
        initial={contractForm}
        contracts={contractsQ.data || []}
        onSave={(draft) => saveContract.mutate({ ...draft, vendor_id: vendorId })}
        saving={saveContract.isPending}
      />
      <ConfirmDeleteDialog
        open={!!deleteContract}
        onClose={() => setDeleteContract(null)}
        onConfirm={() => removeContract.mutate(deleteContract.id)}
        message={L(
          "Delete this contract period? To keep the history, set it to Ended instead.",
          "Obrisati ugovorni period? Da bi istorija ostala, umesto toga ga postavite na Završen.",
          "Odstrániť toto zmluvné obdobie? Ak chcete zachovať históriu, nastavte ho radšej ako Ukončené.",
        )}
      />
    </>
  );
}

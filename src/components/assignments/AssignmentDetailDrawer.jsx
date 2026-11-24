// View Assignment (§4.1): detalji angažovanja, tarife (samo uz pravo) i History iz audit_log-a (§15.04) — izmene
// dodele i njenih tarifa sa razlogom, ulogom autora i vremenom. Akcije A2 samo uz assignments.manage (T06).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, CalendarX2, ExternalLink, History, Pencil } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { roleLabel } from "@/lib/permissions";
import { StatusPill } from "./status";
import { EmployeeCell, RateCell, formatRate } from "./AssignmentsTable";

function Item({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children || "—"}</dd>
    </div>
  );
}

const FIELD_LABELS = {
  project_role_id: ["Job role", "Job Role", "Pracovná rola"],
  position: ["Job role", "Job Role", "Pracovná rola"],
  start_date: ["Start date", "Početak", "Začiatok"],
  end_date: ["End date", "Kraj", "Koniec"],
  default_shift_id: ["Planned shift", "Planirana smena", "Plánovaná zmena"],
  notes: ["Notes", "Napomena", "Poznámka"],
  status: ["Status", "Status", "Stav"],
  ended_at: ["Ended", "Završeno", "Ukončené"],
  end_reason: ["End reason", "Razlog završetka", "Dôvod ukončenia"],
  effective_to: ["Valid to", "Važi do", "Platí do"],
  effective_from: ["Valid from", "Važi od", "Platí od"],
  amount: ["Amount", "Iznos", "Suma"],
  superseded_by: ["Replaced", "Zamenjena", "Nahradená"],
  engagement_type: ["Payee", "Primalac isplate", "Príjemca platby"],
  vendor_id: ["Vendor", "Dobavljač", "Dodávateľ"],
};
const HIDDEN_FIELDS = new Set(["updated_date", "ended_by", "employee_name", "project_name", "vendor_name", "change_reason", "rate_key", "position"]);

export default function AssignmentDetailDrawer({ open, onOpenChange, assignment, shifts = [], access, actions }) {
  const L = useL();
  const { lang } = useLang();
  const { can } = useAuth();
  const seeRates = access.seeB2B || access.seeB2C;
  const id = assignment?.id;

  const ratesQ = useQuery({
    queryKey: ["assignment-rates", id],
    queryFn: () => base44.entities.Rate.filter({ assignment_id: id, scope: "assignment" }, "-effective_from"),
    enabled: open && Boolean(id) && seeRates,
  });
  const rateIds = useMemo(() => (ratesQ.data || []).map((r) => r.id), [ratesQ.data]);
  const staff = useStaffDirectory();
  const historyQ = useQuery({
    queryKey: ["audit-log", "assignment", id, rateIds],
    queryFn: async () => {
      const [own, rateRows] = await Promise.all([
        base44.entities.AuditLog.filter({ table_name: "project_assignments", record_id: id }, "-occurred_at", 200),
        rateIds.length ? base44.entities.AuditLog.filter({ table_name: "rates", record_id: rateIds }, "-occurred_at", 200) : [],
      ]);
      return [...own, ...rateRows].sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
    },
    enabled: open && Boolean(id) && (!seeRates || !ratesQ.isLoading),
  });
  const sourceQ = useQuery({
    queryKey: ["project-assignments", "one", assignment?.source_assignment_id],
    queryFn: () => base44.entities.ProjectAssignment.filter({ id: assignment.source_assignment_id }),
    enabled: open && Boolean(assignment?.source_assignment_id),
  });

  if (!assignment) return null;
  const a = assignment;
  const shift = shifts.find((s) => s.id === a.default_shift_id);
  const source = sourceQ.data?.[0];
  const typeLabel = {
    standard: L("Standard", "Standardni", "Štandardné"),
    transfer: L("Transfer", "Transfer", "Presun"),
    additional: L("Additional", "Dodatni", "Ďalšie"),
    replacement: L("Replacement", "Zamena", "Zástup"),
  }[a.assignment_type || "standard"];
  const payee = a.vendor_name
    ? `${a.vendor_name} (${L("vendor", "dobavljač", "dodávateľ")})`
    : a.engagement_type === "direct_employee" ? L("Direct employee", "Direktno zaposlen", "Priamy zamestnanec") : null;
  const actionLabel = (x) => ({
    insert: L("Created", "Napravljeno", "Vytvorené"),
    update: L("Changed", "Izmenjeno", "Zmenené"),
    delete: L("Deleted", "Obrisano", "Odstránené"),
    status: L("Status changed", "Promena statusa", "Zmena stavu"),
    correction: L("Correction", "Korekcija", "Oprava"),
  }[x] || x);
  const fieldLabel = (f) => (FIELD_LABELS[f] ? L(...FIELD_LABELS[f]) : f);
  const when = (ts) => new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts));
  const manageable = access.canManage && a.displayStatus !== "cancelled";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-3 text-left">
          <SheetTitle className="sr-only">{L("Assignment details", "Detalji angažmana", "Detail pridelenia")}</SheetTitle>
          <div className="flex items-start justify-between gap-3 pr-6">
            <EmployeeCell row={a} />
            <StatusPill status={a.displayStatus} />
          </div>
          <SheetDescription>
            {L(`Status as of ${formatIsoDate(a.today, lang)} (project time zone).`, `Status na dan ${formatIsoDate(a.today, lang)} (vremenska zona projekta).`, `Stav k ${formatIsoDate(a.today, lang)} (časové pásmo projektu).`)}
          </SheetDescription>
        </SheetHeader>

        {manageable && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => actions.onEdit(a)}><Pencil className="h-4 w-4" />{L("Edit", "Izmeni", "Upraviť")}</Button>
            <Button size="sm" variant="outline" onClick={() => actions.onTransfer(a)}><ArrowRightLeft className="h-4 w-4" />{L("Reassign", "Preraspodeli", "Presunúť")}</Button>
            <Button size="sm" variant="outline" onClick={() => actions.onEnd(a)}><CalendarX2 className="h-4 w-4" />{L("End", "Završi", "Ukončiť")}</Button>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4">
          <Item label={L("Project", "Projekat", "Projekt")}>
            <Link to={`/projects/${a.project_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              {a.projectName}<ExternalLink className="h-3 w-3" />
            </Link>
          </Item>
          <Item label={L("Client", "Klijent", "Klient")}>{a.clientName}</Item>
          <Item label={L("Job role", "Job Role", "Pracovná rola")}>{a.roleName}</Item>
          <Item label={L("Planned shift", "Planirana smena", "Plánovaná zmena")}>
            {shift ? `${shift.code} · ${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)}` : null}
          </Item>
          <Item label={L("Start date", "Početak", "Začiatok")}>{formatIsoDate(a.start_date, lang)}</Item>
          <Item label={L("End date", "Kraj", "Koniec")}>{a.end_date ? formatIsoDate(a.end_date, lang) : L("Open-ended", "Bez kraja", "Na neurčito")}</Item>
          <Item label={L("Type", "Vrsta", "Typ")}>{typeLabel}</Item>
          <Item label={L("Payee", "Primalac isplate", "Príjemca platby")}>{payee}</Item>
          {a.source_assignment_id && (
            <Item label={L("Created from", "Nastao iz", "Vzniklo z")}>
              {source ? `${source.project_name} · ${formatIsoDate(source.start_date, lang)} → ${source.end_date ? formatIsoDate(source.end_date, lang) : "∞"}` : "…"}
            </Item>
          )}
          {a.end_reason && <Item label={L("End reason", "Razlog završetka", "Dôvod ukončenia")}>{a.end_reason}</Item>}
          {a.notes && <div className="col-span-2"><Item label={L("Notes", "Napomena", "Poznámka")}>{a.notes}</Item></div>}
        </dl>

        {seeRates && (
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">{L("Rates", "Tarife", "Sadzby")}</h3>
            <div className="grid grid-cols-2 gap-3">
              {access.seeB2C && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{L("B2C (worker)", "B2C (radnik)", "B2C (pracovník)")}</p>
                  <p className="mt-0.5 font-semibold"><RateCell value={a.b2c} lang={lang} L={L} /></p>
                </div>
              )}
              {access.seeB2B && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{L("B2B (client)", "B2B (klijent)", "B2B (klient)")}</p>
                  <p className="mt-0.5 font-semibold"><RateCell value={a.b2b} lang={lang} L={L} /></p>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {L("Rate on the reference date: today for current, start for upcoming, end for completed assignments.",
                "Tarifa na referentni dan: danas za važeće, početak za predstojeće, kraj za završene angažmane.",
                "Sadzba k referenčnému dňu: dnes pre aktuálne, začiatok pre nadchádzajúce, koniec pre ukončené.")}
            </p>
            {(ratesQ.data || []).length > 0 && (
              <ul className="mt-3 divide-y rounded-lg border text-sm">
                {ratesQ.data.filter((r) => (r.kind === "cost" ? access.seeB2C : access.seeB2B)).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">
                      {r.kind === "cost" ? "B2C" : "B2B"} · {formatIsoDate(r.effective_from, lang)} → {r.effective_to ? formatIsoDate(r.effective_to, lang) : "∞"}
                      {r.status !== "active" && ` · ${L("inactive", "neaktivna", "neaktívna")}`}
                    </span>
                    <span className="font-medium tabular-nums">{formatRate({ rate: r.amount, currency: r.currency }, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="mt-6">
          <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" />{L("History", "Istorija", "História")}</h3>
          {historyQ.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : historyQ.isError ? (
            <p className="text-sm text-destructive">{historyQ.error?.message}</p>
          ) : (historyQ.data || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{L("No recorded changes.", "Nema zabeleženih izmena.", "Žiadne zaznamenané zmeny.")}</p>
          ) : (
            <ol className="relative space-y-3 border-l pl-4">
              {historyQ.data.map((h) => {
                const fields = (h.changed_fields || []).filter((f) => !HIDDEN_FIELDS.has(f));
                const isRate = h.table_name === "rates";
                const data = h.new_data || h.old_data || {};
                return (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
                    <p className="text-sm font-medium">
                      {isRate ? `${data.kind === "cost" ? "B2C" : "B2B"} ${L("rate", "tarifa", "sadzba")} · ` : ""}{actionLabel(h.action)}
                      {fields.length > 0 && <span className="font-normal text-muted-foreground"> · {[...new Set(fields.map(fieldLabel))].join(", ")}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {when(h.occurred_at)}{staff.name(h.actor) ? ` · ${staff.name(h.actor)}` : ""}{h.actor_role ? ` · ${roleLabel(h.actor_role, lang)}` : ""}
                    </p>
                    {h.reason && <p className="mt-0.5 text-xs italic text-foreground/80">„{h.reason}"</p>}
                  </li>
                );
              })}
            </ol>
          )}
          {!can?.("audit.view") && (
            <p className="mt-3 text-xs text-muted-foreground">{L("You see the history your permissions allow.", "Vidite istoriju koju vam prava dozvoljavaju.", "Vidíte históriu, ktorú vám povoľujú oprávnenia.")}</p>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

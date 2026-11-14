import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { useL } from "@/lib/translations";
import { parseCoef, parseDailyHours } from "@/lib/coefficientInput";
import { useLang } from "@/lib/LanguageContext";

const TYPE_ORDER = ["redovni", "prekovremeni", "vikend", "praznik"];
const TYPE_LABELS = {
  redovni: { en: "Regular", rs: "Redovni" },
  prekovremeni: { en: "Overtime", rs: "Prekovremeni" },
  vikend: { en: "Weekend", rs: "Vikend" },
  praznik: { en: "Holiday", rs: "Praznik" },
};

const toText = (v) => (v === null || v === undefined ? "" : String(v));

function CoefficientsCard({ hourTypes, L }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({});

  useEffect(() => {
    const d = {};
    hourTypes.forEach((h) => { d[h.code] = { worker: toText(h.worker_coef), client: toText(h.client_coef) }; });
    setDraft(d);
  }, [hourTypes]);

  const rows = useMemo(
    () => TYPE_ORDER.map((code) => hourTypes.find((h) => h.code === code)).filter(Boolean),
    [hourTypes]
  );

  const save = useMutation({
    mutationFn: async () => {
      for (const h of rows) {
        if (h.code === "redovni") continue;
        const w = parseCoef(draft[h.code]?.worker);
        const c = parseCoef(draft[h.code]?.client);
        if (w.value !== (h.worker_coef ?? null) || c.value !== (h.client_coef ?? null)) {
          await base44.entities.HourType.update(h.code, { worker_coef: w.value, client_coef: c.value });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hour-types"] });
      toast.success(L("Coefficients saved", "Koeficijenti su sačuvani"));
    },
  });

  const hasInvalid = rows.some((h) => h.code !== "redovni" && (parseCoef(draft[h.code]?.worker).error || parseCoef(draft[h.code]?.client).error));
  const setField = (code, field, value) => setDraft((d) => ({ ...d, [code]: { ...d[code], [field]: value } }));

  const cell = (h, field) => {
    const text = draft[h.code]?.[field] ?? "";
    if (h.code === "redovni") {
      return <Input type="number" value="1" readOnly disabled className="w-28" aria-label={`${field} ${h.code}`} />;
    }
    const { error } = parseCoef(text);
    const empty = text.trim() === "";
    const bad = error || empty;
    return (
      <Input
        type="number" step="0.01" min="0.01" inputMode="decimal"
        value={text}
        onChange={(e) => setField(h.code, field, e.target.value)}
        aria-invalid={bad}
        data-testid={`coef-${h.code}-${field}`}
        className={`w-28 ${bad ? "border-red-500 bg-red-50 text-red-700 focus-visible:ring-red-500" : ""}`}
        aria-label={`${field} ${h.code}`}
      />
    );
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-base">{L("Coefficients by hour type", "Koeficijenti po vrsti sati")}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {L(
            "The worker coefficient multiplies the worker's hourly rate; the client coefficient multiplies the rate billed to the client. Regular is fixed at 1.",
            "Koeficijent radnika množi satnicu radnika, koeficijent klijenta množi satnicu koja se naplaćuje klijentu. Redovni je fiksno 1."
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-4 font-medium">{L("Hour type", "Vrsta sati")}</th>
              <th className="py-2 pr-4 font-medium">{L("Worker coefficient", "Koeficijent radnika")}</th>
              <th className="py-2 pr-4 font-medium">{L("Client coefficient", "Koeficijent klijenta")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const missing = h.code !== "redovni" && (draft[h.code]?.worker?.trim() === "" || draft[h.code]?.client?.trim() === "");
              return (
                <tr key={h.code} className="border-b last:border-0 align-top">
                  <td className="py-3 pr-4 font-medium">{L(TYPE_LABELS[h.code].en, TYPE_LABELS[h.code].rs)}</td>
                  <td className="py-3 pr-4">{cell(h, "worker")}</td>
                  <td className="py-3 pr-4">
                    {cell(h, "client")}
                    {missing && (
                      <p className="mt-1.5 flex items-start gap-1 text-xs text-red-600" data-testid={`coef-missing-${h.code}`}>
                        <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                        {L(
                          "Payroll for this hour type is blocked until both coefficients are entered.",
                          "Obračun za ovu vrstu sati je blokiran dok se ne unesu oba koeficijenta."
                        )}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasInvalid && (
        <p className="text-xs text-red-600">{L("A coefficient must be a number greater than 0.", "Koeficijent mora biti broj veći od 0.")}</p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={hasInvalid || save.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {L("Save coefficients", "Sačuvaj koeficijente")}
        </Button>
      </div>
    </Card>
  );
}

function DailyThresholdCard({ rules, L }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("8");
  useEffect(() => { if (rules) setText(toText(rules.daily_regular_hours)); }, [rules]);

  const value = parseDailyHours(text);
  const save = useMutation({
    mutationFn: () => base44.entities.WorkRules.update(true, { daily_regular_hours: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-rules"] });
      toast.success(L("Daily threshold saved", "Dnevni prag je sačuvan"));
    },
  });

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-base">{L("Daily threshold", "Dnevni prag")}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {L(
            "Hours worked on a weekday above this threshold count as overtime.",
            "Sati radnim danom iznad ovog praga računaju se kao prekovremeni."
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="daily-hours">{L("Regular hours per day", "Redovnih sati dnevno")}</Label>
          <Input
            id="daily-hours" type="number" step="0.25" min="0.25" max="24"
            value={text} onChange={(e) => setText(e.target.value)}
            aria-invalid={value === null}
            className={`w-28 ${value === null ? "border-red-500" : ""}`}
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={value === null || save.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {L("Save", "Sačuvaj")}
        </Button>
      </div>
      {value === null && (
        <p className="text-xs text-red-600">{L("Enter a number greater than 0 and at most 24.", "Unesite broj veći od 0, najviše 24.")}</p>
      )}
    </Card>
  );
}

function HolidaysCard({ holidays, L, lang }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [deleteDate, setDeleteDate] = useState(null);

  const sorted = useMemo(() => [...holidays].sort((a, b) => String(a.date).localeCompare(String(b.date))), [holidays]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["holidays"] });

  const add = useMutation({
    mutationFn: () => base44.entities.Holiday.create({ date, name: name.trim() }),
    onSuccess: () => {
      refresh();
      setDate("");
      setName("");
      toast.success(L("Holiday added", "Praznik je dodat"));
    },
  });
  const remove = useMutation({
    mutationFn: (d) => base44.entities.Holiday.delete(d),
    onSuccess: () => {
      refresh();
      toast.success(L("Holiday deleted", "Praznik je obrisan"));
    },
  });

  const fmt = (d) => {
    const [y, m, day] = String(d).split("-");
    return lang === "rs" ? `${day}.${m}.${y}.` : `${y}-${m}-${day}`;
  };
  const canAdd = date !== "" && name.trim() !== "";

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-base">{L("Holidays", "Praznici")}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {L("Hours worked on these dates are paid with the holiday coefficient.", "Sati odrađeni ovih datuma obračunavaju se sa koeficijentom za praznik.")}
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => { e.preventDefault(); if (canAdd) add.mutate(); }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="holiday-date">{L("Date", "Datum")}</Label>
          <Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1.5 flex-1 min-w-[12rem]">
          <Label htmlFor="holiday-name">{L("Name", "Naziv")}</Label>
          <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={L("e.g. Christmas", "npr. Božić")} />
        </div>
        <Button type="submit" disabled={!canAdd || add.isPending} className="gap-2">
          <Plus className="w-4 h-4" />
          {L("Add holiday", "Dodaj praznik")}
        </Button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{L("No holidays entered yet.", "Još nema unetih praznika.")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sorted.map((h) => (
            <li key={h.date} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-baseline gap-4 min-w-0">
                <span className="font-mono text-sm tabular-nums w-28 shrink-0">{fmt(h.date)}</span>
                <span className="text-sm truncate">{h.name}</span>
              </div>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setDeleteDate(h.date)}
                aria-label={L("Delete holiday", "Obriši praznik")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={deleteDate !== null}
        onClose={() => setDeleteDate(null)}
        onConfirm={() => remove.mutate(deleteDate)}
        message={L("Delete this holiday? Hours on this date will no longer count as holiday hours.", "Obrisati ovaj praznik? Sati tog datuma više se neće računati kao praznični.")}
      />
    </Card>
  );
}

export default function CoefficientsSettings() {
  const L = useL();
  const { lang } = useLang();

  const types = useQuery({ queryKey: ["hour-types"], queryFn: () => base44.entities.HourType.list("sort", 20) });
  const rules = useQuery({ queryKey: ["work-rules"], queryFn: () => base44.entities.WorkRules.list(null, 1) });
  const holidays = useQuery({ queryKey: ["holidays"], queryFn: () => base44.entities.Holiday.list("date", 1000) });

  const loading = types.isLoading || rules.isLoading || holidays.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Coefficients & Holidays", "Koeficijenti i praznici")}
        subtitle={L(
          "Pay multipliers by hour type, the daily overtime threshold and the holiday list",
          "Množioci po vrsti sati, dnevni prag za prekovremeni rad i lista praznika"
        )}
      />
      {loading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : (
        <>
          <CoefficientsCard hourTypes={types.data || []} L={L} />
          <DailyThresholdCard rules={(rules.data || [])[0]} L={L} />
          <HolidaysCard holidays={holidays.data || []} L={L} lang={lang} />
        </>
      )}
    </div>
  );
}

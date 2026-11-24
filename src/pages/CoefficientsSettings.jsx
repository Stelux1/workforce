import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, AlertTriangle, Save, Pencil, Check, X, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { useL } from "@/lib/translations";
import { coefToPercentText, parseDailyHours, parsePercentCoef } from "@/lib/coefficientInput";
import { missingDefaultHolidays } from "@/lib/europeanHolidays";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";

const TYPE_ORDER = ["redovni", "prekovremeni", "vikend", "praznik"];
const TYPE_LABELS = {
  redovni: { en: "Regular", rs: "Redovni", sk: "Bežné" },
  prekovremeni: { en: "Overtime", rs: "Prekovremeni", sk: "Nadčas" },
  vikend: { en: "Weekend", rs: "Vikend", sk: "Víkend" },
  praznik: { en: "Holiday", rs: "Praznik", sk: "Sviatok" },
};

const toText = (v) => (v === null || v === undefined ? "" : String(v));
// Isti koeficijent (baza vraća numeric(6,4), npr. 1.5000) — da se ne šalje izmena koja to nije.
const sameCoef = (next, stored) =>
  next === null ? stored === null || stored === undefined : stored !== null && stored !== undefined && Math.abs(Number(stored) - next) < 1e-9;

// Polje za procenat sa sufiksom „%" (spec §5: na ekranu 100% / 150%, u bazi 1.0 / 1.5).
function PercentInput({ className = "", ...props }) {
  return (
    <div className="relative w-28">
      <Input type="text" inputMode="decimal" autoComplete="off" className={`pr-8 ${className}`} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
    </div>
  );
}

function CoefficientsCard({ hourTypes, L }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({});

  useEffect(() => {
    const d = {};
    hourTypes.forEach((h) => { d[h.code] = { worker: coefToPercentText(h.worker_coef), client: coefToPercentText(h.client_coef) }; });
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
        const w = parsePercentCoef(draft[h.code]?.worker);
        const c = parsePercentCoef(draft[h.code]?.client);
        if (!sameCoef(w.value, h.worker_coef) || !sameCoef(c.value, h.client_coef)) {
          await base44.entities.HourType.update(h.code, { worker_coef: w.value, client_coef: c.value });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hour-types"] });
      toast.success(L("Coefficients saved", "Koeficijenti su sačuvani", "Koeficienty boli uložené"));
    },
  });

  const hasInvalid = rows.some((h) => h.code !== "redovni" && (parsePercentCoef(draft[h.code]?.worker).error || parsePercentCoef(draft[h.code]?.client).error));
  const setField = (code, field, value) => setDraft((d) => ({ ...d, [code]: { ...d[code], [field]: value } }));

  const cell = (h, field) => {
    const text = draft[h.code]?.[field] ?? "";
    if (h.code === "redovni") {
      return <PercentInput value="100" readOnly disabled aria-label={`${field} ${h.code}`} />;
    }
    const { error } = parsePercentCoef(text);
    const empty = text.trim() === "";
    const bad = error || empty;
    return (
      <PercentInput
        value={text}
        onChange={(e) => setField(h.code, field, e.target.value)}
        placeholder="150"
        aria-invalid={bad}
        data-testid={`coef-${h.code}-${field}`}
        className={bad ? "border-red-500 bg-red-50 text-red-700 focus-visible:ring-red-500" : ""}
        aria-label={`${field} ${h.code}`}
      />
    );
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-base">{L("Coefficients by hour type", "Koeficijenti po vrsti sati", "Koeficienty podľa druhu hodín")}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {L(
            "The worker coefficient multiplies the worker's hourly rate; the client coefficient multiplies the rate billed to the client. Entered as a percentage of the hourly rate (150% = 1.5 × rate). Regular is fixed at 100%.",
            "Koeficijent radnika množi satnicu radnika, koeficijent klijenta množi satnicu koja se naplaćuje klijentu. Unosi se kao procenat satnice (150% = 1,5 × satnica). Redovni je fiksno 100%.",
            "Koeficient zamestnanca násobí hodinovú sadzbu zamestnanca; koeficient klienta násobí sadzbu fakturovanú klientovi. Zadáva sa ako percento hodinovej sadzby (150 % = 1,5 × sadzba). Bežné hodiny majú pevne 100 %."
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-4 font-medium">{L("Hour type", "Vrsta sati", "Druh hodín")}</th>
              <th className="py-2 pr-4 font-medium">{L("Worker coefficient", "Koeficijent radnika", "Koeficient zamestnanca")}</th>
              <th className="py-2 pr-4 font-medium">{L("Client coefficient", "Koeficijent klijenta", "Koeficient klienta")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const missing = h.code !== "redovni" && (draft[h.code]?.worker?.trim() === "" || draft[h.code]?.client?.trim() === "");
              const label = TYPE_LABELS[h.code];
              return (
                <tr key={h.code} className="border-b last:border-0 align-top">
                  <td className="py-3 pr-4 font-medium">{L(label.en, label.rs, label.sk)}</td>
                  <td className="py-3 pr-4">{cell(h, "worker")}</td>
                  <td className="py-3 pr-4">
                    {cell(h, "client")}
                    {missing && (
                      <p className="mt-1.5 flex items-start gap-1 text-xs text-red-600" data-testid={`coef-missing-${h.code}`}>
                        <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                        {L(
                          "Payroll for this hour type is blocked until both coefficients are entered.",
                          "Obračun za ovu vrstu sati je blokiran dok se ne unesu oba koeficijenta.", "Zúčtovanie pre tento druh hodín je zablokované, kým sa nezadajú oba koeficienty."
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
        <p className="text-xs text-red-600">
          {L(
            "Enter a percentage greater than 0 and at most 1000, with up to 2 decimals (e.g. 150 or 150.5).",
            "Unesite procenat veći od 0, najviše 1000, sa najviše 2 decimale (npr. 150 ili 150,5).",
            "Zadajte percento väčšie ako 0, najviac 1000, s najviac 2 desatinnými miestami (napr. 150 alebo 150,5)."
          )}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={hasInvalid || save.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {L("Save coefficients", "Sačuvaj koeficijente", "Uložiť koeficienty")}
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
      toast.success(L("Daily threshold saved", "Dnevni prag je sačuvan", "Denný limit bol uložený"));
    },
  });

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-base">{L("Daily threshold", "Dnevni prag", "Denný limit")}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {L(
            "Hours worked on a weekday above this threshold count as overtime.",
            "Sati radnim danom iznad ovog praga računaju se kao prekovremeni.", "Hodiny odpracované v pracovný deň nad týmto limitom sa počítajú ako nadčas."
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="daily-hours">{L("Regular hours per day", "Redovnih sati dnevno", "Bežné hodiny za deň")}</Label>
          <Input
            id="daily-hours" type="number" step="0.25" min="0.25" max="24"
            value={text} onChange={(e) => setText(e.target.value)}
            aria-invalid={value === null}
            className={`w-28 ${value === null ? "border-red-500" : ""}`}
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={value === null || save.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {L("Save", "Sačuvaj", "Uložiť")}
        </Button>
      </div>
      {value === null && (
        <p className="text-xs text-red-600">{L("Enter a number greater than 0 and at most 24.", "Unesite broj veći od 0, najviše 24.", "Zadajte číslo väčšie ako 0, najviac 24.")}</p>
      )}
    </Card>
  );
}

function HolidaysCard({ holidays, L, lang }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [deleteDate, setDeleteDate] = useState(null);
  const [editing, setEditing] = useState(null); // { original, date, name }
  const thisYear = new Date().getFullYear();
  const [defaultsYear, setDefaultsYear] = useState(String(thisYear));
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

  const sorted = useMemo(() => [...holidays].sort((a, b) => String(a.date).localeCompare(String(b.date))), [holidays]);
  const taken = useMemo(() => new Set(holidays.map((h) => String(h.date).slice(0, 10))), [holidays]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["holidays"] });

  const add = useMutation({
    mutationFn: () => base44.entities.Holiday.create({ date, name: name.trim() }),
    onSuccess: () => {
      refresh();
      setDate("");
      setName("");
      toast.success(L("Holiday added", "Praznik je dodat", "Sviatok bol pridaný"));
    },
  });
  const remove = useMutation({
    mutationFn: (d) => base44.entities.Holiday.delete(d),
    onSuccess: () => {
      refresh();
      toast.success(L("Holiday deleted", "Praznik je obrisan", "Sviatok bol odstránený"));
    },
  });
  // Datum je ključ praznika: izmena datuma menja ključ istog reda (nema duplikata po datumu).
  const update = useMutation({
    mutationFn: ({ original, date: d, name: n }) => base44.entities.Holiday.update(original, { date: d, name: n.trim() }),
    onSuccess: () => {
      refresh();
      setEditing(null);
      toast.success(L("Holiday updated", "Praznik je izmenjen", "Sviatok bol upravený"));
    },
  });
  // Osnovni evropski praznici za izabranu godinu; datumi koji već postoje se preskaču (i njihov naziv ostaje).
  const addDefaults = useMutation({
    mutationFn: async (year) => {
      const missing = missingDefaultHolidays(year, holidays);
      for (const h of missing) await base44.entities.Holiday.create(h);
      return missing.length;
    },
    onSuccess: (count) => {
      refresh();
      if (count > 0) toast.success(`${L("Holidays added", "Dodato praznika", "Pridané sviatky")}: ${count}`);
      else toast.info(L("All default holidays for this year are already entered.", "Svi podrazumevani praznici za ovu godinu su već uneti.", "Všetky predvolené sviatky pre tento rok sú už zadané."));
    },
    onError: () => refresh(),
  });

  const fmt = (d) => formatIsoDate(d, lang);
  const canAdd = date !== "" && name.trim() !== "";
  const dateTaken = (d, original) => d !== original && taken.has(d);
  const editDuplicate = editing !== null && dateTaken(editing.date, editing.original);
  const canSaveEdit = editing !== null && editing.date !== "" && editing.name.trim() !== "" && !editDuplicate;
  const duplicateText = L("A holiday on this date already exists.", "Praznik za ovaj datum već postoji.", "Sviatok s týmto dátumom už existuje.");

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base">{L("Holidays", "Praznici", "Sviatky")}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {L("Hours worked on these dates are paid with the holiday coefficient. A holiday on a Saturday or Sunday uses the higher of the holiday and weekend coefficients, separately for worker and client — never both.", "Sati odrađeni ovih datuma obračunavaju se sa koeficijentom za praznik. Praznik u subotu ili nedelju dobija veći od koeficijenata za praznik i vikend, posebno za radnika i za klijenta — nikad oba.", "Hodiny odpracované v tieto dni sa platia so sviatočným koeficientom. Sviatok v sobotu alebo nedeľu dostane vyšší z koeficientov pre sviatok a víkend, zvlášť pre zamestnanca a klienta — nikdy oba.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={defaultsYear} onValueChange={setDefaultsYear}>
            <SelectTrigger className="w-24" aria-label={L("Year", "Godina", "Rok")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => addDefaults.mutate(Number(defaultsYear))} disabled={addDefaults.isPending}>
            <CalendarPlus className="w-4 h-4" />
            {L(`Add default European holidays for ${defaultsYear}`, `Dodaj osnovne evropske praznike za ${defaultsYear}.`, `Pridať základné európske sviatky na rok ${defaultsYear}`)}
          </Button>
        </div>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => { e.preventDefault(); if (canAdd && !taken.has(date)) add.mutate(); }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="holiday-date">{L("Date", "Datum", "Dátum")}</Label>
          <Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1.5 flex-1 min-w-[12rem]">
          <Label htmlFor="holiday-name">{L("Name", "Naziv", "Názov")}</Label>
          <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={L("e.g. Christmas", "npr. Božić", "napr. Vianoce")} />
        </div>
        <Button type="submit" disabled={!canAdd || taken.has(date) || add.isPending} className="gap-2">
          <Plus className="w-4 h-4" />
          {L("Add holiday", "Dodaj praznik", "Pridať sviatok")}
        </Button>
      </form>
      {date !== "" && taken.has(date) && <p className="text-xs text-red-600">{duplicateText}</p>}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{L("No holidays entered yet.", "Još nema unetih praznika.", "Zatiaľ nie sú zadané žiadne sviatky.")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sorted.map((h) =>
            editing?.original === h.date ? (
              <li key={h.date} className="px-4 py-2.5 space-y-1.5">
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); if (canSaveEdit) update.mutate(editing); }}
                >
                  <Input
                    type="date" value={editing.date} className="w-44 h-8"
                    onChange={(e) => setEditing((x) => ({ ...x, date: e.target.value }))}
                    aria-label={L("Date", "Datum", "Dátum")} aria-invalid={editDuplicate}
                  />
                  <Input
                    value={editing.name} className="flex-1 min-w-[10rem] h-8"
                    onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))}
                    aria-label={L("Name", "Naziv", "Názov")}
                  />
                  <Button type="submit" size="icon" className="h-8 w-8" disabled={!canSaveEdit || update.isPending} aria-label={L("Save", "Sačuvaj", "Uložiť")}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(null)} aria-label={L("Cancel", "Otkaži", "Zrušiť")}>
                    <X className="w-4 h-4" />
                  </Button>
                </form>
                {editDuplicate && <p className="text-xs text-red-600">{duplicateText}</p>}
              </li>
            ) : (
              <li key={h.date} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-baseline gap-4 min-w-0">
                  <span className="font-mono text-sm tabular-nums w-28 shrink-0">{fmt(h.date)}</span>
                  <span className="text-sm truncate">{h.name}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setEditing({ original: h.date, date: String(h.date).slice(0, 10), name: h.name || "" })}
                    aria-label={L("Edit holiday", "Izmeni praznik", "Upraviť sviatok")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteDate(h.date)}
                    aria-label={L("Delete holiday", "Obriši praznik", "Odstrániť sviatok")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={deleteDate !== null}
        onClose={() => setDeleteDate(null)}
        onConfirm={() => remove.mutate(deleteDate)}
        message={L("Delete this holiday? Hours on this date will no longer count as holiday hours.", "Obrisati ovaj praznik? Sati tog datuma više se neće računati kao praznični.", "Odstrániť tento sviatok? Hodiny v tento deň sa už nebudú počítať ako sviatočné.")}
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
        title={L("Coefficients & Holidays", "Koeficijenti i praznici", "Koeficienty a sviatky")}
        subtitle={L(
          "Pay multipliers by hour type, the daily overtime threshold and the holiday list",
          "Množioci po vrsti sati, dnevni prag za prekovremeni rad i lista praznika", "Násobky podľa druhu hodín, denný limit nadčasov a zoznam sviatkov"
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

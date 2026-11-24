// Pokrivenost po danu, ulozi i smeni: potrebno, planirano, odsutno, dostupno, manjak i višak. Klik na red otvara detalj.
import { useMemo, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmptyState from "@/components/shared/EmptyState";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { shiftTitle } from "./common";

const MAX_ROWS = 400;

export default function CoverageTable({ data, projectId, onSelect, initialFilter = "all" }) {
  const L = useL();
  const { lang } = useLang();
  const [filter, setFilter] = useState(initialFilter);
  const projectName = (id) => data.projects.find((p) => p.id === id)?.name || "—";
  const roleTitle = (id) => data.roles.find((r) => r.id === id)?.title || "—";
  const shiftOf = (id) => data.shifts.find((s) => s.id === id);

  const rows = useMemo(
    () => data.coverageRows.filter((r) => (filter === "deficit" ? r.deficit > 0 : filter === "surplus" ? r.surplus > 0 : true)),
    [data.coverageRows, filter]
  );

  if (!data.coverageRows.length) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState
          icon={CircleCheck}
          title={L("No coverage to calculate", "Nema pokrivenosti za izračun", "Žiadne pokrytie na výpočet")}
          description={L(
            "Coverage is calculated for days that have a required workforce. Add it on the Requirements tab.",
            "Pokrivenost se računa za dane koji imaju zadat potreban broj radnika. Dodajte ga na kartici Zahtevi.",
            "Pokrytie sa počíta pre dni so zadaným potrebným počtom pracovníkov. Pridajte ho na karte Požiadavky."
          )}
        />
      </div>
    );
  }

  const shown = rows.slice(0, MAX_ROWS);
  return (
    <div className="rounded-xl border bg-card shadow-card overflow-x-auto" data-testid="coverage-table">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">{L("Coverage", "Pokrivenost", "Pokrytie")}</h3>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("All days", "Svi dani", "Všetky dni")}</SelectItem>
            <SelectItem value="deficit">{L("Shortage only", "Samo manjak", "Iba nedostatok")}</SelectItem>
            <SelectItem value="surplus">{L("Surplus only", "Samo višak", "Iba prebytok")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {filter === "deficit"
            ? L("No shortages in this period.", "Nema manjka u ovom periodu.", "V tomto období nie je nedostatok.")
            : L("No surplus in this period.", "Nema viška u ovom periodu.", "V tomto období nie je prebytok.")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{L("Date", "Datum", "Dátum")}</TableHead>
              {!projectId && <TableHead>{L("Project", "Projekat", "Projekt")}</TableHead>}
              <TableHead>Job Role</TableHead>
              <TableHead>{L("Shift", "Smena", "Zmena")}</TableHead>
              <TableHead className="text-right">{L("Required", "Potrebno", "Potrebné")}</TableHead>
              <TableHead className="text-right">{L("Planned", "Planirano", "Plánované")}</TableHead>
              <TableHead className="text-right">{L("Absent", "Odsutno", "Neprítomní")}</TableHead>
              <TableHead className="text-right">{L("Available", "Dostupno", "Dostupné")}</TableHead>
              <TableHead className="text-right">{L("Shortage", "Manjak", "Nedostatok")}</TableHead>
              <TableHead className="text-right">{L("Surplus", "Višak", "Prebytok")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow
                key={`${r.projectRoleId}|${r.shiftId}|${r.date}`}
                className="cursor-pointer"
                tabIndex={0}
                onClick={() => onSelect({ projectId: r.projectId, projectRoleId: r.projectRoleId, date: r.date })}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect({ projectId: r.projectId, projectRoleId: r.projectRoleId, date: r.date })}
                data-testid={r.deficit > 0 ? "coverage-deficit-row" : undefined}
              >
                <TableCell className="whitespace-nowrap">{formatIsoDate(r.date, lang)}</TableCell>
                {!projectId && <TableCell className="whitespace-nowrap">{projectName(r.projectId)}</TableCell>}
                <TableCell className="font-medium">{roleTitle(r.projectRoleId)}</TableCell>
                <TableCell className="whitespace-nowrap">{shiftTitle(shiftOf(r.shiftId))}</TableCell>
                <TableCell className="text-right tabular-nums">{r.required}</TableCell>
                <TableCell className="text-right tabular-nums">{r.planned}</TableCell>
                <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                <TableCell className="text-right tabular-nums">{r.available}</TableCell>
                <TableCell className={`text-right tabular-nums font-semibold ${r.deficit > 0 ? "text-destructive" : "text-muted-foreground"}`}>{r.deficit}</TableCell>
                <TableCell className={`text-right tabular-nums ${r.surplus > 0 ? "text-success font-medium" : "text-muted-foreground"}`}>{r.surplus}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows.length > MAX_ROWS && (
        <p className="px-4 py-2 text-xs text-muted-foreground border-t">
          {L(`Showing the first ${MAX_ROWS} of ${rows.length} rows. Narrow the period or filter.`, `Prikazano prvih ${MAX_ROWS} od ${rows.length} redova. Suzite period ili filter.`, `Zobrazených prvých ${MAX_ROWS} z ${rows.length} riadkov. Zúžte obdobie alebo filter.`)}
        </p>
      )}
    </div>
  );
}

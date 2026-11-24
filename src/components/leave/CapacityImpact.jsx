// Uticaj odsustva na kapacitet (spec §14.1, T21): projekat, pozicija, datum/smena, potrebno, dostupno i tačan deficit.
// Redovi dolaze iz baze (RPC `leave_shortage` pre odluke ili `shortage_snapshot` posle nje) — isto pravilo kao
// leaveShortage() u src/lib/replacements.js.
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { shortageTotals } from "@/lib/replacements";
import { ErrorNote } from "./common";

// Naziv iz lokalnih podataka, a za projekat koji korisnik ne vidi (RLS) — naziv koji je poslala baza (`leave_shortage`).
const named = (local, fromDb) => (local && local !== "—" ? local : fromDb || local || "—");

export default function CapacityImpact({ rows, loading, error, lookups, snapshot = false }) {
  const L = useL();
  const { lang } = useLang();

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error) return <ErrorNote error={error} />;

  if (!rows?.length) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success" data-testid="capacity-ok">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          {snapshot
            ? L("No shortage was recorded at the time of the decision.", "U trenutku odluke nije bilo manjka.", "V čase rozhodnutia nebol zaznamenaný nedostatok.")
            : L("Approving this leave leaves no project short of workers.", "Odobravanjem ovog odsustva nijedan projekat ne ostaje bez dovoljno radnika.", "Schválením tejto neprítomnosti nebude žiadny projekt bez dostatku pracovníkov.")}
        </span>
      </div>
    );
  }

  const totals = shortageTotals(rows);
  return (
    <div className="space-y-2" data-testid="capacity-impact">
      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          {snapshot
            ? L(`At the time of the decision: ${totals.added} worker-shift(s) missing because of this leave (${totals.missing} in total) on ${totals.projects} project(s).`,
              `U trenutku odluke: zbog ovog odsustva nedostajalo je još ${totals.added} (radnik × smena), ukupno ${totals.missing}, na ${totals.projects} projekt(a).`,
              `V čase rozhodnutia: kvôli tejto neprítomnosti chýbalo ďalších ${totals.added} (pracovník × zmena), spolu ${totals.missing}, na ${totals.projects} projekt(och).`)
            : L(`If approved: ${totals.added} more worker-shift(s) missing (${totals.missing} in total) on ${totals.projects} project(s). The system does not reject leave because of this.`,
              `Ako se odobri: nedostaje još ${totals.added} (radnik × smena), ukupno ${totals.missing}, na ${totals.projects} projekt(a). Sistem zbog toga ne odbija odsustvo.`,
              `Ak sa schváli: chýba ďalších ${totals.added} (pracovník × zmena), spolu ${totals.missing}, na ${totals.projects} projekt(och). Systém kvôli tomu neprítomnosť nezamieta.`)}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{L("Project", "Projekat", "Projekt")}</th>
              <th className="px-3 py-2 text-left font-medium">{L("Position", "Pozicija", "Pozícia")}</th>
              <th className="px-3 py-2 text-left font-medium">{L("Date / shift", "Datum / smena", "Dátum / zmena")}</th>
              <th className="px-3 py-2 text-right font-medium">{L("Required", "Potrebno", "Potrebných")}</th>
              <th className="px-3 py-2 text-right font-medium">{L("Available", "Dostupno", "K dispozícii")}</th>
              <th className="px-3 py-2 text-right font-medium">{L("Shortage", "Deficit", "Deficit")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.projectId}|${r.projectRoleId}|${r.shiftId}|${r.date}`} className="border-t">
                <td className="px-3 py-2">{named(lookups.project(r.projectId), r.projectName)}</td>
                <td className="px-3 py-2">{named(lookups.role(r.projectRoleId), r.roleTitle)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatIsoDate(r.date, lang)} · {named(lookups.shift(r.shiftId), r.shiftName)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.required}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.available}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">
                  {r.deficit}
                  {r.deficitBefore > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({L(`${r.deficitBefore} already before`, `${r.deficitBefore} već pre`, `${r.deficitBefore} už predtým`)})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

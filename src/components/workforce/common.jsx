// Zajednički delovi ekrana Workforce Planning: boje i nazivi statusa, kratke oznake, poruka o grešci.
import { AlertTriangle } from "lucide-react";
import { describeError } from "@/api/errors";
import { useL } from "@/lib/translations";

// Boje isključivo iz Teamora tokena (D23).
export const STATUS_STYLE = {
  assigned: "bg-primary text-primary-foreground",
  available: "bg-success-soft text-success border border-success/30",
  standby: "bg-warning-soft text-warning border border-warning/40",
  leave: "bg-accent text-accent-foreground border border-primary/30",
  sick_leave: "bg-destructive/15 text-destructive border border-destructive/30",
  other_absence: "bg-muted text-muted-foreground border border-border",
  replacement: "bg-chart-2 text-primary-foreground",
};

export const STATUS_LETTER = { assigned: "A", available: "S", standby: "P", leave: "O", sick_leave: "B", other_absence: "X", replacement: "Z" };

export function useStatusLabel() {
  const L = useL();
  return (status) =>
    ({
      assigned: L("Assigned", "Raspoređen", "Pridelený"),
      available: L("Available", "Slobodan", "Voľný"),
      standby: L("Standby", "Pripravnost", "Pohotovosť"),
      leave: L("Leave", "Odsustvo", "Voľno"),
      sick_leave: L("Sick Leave", "Bolovanje", "PN / choroba"),
      other_absence: L("Other Absence", "Ostalo odsustvo", "Iná neprítomnosť"),
      replacement: L("Replacement", "Zamena", "Zástup"),
    })[status] || status;
}

export function ErrorNote({ error, onRetry }) {
  const L = useL();
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="flex-1">{describeError(error)}</span>
      {onRetry && (
        <button type="button" className="underline underline-offset-2 shrink-0" onClick={onRetry}>
          {L("Try again", "Pokušaj ponovo", "Skúsiť znova")}
        </button>
      )}
    </div>
  );
}

export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
export const shiftTitle = (shift) => (shift ? `${shift.name || shift.code} ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : "—");

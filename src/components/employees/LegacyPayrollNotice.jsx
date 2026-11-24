import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useT } from "@/lib/translations";
import { legacyProfilePayroll } from "@/lib/employeePrivate";

// Samo za admina: stare tarife / osnova / udeo iz profila radnika koje forma više ne prikazuje (zahtev 3),
// a obračun ih i dalje koristi (D4 poslednji nivo tarife, D5 posebne satnice, D17 osnova i udeo). Ništa skriveno.
export default function LegacyPayrollNotice({ employee, className = "" }) {
  const T = useT();
  const items = legacyProfilePayroll(employee);
  if (!items.length) return null;
  const fmt = (it) => {
    if (it.kind === "rate") return `${T(it.label)} €${it.value.toFixed(2)}`;
    if (it.kind === "basis") return `${T(it.label)}: ${T("Gross")}`;
    return `${T(it.label)}: ${Math.round(it.value * 1000) / 10}%`;
  };
  return (
    <Alert className={`border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 ${className}`}>
      <Info className="h-4 w-4 !text-amber-600" />
      <AlertDescription>
        <span className="font-medium">{T("Legacy profile rate set")}:</span>{" "}
        {items.map(fmt).join(" · ")} — {T("rates are now managed per project")}.{" "}
        <span className="text-amber-800/80 dark:text-amber-200/80">{T("These values still apply in payroll calculation.")}</span>
      </AlertDescription>
    </Alert>
  );
}

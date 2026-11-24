// Unos tarife angažmana (iznos po satu + valuta) — zajedničko za Edit i Reassign. Prikazuje se samo uz rates.manage;
// baza ionako odbija tarifu bez tog prava (set_rate / change_rate / assignment_rate_input).
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/rateEngine";

export const emptyRate = () => ({ amount: "", currency: "EUR" });

/** {amount, currency} za RPC ili null kad iznos nije unet. */
export const rateInput = (r) => (Number(r?.amount) > 0 ? { amount: Number(r.amount), currency: r.currency || "EUR" } : null);

export default function RateField({ id, label, hint, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} type="number" min="0" step="0.01" inputMode="decimal" value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })} className="flex-1" />
        <Select value={value.currency} onValueChange={(currency) => onChange({ ...value, currency })}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Ugovorni period vendora (spec §11): referenca, od/do, rok plaćanja, valuta, status, napomena.
// Iste provere kao baza (vendor_contracts, migracija 20261125180000) — baza ostaje konačna provera.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { useLang } from "@/lib/LanguageContext";
import { CONTRACT_CURRENCIES, overlappingContract, validateContract } from "@/lib/vendorOverview";

export default function VendorContractDialog({ open, onOpenChange, initial, contracts, onSave, saving }) {
  const L = useL();
  const { lang } = useLang();
  const [form, setForm] = useState(initial || {});
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial || {});
      setTouched(false);
    }
  }, [open, initial]);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const errors = validateContract(form, contracts);
  const conflict = errors.includes("overlap") ? overlappingContract(contracts, form) : null;
  const show = (k) => touched && errors.includes(k);

  const submit = () => {
    setTouched(true);
    if (errors.length) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? L("Edit contract period", "Izmena ugovornog perioda", "Upraviť zmluvné obdobie") : L("Add contract period", "Novi ugovorni period", "Pridať zmluvné obdobie")}</DialogTitle>
          <DialogDescription>
            {L("Active periods of the same vendor can't overlap.", "Aktivni periodi istog dobavljača ne smeju da se preklapaju.", "Aktívne obdobia toho istého dodávateľa sa nemôžu prekrývať.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label htmlFor="vc-ref">{L("Contract reference", "Broj ugovora", "Číslo zmluvy")} *</Label>
            <Input id="vc-ref" value={form.reference || ""} onChange={(e) => set("reference", e.target.value)} aria-invalid={show("reference")} />
            {show("reference") && <p className="text-xs text-destructive">{L("Enter the contract reference.", "Upišite broj ugovora.", "Zadajte číslo zmluvy.")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vc-start">{L("Start date", "Početak", "Začiatok")} *</Label>
            <Input id="vc-start" type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} aria-invalid={show("start_date")} />
            {show("start_date") && <p className="text-xs text-destructive">{L("Enter the start date.", "Upišite datum početka.", "Zadajte dátum začiatku.")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vc-end">{L("End date", "Kraj", "Koniec")}</Label>
            <Input id="vc-end" type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} aria-invalid={show("end_before_start")} />
            {show("end_before_start")
              ? <p className="text-xs text-destructive">{L("The end can't be before the start.", "Kraj ne može biti pre početka.", "Koniec nemôže byť pred začiatkom.")}</p>
              : <p className="text-xs text-muted-foreground">{L("Empty = open-ended", "Prazno = bez roka", "Prázdne = na dobu neurčitú")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vc-terms">{L("Payment terms (days)", "Rok plaćanja (dana)", "Splatnosť (dni)")}</Label>
            <Input id="vc-terms" type="number" min={0} max={365} step={1} value={form.payment_terms_days ?? ""}
              onChange={(e) => set("payment_terms_days", e.target.value)} aria-invalid={show("payment_terms_days")} />
            {show("payment_terms_days") && <p className="text-xs text-destructive">{L("Between 0 and 365 days.", "Između 0 i 365 dana.", "Od 0 do 365 dní.")}</p>}
          </div>
          <div className="space-y-2">
            <Label>{L("Currency", "Valuta", "Mena")}</Label>
            <Select value={form.currency || "EUR"} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>{L("Status", "Status", "Stav")}</Label>
            <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{L("Active", "Aktivan", "Aktívna")}</SelectItem>
                <SelectItem value="ended">{L("Ended", "Završen", "Ukončená")}</SelectItem>
                <SelectItem value="cancelled">{L("Cancelled", "Otkazan", "Zrušená")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-2">
            <Label htmlFor="vc-notes">{L("Notes", "Napomena", "Poznámky")}</Label>
            <Textarea id="vc-notes" rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        {touched && conflict && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
            {L("Overlaps the active contract", "Preklapa se sa aktivnim ugovorom", "Prekrýva sa s aktívnou zmluvou")} „{conflict.reference}“ ({formatIsoDate(conflict.start_date, lang)} – {conflict.end_date ? formatIsoDate(conflict.end_date, lang) : L("open-ended", "bez roka", "neurčito")}).
            {" "}{L("End that contract first or change the dates.", "Prvo završite taj ugovor ili promenite datume.", "Najprv ukončite túto zmluvu alebo zmeňte dátumy.")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("Cancel", "Otkaži", "Zrušiť")}</Button>
          <Button onClick={submit} disabled={saving}>{saving ? L("Saving…", "Čuvanje…", "Ukladá sa…") : L("Save", "Sačuvaj", "Uložiť")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

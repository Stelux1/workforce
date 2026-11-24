import { useEffect, useState } from "react";
import { Globe, Coins, Info, Save } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import { useL } from "@/lib/translations";
import { useAuth } from "@/lib/AuthContext";
import { CURRENCIES, LANGUAGES, useAppSettings } from "@/lib/AppSettingsContext";
import { showError } from "@/lib/errorToasts";

// Podešavanja → „Jezik i valuta" (samo admin, /settings je u src/lib/access.js). Jezik i valuta važe za celu aplikaciju
// i čuvaju se u bazi (app_settings, jedan red); čitaju svi prijavljeni, menja samo admin (RLS).
// D2: svi iznosi se vode u EUR i nema konverzije, pa je EUR jedina valuta koja se može izabrati.
export default function GeneralSettings() {
  const L = useL();
  const { isAdmin } = useAuth();
  const { language, currency, saveSettings } = useAppSettings();
  const [lang, setLang] = useState(language);
  const [cur, setCur] = useState(currency);
  const [saving, setSaving] = useState(false);

  // Početne vrednosti stižu iz baze posle učitavanja.
  useEffect(() => setLang(language), [language]);
  useEffect(() => setCur(currency), [currency]);

  const dirty = lang !== language || cur !== currency;

  const save = async () => {
    setSaving(true);
    const { error } = await saveSettings({ language: lang, currency: cur });
    setSaving(false);
    if (error) {
      showError(error);
      return;
    }
    toast.success(L("Settings saved", "Podešavanja su sačuvana", "Nastavenia boli uložené"));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Language & Currency", "Jezik i valuta", "Jazyk a mena")}
        subtitle={L(
          "The language and currency of the whole app. Only an admin can change them; everyone sees the same.",
          "Jezik i valuta cele aplikacije. Menja ih samo admin, a svi korisnici vide isto.",
          "Jazyk a mena celej aplikácie. Menia ich iba administrátori, všetci používatelia vidia to isté."
        )}
      />

      <Card className="p-6 space-y-6 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="app-language" className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            {L("Language", "Jezik", "Jazyk")}
          </Label>
          <Select value={lang} onValueChange={setLang} disabled={!isAdmin}>
            <SelectTrigger id="app-language" data-testid="app-language"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="app-currency" className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-muted-foreground" />
            {L("Currency", "Valuta", "Mena")}
          </Label>
          <Select value={cur} onValueChange={setCur} disabled={!isAdmin}>
            <SelectTrigger id="app-currency" data-testid="app-currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
              {/* D2: nema kursa, pa nema prikaza u RSD. */}
              <SelectItem value="RSD" disabled>RSD</SelectItem>
            </SelectContent>
          </Select>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {L(
              "Amounts are kept in EUR. RSD display comes with the monthly exchange rate (Monthly payroll).",
              "Iznosi se vode u EUR. Prikaz u RSD stiže kad se unese kurs za mesec (Mesečni obračun).",
              "Sumy sa vedú v EUR. Zobrazenie v RSD príde s mesačným kurzom (Mesačné zúčtovanie miezd)."
            )}
          </p>
        </div>

        {isAdmin ? (
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || saving} className="gap-2" data-testid="general-save">
              <Save className="w-4 h-4" />
              {saving ? L("Saving...", "Čuvanje...", "Ukladá sa...") : L("Save", "Sačuvaj", "Uložiť")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {L("Only an admin can change these settings.", "Ova podešavanja menja samo admin.", "Tieto nastavenia môže meniť iba administrátor.")}
          </p>
        )}
      </Card>
    </div>
  );
}

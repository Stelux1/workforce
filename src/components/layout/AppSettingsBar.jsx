import { Globe, DollarSign } from "lucide-react";
import { useAppSettings } from "@/lib/AppSettingsContext";
import { useLang } from "@/lib/LanguageContext";
import { cn } from "@/lib/utils";

const CURRENCIES = ["EUR", "RSD"];

export default function AppSettingsBar() {
  const { currency, updateCurrency } = useAppSettings();
  const { lang, setLang } = useLang();

  return (
    <div className="flex items-center gap-1">
      {/* Language */}
      <div className="flex items-center gap-1 bg-muted rounded-lg px-1 py-0.5">
        <Globe className="w-3.5 h-3.5 text-muted-foreground ml-1" />
        {["en", "rs"].map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-md transition-colors",
              lang === l
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Currency */}
      <div className="flex items-center gap-1 bg-muted rounded-lg px-1 py-0.5">
        <DollarSign className="w-3.5 h-3.5 text-muted-foreground ml-1" />
        {CURRENCIES.map((cur) => (
          <button
            key={cur}
            // D2: svi iznosi su u EUR i nema podrazumevanog kursa; RSD prikaz stiže sa kursom iz Mesečnog obračuna (Faza 3).
            disabled={cur !== "EUR"}
            title={cur !== "EUR" ? (lang === "rs" ? "Iznosi se vode u EUR. Prikaz u RSD stiže kad se unese kurs za mesec (Mesečni obračun)." : "Amounts are kept in EUR. RSD display comes with the monthly exchange rate (Monthly payroll).") : undefined}
            onClick={() => updateCurrency(cur)}
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              (currency === cur || (cur === "EUR" && currency !== "EUR"))
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cur}
          </button>
        ))}
      </div>
    </div>
  );
}
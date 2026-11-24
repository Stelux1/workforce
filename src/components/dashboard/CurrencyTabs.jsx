import { cn } from "@/lib/utils";

/** Izbor valute za grafikon/top liste kad podaci imaju više valuta (T28: valute se ne sabiraju). */
export default function CurrencyTabs({ currencies = [], value, onChange }) {
  if (currencies.length < 2) return null;
  return (
    <div role="tablist" className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {currencies.map((c) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={c === value}
          onClick={() => onChange?.(c)}
          className={cn("px-2 py-0.5 text-xs font-semibold rounded", c === value ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

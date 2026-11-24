import { AlertTriangle } from "lucide-react";

// Upozorenje kad je B2C (trošak radnika) veći od B2B (naplata klijentu) — spec §5. Samo upozorenje: tarife se ne menjaju.
export default function NegativeMarginNote({ L, compact = false }) {
  const text = L(
    "Negative labour margin: B2C rate is higher than B2B",
    "Negativna marža rada: B2C tarifa je veća od B2B",
    "Záporná marža práce: sadzba B2C je vyššia ako B2B"
  );
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600" data-testid="negative-margin" role="note">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        {text}
      </span>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700" data-testid="negative-margin" role="note">
      <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
      <span>{text}</span>
    </div>
  );
}

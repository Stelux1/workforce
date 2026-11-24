// Zajednički delovi ekrana Payables: status, iznos, učitavanje linija/uplata po obavezama, osvežavanje keša.
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { formatMoney } from "@/lib/projectCosts";

const STATUS_CLASS = {
  draft: "bg-muted text-muted-foreground border-border",
  unpaid: "bg-warning-soft text-warning border-transparent",
  partially_paid: "bg-primary/10 text-primary border-transparent",
  paid: "bg-success-soft text-success border-transparent",
  cancelled: "bg-muted text-muted-foreground border-border line-through",
};

export function PayableStatusBadge({ status, T, className }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_CLASS[status], className)}>
      {T[`st_${status}`] || status}
    </span>
  );
}

export function DueBadge({ state, T }) {
  if (!state || state === "not_due") return null;
  const cls = state === "overdue" ? "bg-destructive/10 text-destructive" : state === "due_soon" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", cls)}>{T[`due_${state}`]}</span>;
}

export const money = (amount, currency, lang) => formatMoney(amount, currency, intlLocale(lang));
export const isoDate = (iso, lang) => (iso ? formatIsoDate(iso, lang) : "—");
export const periodText = (from, to, lang) => `${isoDate(from, lang)} – ${isoDate(to, lang)}`;
export const personName = (e) => (e ? [e.first_name, e.last_name].filter(Boolean).join(" ").trim() || e.employee_id || "—" : "—");

const CHUNK = 150;
/** Redovi entiteta za listu id-eva (u delovima, da adresa zahteva ne preraste granicu). */
export async function fetchByIds(entity, field, ids, sort) {
  const list = [...new Set(ids || [])];
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) {
    const part = await base44.entities[entity].filter({ [field]: list.slice(i, i + CHUNK) }, sort);
    out.push(...part);
  }
  return out;
}

/** Posle svake izmene obaveze ili uplate osvežava se sve što zavisi od njih (lista, detalj, kontrolna tabla, mesec). */
export function invalidatePayables(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["payables"] });
  queryClient.invalidateQueries({ queryKey: ["payable-problems"] });
  queryClient.invalidateQueries({ queryKey: ["payables-due"] });
}

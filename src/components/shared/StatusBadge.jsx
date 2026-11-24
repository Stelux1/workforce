import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/LanguageContext";

const statusStyles = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  suspended: "bg-amber-100 text-amber-700 border-amber-200",
  on_leave: "bg-blue-100 text-blue-700 border-blue-200",
  terminated: "bg-red-100 text-red-700 border-red-200",
  present: "bg-emerald-100 text-emerald-700 border-emerald-200",
  absent: "bg-red-100 text-red-700 border-red-200",
  late: "bg-amber-100 text-amber-700 border-amber-200",
  half_day: "bg-blue-100 text-blue-700 border-blue-200",
  holiday: "bg-purple-100 text-purple-700 border-purple-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  delayed: "bg-amber-100 text-amber-700 border-amber-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  submitted: "bg-amber-100 text-amber-700 border-amber-200",
  todo: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  review: "bg-purple-100 text-purple-700 border-purple-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  valid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  expiring_soon: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-red-100 text-red-700 border-red-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-blue-100 text-blue-700 border-blue-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  urgent: "bg-red-100 text-red-700 border-red-200",
};

// Statusi na izabranom jeziku (ranije svuda engleski: „Active", „Pending", „Unknown"…).
const LABELS = {
  rs: {
    active: "Aktivan", inactive: "Neaktivan", suspended: "Suspendovan", on_leave: "Na odsustvu", terminated: "Otpušten",
    present: "Prisutan", absent: "Odsutan", late: "Kasni", half_day: "Pola dana", holiday: "Praznik",
    pending: "Na čekanju", approved: "Odobreno", rejected: "Odbijeno", paid: "Plaćeno", delayed: "Odloženo", cancelled: "Otkazano",
    draft: "Nacrt", submitted: "Poslato", todo: "Za uraditi", in_progress: "U toku", review: "Na pregledu", completed: "Završeno",
    valid: "Važi", expiring_soon: "Uskoro ističe", expired: "Istekao", no_expiry: "Bez roka", unknown: "Nepoznato",
    low: "Nizak", medium: "Srednji", high: "Visok", urgent: "Hitno", planned: "Planirano", ended: "Završeno", paused: "Pauziran",
  },
  sk: {
    active: "Aktívny", inactive: "Neaktívny", suspended: "Pozastavený", on_leave: "Na dovolenke", terminated: "Ukončený",
    present: "Prítomný", absent: "Neprítomný", late: "Mešká", half_day: "Pol dňa", holiday: "Sviatok",
    pending: "Čaká sa", approved: "Schválené", rejected: "Zamietnuté", paid: "Vyplatené", delayed: "Odložené", cancelled: "Zrušené",
    draft: "Koncept", submitted: "Odoslané", todo: "Na vykonanie", in_progress: "Rozpracované", review: "V kontrole", completed: "Dokončené",
    valid: "Platné", expiring_soon: "Čoskoro vyprší", expired: "Platnosť vypršala", no_expiry: "Bez skončenia platnosti", unknown: "Neznáme",
    low: "Nízka", medium: "Stredná", high: "Vysoká", urgent: "Naliehavá", planned: "Plánované", ended: "Ukončené", paused: "Pozastavené",
  },
  en: {
    active: "Active", inactive: "Inactive", suspended: "Suspended", on_leave: "On leave", terminated: "Terminated",
    present: "Present", absent: "Absent", late: "Late", half_day: "Half day", holiday: "Holiday",
    pending: "Pending", approved: "Approved", rejected: "Rejected", paid: "Paid", delayed: "Delayed", cancelled: "Cancelled",
    draft: "Draft", submitted: "Submitted", todo: "To do", in_progress: "In progress", review: "In review", completed: "Completed",
    valid: "Valid", expiring_soon: "Expiring soon", expired: "Expired", no_expiry: "No expiry", unknown: "Unknown",
    low: "Low", medium: "Medium", high: "High", urgent: "Urgent", planned: "Planned", ended: "Ended", paused: "Paused",
  },
};

export function statusLabel(status, lang) {
  const key = status || "unknown";
  return (LABELS[lang] || LABELS.en)[key] || key.replace(/_/g, " ");
}

export default function StatusBadge({ status }) {
  const { lang } = useLang();
  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", statusStyles[status] || "bg-muted text-muted-foreground")}>
      {statusLabel(status, lang)}
    </Badge>
  );
}

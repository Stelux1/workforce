// Zajednički delovi ekrana Leave Requests (spec §14): nazivi projekata/uloga/smena, oznake kategorija kandidata i
// objašnjenja (reasons iz src/lib/replacements.js) na tri jezika. Boje isključivo iz Teamora tokena (D23).
import { AlertTriangle } from "lucide-react";
import { describeError } from "@/api/errors";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { documentCategoryLabel } from "@/lib/documentCategories";

export const employeeName = (e) => (e ? [e.first_name, e.last_name].filter(Boolean).join(" ") || e.employee_name || "—" : "—");

/** Nazivi za prikaz iz učitanih redova (projekat, Job Role, smena, radnik). */
export function makeLookups({ projects = [], roles = [], shifts = [], employees = [] }) {
  const p = new Map(projects.map((x) => [x.id, x]));
  const r = new Map(roles.map((x) => [x.id, x]));
  const s = new Map(shifts.map((x) => [x.id, x]));
  const e = new Map(employees.map((x) => [x.id, x]));
  return {
    project: (id) => p.get(id)?.name || "—",
    role: (id) => r.get(id)?.title || "—",
    shift: (id) => {
      const x = s.get(id);
      return x ? `${x.name || x.code} ${String(x.start_time).slice(0, 5)}–${String(x.end_time).slice(0, 5)}` : "—";
    },
    employee: (id) => employeeName(e.get(id)),
    employeeRow: (id) => e.get(id) || null,
  };
}

export const CATEGORY_STYLE = {
  full_match: "bg-success-soft text-success",
  partial_availability: "bg-warning-soft text-warning",
  transfer_required: "bg-accent text-accent-foreground",
  not_eligible: "bg-muted text-muted-foreground",
};

export function useCategoryLabel() {
  const L = useL();
  return (c) =>
    ({
      full_match: L("Full Match", "Potpuno odgovara", "Úplná zhoda"),
      partial_availability: L("Partial Availability", "Delimično dostupan", "Čiastočne dostupný"),
      transfer_required: L("Transfer Required", "Potreban premeštaj", "Potrebný presun"),
      not_eligible: L("Not Eligible", "Ne ispunjava uslove", "Nespĺňa podmienky"),
    })[c] || c;
}

export function CategoryChip({ category }) {
  const label = useCategoryLabel();
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${CATEGORY_STYLE[category] || "bg-muted text-muted-foreground"}`}>
      {label(category)}
    </span>
  );
}

const DOC_STATUS = {
  missing: { en: "missing", rs: "nedostaje", sk: "chýba" },
  expired: { en: "expires before the end", rs: "ističe pre kraja", sk: "vyprší pred koncom" },
};

/** Objašnjenje jednog kriterijuma (reason iz rankCandidates) na jeziku korisnika. */
export function useReasonText(lookups) {
  const L = useL();
  const { lang } = useLang();
  const projects = (ids = []) => ids.map((id) => lookups.project(id)).join(", ");
  return (r) => {
    switch (r.code) {
      case "role_exact": return L("Same job role", "Ista Job Role", "Rovnaká pracovná rola");
      case "role_related": return L("Related position", "Srodna pozicija", "Príbuzná pozícia");
      case "role_mismatch": return L("No experience in this job role", "Nema iskustva na ovoj ulozi", "Bez skúseností v tejto role");
      case "inactive": return L("Employee is not active", "Radnik nije aktivan", "Zamestnanec nie je aktívny");
      case "free_all_days": return L(`Free on all ${r.days} day(s)`, `Slobodan svih ${r.days} dana`, `Voľný všetkých ${r.days} dní`);
      case "standby_all_days": return L(`On standby all ${r.days} day(s)`, `U pripravnosti svih ${r.days} dana`, `V pohotovosti všetkých ${r.days} dní`);
      case "standby_some_days": return L(`On standby ${r.days} day(s)`, `U pripravnosti ${r.days} dana`, `V pohotovosti ${r.days} dní`);
      case "free_some_days": return L(`Free ${r.free} of ${r.total} days`, `Slobodan ${r.free} od ${r.total} dana`, `Voľný ${r.free} z ${r.total} dní`);
      case "busy_days": return L(`Scheduled elsewhere ${r.days} day(s): ${projects(r.projectIds)}`, `Raspoređen drugde ${r.days} dana: ${projects(r.projectIds)}`, `Inde naplánovaný ${r.days} dní: ${projects(r.projectIds)}`);
      case "leave_days": return L(`On leave ${r.days} day(s)`, `Na odsustvu ${r.days} dana`, `Neprítomný ${r.days} dní`);
      case "already_covering": return L("Already works this shift", "Već radi u ovoj smeni", "Už pracuje v tejto zmene");
      case "certificates_ok": return L("Role certificates in order", "Sertifikati za ulogu u redu", "Certifikáty pre rolu v poriadku");
      case "certificates_missing": return L(
        `Missing certificates: ${r.types.map((t) => documentCategoryLabel(t, lang)).join(", ")}`,
        `Nedostaju sertifikati: ${r.types.map((t) => documentCategoryLabel(t, lang)).join(", ")}`,
        `Chýbajú certifikáty: ${r.types.map((t) => documentCategoryLabel(t, lang)).join(", ")}`);
      case "readiness_ok": return L("Ready for onboarding", "Spreman za onboarding", "Pripravený na onboarding");
      case "readiness_missing": return L(`Onboarding: ${r.count} document(s) missing`, `Onboarding: nedostaje ${r.count} dok.`, `Onboarding: chýba ${r.count} dok.`);
      case "location_match": return L("Same location", "Ista lokacija", "Rovnaká lokalita");
      case "location_different": return L("Different location", "Druga lokacija", "Iná lokalita");
      case "location_unknown": return L("Location unknown", "Lokacija nepoznata", "Lokalita neznáma");
      case "b2c": return L(`B2C ${r.rate} ${r.currency}/h`, `B2C ${r.rate} ${r.currency}/h`, `B2C ${r.rate} ${r.currency}/h`);
      case "b2c_missing": return L("No B2C rate", "Nema B2C tarife", "Bez B2C sadzby");
      case "source_shortage": return L(
        `Leaving creates a shortage of ${r.missing} on ${projects(r.projectIds)}`,
        `Odlazak pravi manjak ${r.missing} na ${projects(r.projectIds)}`,
        `Odchod spôsobí nedostatok ${r.missing} na ${projects(r.projectIds)}`);
      default: return r.code;
    }
  };
}

/** Pozitivan / negativan / neutralan ton objašnjenja (za boju čipa). */
export function reasonTone(code) {
  if (["role_exact", "free_all_days", "standby_all_days", "certificates_ok", "readiness_ok", "location_match"].includes(code)) return "good";
  if (["role_mismatch", "inactive", "leave_days", "already_covering", "certificates_missing", "readiness_missing", "source_shortage", "b2c_missing"].includes(code)) return "bad";
  return "neutral";
}

export function MissingDocs({ items }) {
  const { lang } = useLang();
  if (!items?.length) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((m) => (
        <li key={`${m.documentType}-${m.status}`} className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
          {documentCategoryLabel(m.documentType, lang)}: {(DOC_STATUS[m.status] || DOC_STATUS.missing)[lang] || DOC_STATUS.missing.en}
          {m.expirationDate ? ` (${formatIsoDate(m.expirationDate, lang)})` : ""}
        </li>
      ))}
    </ul>
  );
}

/** Poruka greške za korisnika (greške iz base44 sloja su već prevedene). */
export const errorText = (error) => (error?.isDataError ? error.message : describeError(error).text);

export function ErrorNote({ error }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{errorText(error)}</span>
    </div>
  );
}

// Tekst problema iz `payable_problems` (Payables → Needs attention) na jeziku korisnika, umesto sirove šifre.
// `labor_problem.detail` dolazi iz `labor_day_problems` kao „šifra" ili „šifra: vrste sati" (npr. „missing_rate: vikend").
// Svaka poruka kaže i šta korisnik treba da uradi.

const HOUR_TYPES = {
  en: { redovni: "regular", prekovremeni: "overtime", vikend: "weekend", praznik: "holiday", praznik_vikend: "holiday on weekend" },
  rs: { redovni: "redovni", prekovremeni: "prekovremeni", vikend: "vikend", praznik: "praznik", praznik_vikend: "praznik vikendom" },
  sk: { redovni: "bežné", prekovremeni: "nadčas", vikend: "víkend", praznik: "sviatok", praznik_vikend: "sviatok cez víkend" },
};

const TEXT = {
  en: {
    no_project: () => "the timesheet is not linked to a project from the list — link it to a project in Timesheets",
    no_snapshot: () => "the approved timesheet has no saved rate calculation (approved before rate snapshots) — return it to draft with a reason and approve it again",
    snapshot_mismatch: () => "the saved calculation doesn't match the hours per day — return the timesheet to draft with a reason and approve it again",
    missing_rate: (t) => `no rate for hour type ${t} — Finance enters the rate in Project Assignments / Rate History, then the timesheet is approved again`,
    missing_coef: (t) => `missing coefficient for hour type ${t} — an admin enters it in Settings → Coefficients & Holidays, then the timesheet is approved again`,
    unknown: (c) => `calculation problem (${c}) — open the timesheet and check the rates and hours`,
  },
  rs: {
    no_project: () => "satnica nije vezana za projekat sa liste — povežite je sa projektom u Radnim satima",
    no_snapshot: () => "odobrena satnica nema sačuvan obračun tarife (odobrena pre snimka tarifa) — vratite je u nacrt uz razlog i ponovo odobrite",
    snapshot_mismatch: () => "sačuvani obračun se ne slaže sa satima po danima — vratite satnicu u nacrt uz razlog i ponovo je odobrite",
    missing_rate: (t) => `nema tarife za vrstu sati ${t} — Finance upisuje tarifu u Angažmani na projektima / Rate History, pa se satnica ponovo odobrava`,
    missing_coef: (t) => `nedostaje koeficijent za vrstu sati ${t} — admin ga upisuje u Podešavanja → Koeficijenti i praznici, pa se satnica ponovo odobrava`,
    unknown: (c) => `problem u obračunu (${c}) — otvorite satnicu i proverite tarife i sate`,
  },
  sk: {
    no_project: () => "výkaz nie je prepojený s projektom zo zoznamu — prepojte ho s projektom v Pracovných výkazoch",
    no_snapshot: () => "schválený výkaz nemá uložený výpočet sadzby (schválený pred snímkou sadzieb) — vráťte ho do konceptu s dôvodom a znova schváľte",
    snapshot_mismatch: () => "uložený výpočet nesedí s hodinami po dňoch — vráťte výkaz do konceptu s dôvodom a znova ho schváľte",
    missing_rate: (t) => `chýba sadzba pre typ hodín ${t} — Finance zadá sadzbu v Pridelenia na projektoch / Rate History a výkaz sa znova schváli`,
    missing_coef: (t) => `chýba koeficient pre typ hodín ${t} — administrátor ho zadá v Nastavenia → Koeficienty a sviatky a výkaz sa znova schváli`,
    unknown: (c) => `problém vo výpočte (${c}) — otvorte výkaz a skontrolujte sadzby a hodiny`,
  },
};

/** „missing_rate: vikend, praznik" → lokalizovan opis sa uputstvom. */
export function laborProblemText(detail, lang = "rs") {
  const T = TEXT[lang] || TEXT.rs;
  const raw = String(detail || "").trim();
  const i = raw.indexOf(":");
  const code = (i >= 0 ? raw.slice(0, i) : raw).trim();
  const rest = i >= 0 ? raw.slice(i + 1).trim() : "";
  const types = rest
    ? rest.split(",").map((s) => s.trim()).filter(Boolean).map((h) => (HOUR_TYPES[lang] || HOUR_TYPES.rs)[h] || h).join(", ")
    : "—";
  return T[code] ? T[code](types) : T.unknown(raw || "?");
}

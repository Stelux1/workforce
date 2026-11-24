// Obaveštenja (spec v1.4 §15.01; docs/TEAMORA-DATA-MODEL.md §2.13).
// Redove upisuje baza (`refresh_notifications()`): svaki ima `type`, `severity`, `event_key`, `entity_table`, `entity_id`
// i strukturirani `payload`. Ovde su tipovi, tekstovi na tri jezika iz `payload`-a, adresa na koju vodi obaveštenje,
// „pročitano po korisniku" (`notification_reads`) i filtriranje/sortiranje liste. Čisto, bez React-a i bez poziva ka bazi.
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { listUrl } from "@/lib/listLinks";

export const SEVERITY = Object.freeze({ INFO: "info", WARNING: "warning", CRITICAL: "critical" });
export const SEVERITY_ORDER = Object.freeze({ critical: 0, warning: 1, info: 2 });

/** Tipovi koje upisuje refresh_notifications() i W2-L (replacement_candidate); ostali su stari (opšta obaveštenja). */
export const NOTIFICATION_TYPES = Object.freeze({
  LEAVE_REQUEST: "leave_request",
  WORKFORCE_SHORTAGE: "workforce_shortage",
  REPLACEMENT_CANDIDATE: "replacement_candidate",
  DOCUMENT_EXPIRY: "document_expiry",
  DOCUMENT_MISSING: "document_missing",
  ASSIGNMENT_EXPIRY: "assignment_expiry",
  TIMESHEET_PENDING: "timesheet_pending",
  PAYABLE_DUE: "payable_due",
  RECEIVABLE_DUE: "receivable_due",
  CONTRACT_EXPIRY: "contract_expiry",
  ATTENDANCE: "attendance",
  SCHEDULE_CHANGE: "schedule_change",
  GENERAL: "general",
});

// Redosled u filteru po tipu, sa nazivom grupe. `icon` je ključ koji ekran preslikava u ikonicu.
export const TYPE_META = Object.freeze({
  leave_request: { icon: "calendar", label: { en: "Leave requests", rs: "Zahtevi za odsustvo", sk: "Žiadosti o neprítomnosť" } },
  workforce_shortage: { icon: "users", label: { en: "Workforce shortages", rs: "Manjak radnika", sk: "Nedostatok pracovníkov" } },
  replacement_candidate: { icon: "swap", label: { en: "Replacement candidates", rs: "Kandidati za zamenu", sk: "Kandidáti na zastúpenie" } },
  document_expiry: { icon: "file", label: { en: "Expiring documents", rs: "Dokumenta koja ističu", sk: "Dokumenty, ktorým končí platnosť" } },
  document_missing: { icon: "file", label: { en: "Missing documents", rs: "Dokumenta koja fale", sk: "Chýbajúce dokumenty" } },
  assignment_expiry: { icon: "clock", label: { en: "Assignments ending", rs: "Angažmani koji ističu", sk: "Končiace pridelenia" } },
  timesheet_pending: { icon: "clipboard", label: { en: "Timesheets to approve", rs: "Satnice na odobrenju", sk: "Výkazy na schválenie" } },
  payable_due: { icon: "wallet", label: { en: "Payables due", rs: "Dospele obaveze", sk: "Splatné záväzky" } },
  receivable_due: { icon: "wallet", label: { en: "Receivables due", rs: "Dospela potraživanja", sk: "Splatné pohľadávky" } },
  contract_expiry: { icon: "file", label: { en: "Contracts", rs: "Ugovori", sk: "Zmluvy" } },
  attendance: { icon: "clock", label: { en: "Attendance", rs: "Prisustvo", sk: "Dochádzka" } },
  schedule_change: { icon: "calendar", label: { en: "Schedule changes", rs: "Izmene rasporeda", sk: "Zmeny rozvrhu" } },
  general: { icon: "bell", label: { en: "General", rs: "Opšte", sk: "Všeobecné" } },
});

export const TYPE_ORDER = Object.freeze(Object.keys(TYPE_META));

export const SEVERITY_LABELS = Object.freeze({
  critical: { en: "Critical", rs: "Hitno", sk: "Kritické" },
  warning: { en: "Warning", rs: "Upozorenje", sk: "Upozornenie" },
  info: { en: "Info", rs: "Informacija", sk: "Informácia" },
});

const pickLang = (lang, o) => (o ? o[lang] ?? o.en : "");

export function typeLabel(type, lang = "en") {
  return pickLang(lang, (TYPE_META[type] || TYPE_META.general).label);
}
export function severityLabel(severity, lang = "en") {
  return pickLang(lang, SEVERITY_LABELS[severity] || SEVERITY_LABELS.info);
}

const LEAVE_TYPES = {
  vacation: { en: "vacation", rs: "godišnji odmor", sk: "dovolenka" },
  sick: { en: "sick leave", rs: "bolovanje", sk: "práceneschopnosť" },
  personal: { en: "personal leave", rs: "lično odsustvo", sk: "osobné voľno" },
  maternity: { en: "maternity leave", rs: "porodiljsko odsustvo", sk: "materská dovolenka" },
  paternity: { en: "paternity leave", rs: "očinsko odsustvo", sk: "otcovská dovolenka" },
  unpaid: { en: "unpaid leave", rs: "neplaćeno odsustvo", sk: "neplatené voľno" },
  other: { en: "other absence", rs: "drugo odsustvo", sk: "iná neprítomnosť" },
};

/** Iznos u valuti zapisa (npr. „1.200,50 €"); nikad bez valute. */
export function formatAmount(amount, currency, lang = "en") {
  const n = Number(amount);
  if (!Number.isFinite(n) || !currency) return "";
  try {
    return new Intl.NumberFormat(intlLocale(lang), { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

const d = (iso, lang) => (iso ? formatIsoDate(iso, lang) : "");
const join = (...parts) => parts.filter((p) => p !== undefined && p !== null && String(p).trim() !== "").join(" ");

/**
 * Naslov i tekst obaveštenja na jeziku korisnika. Tipovi bez strukturiranih podataka (stari redovi, `general`,
 * `replacement_candidate` koji upisuje W2-L) ostaju sa tekstom iz baze.
 * @returns {{title: string, message: string}}
 */
export function notificationText(n, lang = "en") {
  const p = n?.payload || {};
  const fallback = { title: n?.title || "", message: n?.message || "" };
  const has = (...keys) => keys.every((k) => p[k] !== undefined && p[k] !== null && p[k] !== "");
  switch (n?.type) {
    case "leave_request": {
      if (!has("employee_name", "start_date", "end_date")) return fallback;
      const lt = pickLang(lang, LEAVE_TYPES[p.leave_type] || LEAVE_TYPES.other);
      return {
        title: pickLang(lang, { en: "Leave request pending", rs: "Zahtev za odsustvo čeka odluku", sk: "Žiadosť o neprítomnosť čaká na rozhodnutie" }),
        message: `${p.employee_name}: ${lt}, ${d(p.start_date, lang)} – ${d(p.end_date, lang)}`,
      };
    }
    case "workforce_shortage": {
      if (!has("project_name", "date", "deficit")) return fallback;
      const where = join(p.project_name, p.role_title && `– ${p.role_title}`, (p.shift_name || p.shift_code) && `(${p.shift_name || p.shift_code})`);
      const counts = pickLang(lang, {
        en: `needed ${p.required}, available ${p.available}, missing ${p.deficit}`,
        rs: `potrebno ${p.required}, dostupno ${p.available}, nedostaje ${p.deficit}`,
        sk: `potrebných ${p.required}, dostupných ${p.available}, chýba ${p.deficit}`,
      });
      return {
        title: pickLang(lang, { en: "Workforce shortage", rs: "Manjak radnika", sk: "Nedostatok pracovníkov" }),
        message: `${where}, ${d(p.date, lang)}: ${counts}`,
      };
    }
    case "document_expiry": {
      if (!has("employee_name", "title", "expiration_date")) return fallback;
      const expired = p.expired === true;
      return {
        title: expired
          ? pickLang(lang, { en: "Document expired", rs: "Dokument je istekao", sk: "Platnosť dokumentu skončila" })
          : pickLang(lang, { en: "Document expiring soon", rs: "Dokument uskoro ističe", sk: "Dokumentu čoskoro končí platnosť" }),
        message: `${p.employee_name}: ${p.title} – ${d(p.expiration_date, lang)}`,
      };
    }
    case "document_missing": {
      if (!has("employee_name", "project_name", "document_type_name")) return fallback;
      return {
        title: pickLang(lang, { en: "Required document missing", rs: "Obavezan dokument nedostaje", sk: "Chýba povinný dokument" }),
        message: `${p.employee_name} – ${p.project_name}: ${p.document_type_name}`,
      };
    }
    case "assignment_expiry": {
      if (!has("employee_name", "project_name", "end_date")) return fallback;
      return {
        title: pickLang(lang, { en: "Assignment ending soon", rs: "Angažman uskoro ističe", sk: "Pridelenie čoskoro končí" }),
        message: pickLang(lang, {
          en: `${p.employee_name} – ${p.project_name}, ends ${d(p.end_date, lang)}`,
          rs: `${p.employee_name} – ${p.project_name}, ističe ${d(p.end_date, lang)}`,
          sk: `${p.employee_name} – ${p.project_name}, končí ${d(p.end_date, lang)}`,
        }),
      };
    }
    case "timesheet_pending": {
      if (!has("employee_name", "week_start")) return fallback;
      return {
        title: pickLang(lang, { en: "Timesheet awaiting approval", rs: "Satnica čeka odobrenje", sk: "Výkaz čaká na schválenie" }),
        message: pickLang(lang, {
          en: `${join(p.employee_name, p.project_name && `– ${p.project_name}`)}, week of ${d(p.week_start, lang)}`,
          rs: `${join(p.employee_name, p.project_name && `– ${p.project_name}`)}, nedelja od ${d(p.week_start, lang)}`,
          sk: `${join(p.employee_name, p.project_name && `– ${p.project_name}`)}, týždeň od ${d(p.week_start, lang)}`,
        }),
      };
    }
    case "payable_due": {
      if (!has("remaining", "currency", "due_date")) return fallback;
      return {
        title: pickLang(lang, { en: "Payable overdue", rs: "Obaveza je dospela", sk: "Záväzok po splatnosti" }),
        message: pickLang(lang, {
          en: `${p.payee_name || ""}: ${formatAmount(p.remaining, p.currency, lang)} remaining, was due ${d(p.due_date, lang)}`,
          rs: `${p.payee_name || ""}: preostalo ${formatAmount(p.remaining, p.currency, lang)}, rok je bio ${d(p.due_date, lang)}`,
          sk: `${p.payee_name || ""}: zostáva ${formatAmount(p.remaining, p.currency, lang)}, splatnosť bola ${d(p.due_date, lang)}`,
        }),
      };
    }
    case "receivable_due": {
      if (!has("outstanding", "currency", "due_date")) return fallback;
      return {
        title: pickLang(lang, { en: "Receivable overdue", rs: "Potraživanje je dospelo", sk: "Pohľadávka po splatnosti" }),
        message: pickLang(lang, {
          en: `${p.client_name || ""}: ${formatAmount(p.outstanding, p.currency, lang)} outstanding, was due ${d(p.due_date, lang)}`,
          rs: `${p.client_name || ""}: nenaplaćeno ${formatAmount(p.outstanding, p.currency, lang)}, rok je bio ${d(p.due_date, lang)}`,
          sk: `${p.client_name || ""}: neuhradené ${formatAmount(p.outstanding, p.currency, lang)}, splatnosť bola ${d(p.due_date, lang)}`,
        }),
      };
    }
    case "replacement_candidate":
      return {
        title: n.title || pickLang(lang, { en: "Replacement candidate", rs: "Kandidat za zamenu", sk: "Kandidát na zastúpenie" }),
        message: n.message || "",
      };
    default:
      return fallback;
  }
}

/** Kratka oznaka rešenog obaveštenja uz tekst: uslov više ne važi. */
export function isResolved(n) {
  return Boolean(n?.resolved_at);
}

/** Adresa na koju vodi obaveštenje (null = nema odredišta). Stari redovi mogu imati ručno upisan `link`. */
export function notificationLink(n) {
  if (!n) return null;
  const p = n.payload || {};
  switch (n.entity_table) {
    case "leave_requests":
      return listUrl("/leave-requests", { status: "pending" });
    case "workforce_requirements":
      return listUrl("/workforce", { project: n.entity_id || n.project_id, from: n.due_date, to: n.due_date });
    case "documents":
      return p.employee_id ? `/employees/${encodeURIComponent(p.employee_id)}` : "/documents";
    case "project_assignments":
      if (n.type === "document_missing" && n.project_id) return `/projects/${encodeURIComponent(n.project_id)}`;
      return listUrl("/assignments", { status: "ending_soon", project: n.project_id });
    case "timesheets":
      return listUrl("/timesheets", { status: "submitted" });
    case "payables":
      return listUrl("/payroll/payables", { status: "overdue" });
    case "billing_summaries":
      return listUrl("/clients", { status: "overdue", project: n.project_id });
    default:
      return typeof n.link === "string" && n.link.startsWith("/") ? n.link : null;
  }
}

/** Pročitano: stari red sa is_read = true važi kao pročitan za sve; inače odlučuje `notification_reads` korisnika. */
export function isRead(n, readIds) {
  if (!n) return true;
  if (n.is_read === true) return true;
  return Boolean(readIds && (readIds instanceof Set ? readIds.has(n.id) : readIds.includes(n.id)));
}

/** Broj nepročitanih otvorenih obaveštenja (rešena se ne broje). */
export function unreadCount(list = [], readIds) {
  return list.filter((n) => !isResolved(n) && !isRead(n, readIds)).length;
}

/** Hitnije prvo, pa bliži rok, pa novije. Rešena idu na kraj. */
export function sortNotifications(list = []) {
  const created = (n) => String(n.created_date || "");
  return [...list].sort((a, b) => {
    const ra = isResolved(a) ? 1 : 0;
    const rb = isResolved(b) ? 1 : 0;
    if (ra !== rb) return ra - rb;
    const sa = SEVERITY_ORDER[a.severity] ?? 2;
    const sb = SEVERITY_ORDER[b.severity] ?? 2;
    if (sa !== sb) return sa - sb;
    const da = a.due_date || "9999-12-31";
    const db = b.due_date || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    if (created(a) !== created(b)) return created(a) < created(b) ? 1 : -1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Filtriranje liste. status: "open" (podrazumevano) | "resolved" | "all"; read: "all" | "unread";
 * type: "all" ili tip; severity: "all" ili stepen.
 */
export function filterNotifications(list = [], { status = "open", read = "all", type = "all", severity = "all" } = {}, readIds) {
  return list.filter((n) => {
    if (status === "open" && isResolved(n)) return false;
    if (status === "resolved" && !isResolved(n)) return false;
    if (read === "unread" && isRead(n, readIds)) return false;
    if (type !== "all" && n.type !== type) return false;
    if (severity !== "all" && n.severity !== severity) return false;
    return true;
  });
}

/** Broj otvorenih obaveštenja po tipu (za filter-čipove); samo tipovi koji imaju bar jedno. */
export function countByType(list = []) {
  const out = {};
  for (const n of list) {
    if (isResolved(n)) continue;
    const t = n.type || "general";
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/** Izvor za Action Center na Dashboardu: otvorena obaveštenja, najhitnija prva. */
export function actionCenterItems(list = [], readIds, limit = 6) {
  return sortNotifications(list.filter((n) => !isResolved(n))).slice(0, limit).map((n) => ({
    ...n,
    unread: !isRead(n, readIds),
  }));
}

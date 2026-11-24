// Ugovor o URL parametrima za „KPI vodi na filtriranu izvornu listu" (spec §3.1, W2-I).
// Dashboard gradi adresu ovde, a ciljna stranica čita iste parametre istom funkcijom — jedno mesto istine.
//
//   from, to   YYYY-MM-DD  period (uključivo)
//   project    id projekta
//   client     id klijenta
//   status     status stavke na toj listi (npr. satnica: approved|submitted; dodela: active|upcoming|ending_soon|completed;
//              odsustvo: pending; radnik: active; obaveza: unpaid|partially_paid|overdue; potraživanje: outstanding|overdue)
//   pstatus    status PROJEKTA (active|paused|completed) — Status filter sa Dashboarda; lista ga primenjuje preko projekta stavke
//   view       dodatna oznaka liste (npr. "unbilled" na Billing Overview)
//
// Parametar koji nije postavljen se izostavlja; nepoznati parametri se ignorišu.

export const LIST_PARAMS = Object.freeze(["from", "to", "project", "client", "status", "pstatus", "view"]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w-]{1,64}$/;
const WORD = /^[a-z_]{1,32}$/;

const clean = {
  from: (v) => (ISO.test(v) ? v : ""),
  to: (v) => (ISO.test(v) ? v : ""),
  project: (v) => (ID.test(v) ? v : ""),
  client: (v) => (ID.test(v) ? v : ""),
  status: (v) => (WORD.test(v) ? v : ""),
  pstatus: (v) => (WORD.test(v) ? v : ""),
  view: (v) => (WORD.test(v) ? v : ""),
};

/** Adresa liste sa parametrima; prazne vrednosti i "all" se izostavljaju. */
export function listUrl(path, params = {}) {
  const sp = new URLSearchParams();
  for (const key of LIST_PARAMS) {
    const v = params[key];
    if (v === undefined || v === null || v === "" || v === "all") continue;
    sp.set(key, String(v));
  }
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Parametri liste iz `URLSearchParams` (ili objekta). Neispravne vrednosti postaju "". `active` je true kad je
 * postavljen bar jedan filter (to jest stranica treba da pređe u prikaz „filtrirana lista").
 */
export function readListParams(source) {
  const get = (k) => (source && typeof source.get === "function" ? source.get(k) : source?.[k]) ?? "";
  const out = {};
  for (const key of LIST_PARAMS) out[key] = clean[key](String(get(key)));
  out.active = LIST_PARAMS.some((k) => out[k] !== "");
  return out;
}

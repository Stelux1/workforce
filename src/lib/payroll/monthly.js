// Mesečni obračun jednog radnika i raspodela troška po projektima.
//
// Ulaz su odobreni sati (redovi). Svaki red nosi tarife i koeficijente koji su važili tog dana.
// Tarifa ili koeficijent koji fali NIJE nula — obračun se prekida sa spiskom šta fali.

import { allocate, round2, sum2 } from "./money.js";
import { fromGross, fromNet } from "./serbianPayroll.js";

export const ENGAGEMENT = Object.freeze({ EMPLOYEE: "zaposleni", SUBCONTRACTOR: "podizvodjac" });
export const RATE_BASIS = Object.freeze({ NET: "neto", GROSS: "bruto" });

export class MissingRateError extends Error {
  constructor(missing) {
    super(`Nedostaju tarife ili koeficijenti: ${missing.map((m) => m.field + "@" + m.key).join(", ")}`);
    this.name = "MissingRateError";
    this.missing = missing;
  }
}

function isNumber(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
}

/**
 * Saberi sate po (projekat, vrsta sati, tarife, koeficijenti) pa tek onda množi —
 * tako zaokruživanje ne zavisi od toga koliko je dnevnih unosa.
 */
function aggregate(lines) {
  const groups = new Map();
  const missing = [];
  for (const line of lines) {
    const key = `${line.projectId}|${line.hourType}`;
    for (const field of ["workerRate", "workerCoef", "clientRate", "clientCoef"]) {
      if (!isNumber(line[field])) missing.push({ key, field, date: line.date });
    }
    const hours = Number(line.hours);
    if (!Number.isFinite(hours) || hours < 0) throw new Error(`Neispravan broj sati: ${line.hours}`);
    const gKey = [key, line.workerRate, line.workerCoef, line.clientRate, line.clientCoef].join("|");
    const g = groups.get(gKey) || { ...line, hours: 0 };
    g.hours = round2(g.hours + hours);
    groups.set(gKey, g);
  }
  if (missing.length) throw new MissingRateError(missing);
  return [...groups.values()];
}

/**
 * @param {object} input
 * @param {"zaposleni"|"podizvodjac"} input.engagement
 * @param {"neto"|"bruto"} input.rateBasis   da li je dogovorena satnica radnika neto ili bruto
 * @param {Array} input.lines  [{ projectId, hourType, hours, workerRate, workerCoef, clientRate, clientCoef }]
 * @param {object} input.params  obračunski parametri u EUR (paramsInEur)
 * @param {number} [input.fraction]  udeo punog radnog vremena za osnovice
 */
export function computeWorkerMonth({ engagement, rateBasis = RATE_BASIS.NET, lines, params, fraction = 1 }) {
  if (!Object.values(ENGAGEMENT).includes(engagement)) throw new Error(`Nepoznat tip angažmana: ${engagement}`);
  const groups = aggregate(lines || []).map((g) => ({
    ...g,
    workerAmount: round2(g.hours * Number(g.workerRate) * Number(g.workerCoef)),
    clientAmount: round2(g.hours * Number(g.clientRate) * Number(g.clientCoef)),
  }));

  const basisAmount = sum2(groups.map((g) => g.workerAmount));

  let calc = null;
  let payout;
  let laborCost;
  if (engagement === ENGAGEMENT.EMPLOYEE) {
    if (!params) throw new Error("Nedostaju obračunski parametri");
    if (rateBasis === RATE_BASIS.NET) calc = fromNet(basisAmount, params, { fraction });
    else if (rateBasis === RATE_BASIS.GROSS) calc = fromGross(basisAmount, params, { fraction });
    else throw new Error(`Nepoznata osnova tarife: ${rateBasis}`);
    payout = calc.neto;
    laborCost = calc.totalCost;
  } else {
    // Podizvođač: plaćamo fakturu, bez poreza i doprinosa sa naše strane.
    payout = basisAmount;
    laborCost = basisAmount;
  }

  // Raspodela troška po projektima srazmerno iznosu zarađenom na svakom projektu.
  const byProject = new Map();
  for (const g of groups) {
    const p = byProject.get(g.projectId) || { projectId: g.projectId, hours: 0, workerAmount: 0, revenue: 0 };
    p.hours = round2(p.hours + g.hours);
    p.workerAmount = round2(p.workerAmount + g.workerAmount);
    p.revenue = round2(p.revenue + g.clientAmount);
    byProject.set(g.projectId, p);
  }
  const projects = [...byProject.values()];
  const shares = allocate(laborCost, projects.map((p) => p.workerAmount));
  projects.forEach((p, i) => {
    p.laborCost = shares[i];
  });

  const hoursByType = {};
  for (const g of groups) hoursByType[g.hourType] = round2((hoursByType[g.hourType] || 0) + g.hours);

  return {
    engagement,
    rateBasis,
    basisAmount,
    payout,
    laborCost,
    revenue: sum2(projects.map((p) => p.revenue)),
    calc,
    hoursByType,
    totalHours: sum2(groups.map((g) => g.hours)),
    projects,
    lines: groups,
  };
}

/** Koliko nam ostaje na projektu: prihod − trošak radnika − ostali troškovi projekta. */
export function projectMargin({ revenue, laborCost, otherCosts = 0 }) {
  const r = round2(revenue);
  const remaining = round2(r - round2(laborCost) - round2(otherCosts));
  return { revenue: r, laborCost: round2(laborCost), otherCosts: round2(otherCosts), remaining, marginPct: r > 0 ? round2((remaining / r) * 100) : null };
}

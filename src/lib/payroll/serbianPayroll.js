// Obračun zarade po srpskim propisima: bruto → neto i neto → bruto.
// Čiste funkcije, bez pristupa bazi. Parametri moraju biti u istoj valuti kao iznos (vidi paramsInEur).
//
// Pojednostavljenja (upisana i u DECISIONS.md, proverava knjigovođa):
//  - nema minulog rada, toplog obroka, regresa ni olakšica;
//  - kad je bruto ispod najniže osnovice, doprinosi zaposlenog se računaju na najnižu osnovicu i
//    odbijaju od zarade, a rezultat dobija upozorenje `belowMinBase`;
//  - `fraction` (0–1] srazmerno umanjuje neoporezivi iznos i osnovice (nepuno radno vreme / deo meseca).

import { round2 } from "./money.js";

function scaled(params, fraction) {
  const f = Number(fraction);
  if (!(f > 0 && f <= 1)) throw new Error(`Neispravan udeo radnog vremena: ${fraction}`);
  return {
    nonTaxable: params.nonTaxable * f,
    minBase: params.minBase * f,
    maxBase: params.maxBase * f,
  };
}

function contributionBase(gross, { minBase, maxBase }) {
  if (gross <= 0) return 0;
  return Math.min(Math.max(gross, minBase), maxBase);
}

/** Bruto 1 → neto, porez, doprinosi i ukupan trošak poslodavca (bruto 2). */
export function fromGross(gross, params, { fraction = 1 } = {}) {
  const bruto = round2(gross);
  if (bruto < 0) throw new Error("Bruto ne može biti negativan");
  const s = scaled(params, fraction);
  const base = round2(contributionBase(bruto, s));

  const employee = {
    pio: round2(base * params.employee.pio),
    health: round2(base * params.employee.health),
    unemployment: round2(base * params.employee.unemployment),
  };
  const employeeTotal = round2(employee.pio + employee.health + employee.unemployment);

  const taxBase = round2(Math.max(0, bruto - s.nonTaxable));
  const tax = round2(taxBase * params.taxRate);

  const employer = {
    pio: round2(base * params.employer.pio),
    health: round2(base * params.employer.health),
  };
  const employerTotal = round2(employer.pio + employer.health);

  const neto = round2(bruto - employeeTotal - tax);

  return {
    bruto,
    neto,
    tax,
    taxBase,
    contributionBase: base,
    employee,
    employeeTotal,
    employer,
    employerTotal,
    totalCost: round2(bruto + employerTotal),
    belowMinBase: bruto > 0 && bruto < s.minBase,
    aboveMaxBase: bruto > s.maxBase,
    negativeNet: neto < 0,
  };
}

// Neto kao neprekidna (nezaokružena) funkcija bruta — služi samo za traženje rešenja.
function netContinuous(gross, params, s) {
  const base = contributionBase(gross, s);
  const rate = params.employee.pio + params.employee.health + params.employee.unemployment;
  return gross - base * rate - Math.max(0, gross - s.nonTaxable) * params.taxRate;
}

/**
 * Neto → bruto. Traži bruto (u centima) čiji zaokruženi obračun daje TAČNO traženi neto.
 * Ako zbog zaokruživanja tačan pogodak ne postoji, uzima najbliži i vraća `exactNet: false`.
 */
export function fromNet(net, params, { fraction = 1 } = {}) {
  const target = round2(net);
  if (target < 0) throw new Error("Neto ne može biti negativan");
  if (target === 0) return { ...fromGross(0, params, { fraction }), exactNet: true };
  const s = scaled(params, fraction);

  // Neto raste sa brutom (deo po deo linearno), pa je polovljenje intervala sigurno.
  let lo = 0;
  let hi = target * 2 + s.maxBase + s.nonTaxable;
  while (netContinuous(hi, params, s) < target) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2;
    if (netContinuous(mid, params, s) < target) lo = mid;
    else hi = mid;
  }
  const center = round2(hi);

  let best = null;
  for (let c = -20; c <= 20; c++) {
    const candidate = round2(center + c / 100);
    if (candidate < 0) continue;
    const r = fromGross(candidate, params, { fraction });
    const miss = Math.abs(round2(r.neto - target));
    const dist = Math.abs(candidate - hi);
    if (!best || miss < best.miss || (miss === best.miss && dist < best.dist)) {
      best = { r, miss, dist };
    }
  }
  return { ...best.r, exactNet: best.miss === 0 };
}

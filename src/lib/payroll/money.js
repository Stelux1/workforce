// Novčani pomoćnici. Svi iznosi su u evrima, zaokruženi na cent.

/**
 * Zaokruživanje na 2 decimale, pola od nule — isto kao Postgres `round(numeric, 2)`, jer iznose satnice
 * sada računa i baza (QA 14.11.2026). Otporno na float greške tipa 1.005 i 7.5 × 19.99 = 149.92499999999998.
 */
export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Neispravan iznos: ${value}`);
  const cents = Number((Math.abs(n) * 100).toPrecision(15));
  const r = (Math.sign(n) * Math.round(cents)) / 100;
  return r === 0 ? 0 : r; // bez -0
}

/** Saberi listu iznosa u centima da se ne gomila float greška. */
export function sum2(values) {
  return values.reduce((acc, v) => acc + Math.round(round2(v) * 100), 0) / 100;
}

/**
 * Podeli `total` na delove proporcionalno `weights`, tako da zbir delova bude TAČNO `total`.
 * Ostatak od zaokruživanja ide delovima sa najvećim odsečenim ostatkom (metoda najvećeg ostatka).
 * Koristi se za raspodelu troška radnika na projekte.
 */
export function allocate(total, weights) {
  const totalCents = Math.round(round2(total) * 100);
  const w = weights.map((x) => {
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Neispravna težina: ${x}`);
    return n;
  });
  const wSum = w.reduce((a, b) => a + b, 0);
  if (w.length === 0) return [];
  if (wSum === 0) {
    if (totalCents !== 0) throw new Error("Ne može se raspodeliti iznos na nulte težine");
    return w.map(() => 0);
  }
  const raw = w.map((x) => (totalCents * x) / wSum);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    floors[order[k].i] += 1;
  }
  return floors.map((c) => c / 100);
}

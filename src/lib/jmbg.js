// JMBG: 13 cifara + kontrolna cifra (modul 11). Isti algoritam kao `public.jmbg_valid` u bazi.
// Prazno je dozvoljeno (polje nije obavezno).
export function jmbgValid(value) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string" || !/^[0-9]{13}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const s =
    7 * (d[0] + d[6]) + 6 * (d[1] + d[7]) + 5 * (d[2] + d[8]) +
    4 * (d[3] + d[9]) + 3 * (d[4] + d[10]) + 2 * (d[5] + d[11]);
  let m = 11 - (s % 11);
  if (m > 9) m = 0;
  return m === d[12];
}

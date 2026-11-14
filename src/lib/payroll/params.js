// Obračunski parametri za zarade u Srbiji.
// Iznosi su u RSD jer ih tako propisuje država. Pre obračuna se preračunavaju u EUR po kursu za taj mesec.
//
// Izvor (proveriti u Službenom glasniku pre zvanične upotrebe):
//  - neoporezivi iznos 34.221 RSD, najniža osnovica 51.297 RSD, najviša osnovica 732.820 RSD (važi od 1.1.2026)
//  - porez na zarade 10%; doprinosi zaposlenog 14% PIO + 5,15% zdravstvo + 0,75% nezaposlenost = 19,9%
//  - doprinosi poslodavca 10% PIO + 5,15% zdravstvo = 15,15%
// U aplikaciji se parametri čuvaju u bazi sa datumom važenja; ovo su samo početne vrednosti.

export const PARAMS_2026_RSD = Object.freeze({
  validFrom: "2026-01-01",
  currency: "RSD",
  taxRate: 0.1,
  nonTaxable: 34221,
  minBase: 51297,
  maxBase: 732820,
  employee: Object.freeze({ pio: 0.14, health: 0.0515, unemployment: 0.0075 }),
  employer: Object.freeze({ pio: 0.1, health: 0.0515 }),
});

/**
 * Preračunaj parametre iz RSD u EUR po kursu (koliko dinara vredi 1 EUR).
 * Bez kursa obračun ne sme da krene — nema podrazumevane vrednosti.
 */
export function paramsInEur(params, eurRsdRate) {
  const rate = Number(eurRsdRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Kurs EUR/RSD za mesec nije unet");
  }
  if (params.currency === "EUR") return params;
  return Object.freeze({
    ...params,
    currency: "EUR",
    eurRsdRate: rate,
    nonTaxable: params.nonTaxable / rate,
    minBase: params.minBase / rate,
    maxBase: params.maxBase / rate,
  });
}

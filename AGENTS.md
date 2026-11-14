# AGENTS — App za radnike

Aplikacija za upravljanje radnicima: lični podaci i dokumenta, angažovanje na projektima, unos sati, mesečni obračun (neto/bruto) i koliko nam ostaje po projektu. Korisnik je Luka; komunikacija na srpskom (latinica, ekavica).

Redosled čitanja: `DECISIONS.md` (obavezujuće) → `BACKLOG.md` (posao) → `src/lib/payroll/` (sva novčana logika).

- Stack: React 18 + Vite + Tailwind + shadcn/ui (iz Base44 izvoza), backend Supabase (u prelazu — vidi Phase 0).
- Novac: samo kroz `src/lib/payroll`; svaka promena formule ide sa testom u `payroll.test.js`.
- Env: prazni placeholderi (`KEY=`), nikad istinite vrednosti tipa `GET_FROM_X`.

## OS
- dialect: standard
- verify: npm run build && npm test

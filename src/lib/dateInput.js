// Unos datuma u obliku dd-mm-yyyy (zahtev Luke, 25.11.2026): pregledač za <input type="date"> sam bira prikaz po
// jeziku sistema (mm/dd/yyyy), pa polja prikazuju tekst dd-mm-yyyy, a vrednost ka formi ostaje ISO yyyy-mm-dd.

const pad = (n) => String(n).padStart(2, "0");

// "2026-11-25" → "25-11-2026"; sve što nije ISO datum → "".
export function isoToDisplay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// "25-11-2026", "25.11.2026", "25/11/2026", "5-1-2026" → ISO; nevažeći ili nepotpun datum → null.
export function displayToIso(text) {
  const m = /^\s*(\d{1,2})[-./\s](\d{1,2})[-./\s](\d{4})\.?\s*$/.exec(String(text ?? ""));
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (y < 1000 || mo < 1 || mo > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null; // npr. 31-02
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// Dok korisnik kuca samo cifre, crtice se dodaju same: "251120" → "25-11-20". Ručno upisani separatori ostaju.
export function maskDateTyping(text) {
  const raw = String(text ?? "");
  if (/[^\d]/.test(raw.replace(/[-./\s]/g, ""))) return raw.slice(0, 10);
  if (/[-./\s]/.test(raw)) return raw.slice(0, 10);
  const digits = raw.slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

// Zaglavlje firme u PDF dokumentima (platni listić, satnica): podaci iz company_settings (D18) i logo firme kao slika
// u samom PDF-u (umesto nekadašnje Base44 slike). Logo stiže kroz sloj podataka kao potpisan link koji važi 1 h, pa
// se podaci firme čitaju sveže neposredno pre pravljenja PDF-a, a slika se učitava u PDF (fetch → base64).
// Bez logoa, ili kad učitavanje ne uspe, PDF ide bez slike. Prazni podaci firme → PDF bez zaglavlja firme.
import { base44 } from "@/api/base44Client";
import { companyHeader, imageTypeOfBytes } from "@/lib/companyDetails";

const PDF_FORMAT = { "image/png": "PNG", "image/jpeg": "JPEG" };

// Isti font kao PDF satnice (latinica sa dijakriticima); bez njega jsPDF ima samo helvetica bez č/ć/š/đ/ž.
const DEJAVU_NORMAL_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf";
const DEJAVU_BOLD_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf";

export function bytesToBase64(bytes) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Slika (PNG/JPG po sadržaju) kao data URL za jsPDF; null ako ne može da se učita. */
export async function loadImageData(url) {
  try {
    const bytes = await fetchBytes(url);
    const type = imageTypeOfBytes(bytes);
    if (!type) throw new Error("logo nije PNG ni JPG");
    return { dataUrl: `data:${type};base64,${bytesToBase64(bytes)}`, format: PDF_FORMAT[type] };
  } catch (e) {
    console.warn("[pdf] Logo firme nije učitan — PDF ide bez logoa:", e?.message || e);
    return null;
  }
}

/**
 * Podaci firme za PDF, sveže iz baze (potpisan link logoa ne sme da bude istekao): { name, city, lines, footer, logo }
 * ili null kad podaci firme nisu uneti.
 */
export async function loadCompanyForPdf() {
  const row = (await base44.entities.CompanySettings.list(null, 1))[0] || null;
  const header = companyHeader(row);
  if (!header) return null;
  return { ...header, logo: header.logoUrl ? await loadImageData(header.logoUrl) : null };
}

/** DejaVu fontovi (base64) ili null ako CDN nije dostupan. */
export async function loadPdfFonts() {
  try {
    const [normal, bold] = await Promise.all([fetchBytes(DEJAVU_NORMAL_URL), fetchBytes(DEJAVU_BOLD_URL)]);
    return { normal: bytesToBase64(normal), bold: bytesToBase64(bold) };
  } catch {
    return null;
  }
}

/** Registruje fontove u dokumentu; vraća ime fonta za doc.setFont. */
export function applyPdfFonts(doc, fonts) {
  if (!fonts) return "helvetica";
  doc.addFileToVFS("DejaVuSans.ttf", fonts.normal);
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");
  return "DejaVuSans";
}

/**
 * Zaglavlje firme: logo levo (u okviru logoBox, srazmerno), naziv i podaci desno — isti raspored kao PDF satnice.
 * @returns {number} visina zaglavlja u mm (0 kad nema podataka firme — ništa se ne crta)
 */
export function drawCompanyHeader(doc, company, { x, y, right, font, logoBox = [38, 18] }) {
  if (!company) return 0;
  if (company.logo) {
    try {
      const props = doc.getImageProperties(company.logo.dataUrl);
      const scale = Math.min(logoBox[0] / props.width, logoBox[1] / props.height);
      doc.addImage(company.logo.dataUrl, company.logo.format, x, y, props.width * scale, props.height * scale);
    } catch (e) {
      console.warn("[pdf] Logo firme nije ubačen u PDF:", e?.message || e);
    }
  }
  let ty = y + 6;
  if (company.name) {
    doc.setFontSize(12);
    doc.setFont(font, "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(company.name, right, ty, { align: "right" });
    ty += 5.5;
  }
  doc.setFontSize(8);
  doc.setFont(font, "normal");
  doc.setTextColor(100, 100, 100);
  for (const line of company.lines) {
    doc.text(line, right, ty, { align: "right" });
    ty += 4.5;
  }
  return logoBox[1];
}

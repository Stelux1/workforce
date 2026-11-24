// Onboarding ZIP (spec §12.2, model §2.10, R12). Sadržaj određuje SERVER: `start_onboarding_download` vraća samo
// zahtevane, postojeće, važeće i za ovog korisnika dozvoljene dokumente i upisuje preuzimanje + audit. Pregledač
// zatim potpisuje linkove (storage RLS ponovo proverava svaki fajl) i pakuje ZIP sa pregledom nedostataka.
import { requireSupabase } from "@/api/supabase";
import { dataError } from "@/api/errors";
import { safeName, zipEntryName } from "@/lib/onboarding";

const BUCKET = "files";
const SIGN_SECONDS = 120;

const STATUS_TEXT = {
  available: "OK",
  expiring_soon: "Expiring soon / Uskoro ističe",
  missing: "MISSING / NEDOSTAJE",
  expired: "EXPIRED / ISTEKAO",
  not_permitted: "Not permitted to export / Izvoz nije dozvoljen",
};

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Pregled u ZIP-u: svi zahtevi svakog radnika, uključujući nedostatke i zabrane (ništa se ne prikriva).
export function manifestCsv(manifest, includedIds = new Set()) {
  const rows = [["Employee", "Role", "Document type", "Mandatory", "Status", "Expiration date", "Document", "In ZIP"]];
  for (const w of manifest?.workers || []) {
    for (const i of w.items || []) {
      rows.push([
        w.employee_name, w.role_title || "", i.document_type_name || i.document_type, i.mandatory ? "yes" : "no",
        STATUS_TEXT[i.status] || i.status, i.expiration_date || "", i.document_title || "",
        i.document_id && includedIds.has(i.document_id) ? "yes" : "no",
      ]);
    }
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

export function zipFileName(manifest, date = new Date()) {
  return `Onboarding_${safeName(manifest?.project_name, "projekat")}_${date.toISOString().slice(0, 10)}.zip`;
}

/**
 * Preuzima paket kao ZIP. `manifest` je preview (onboarding_manifest) za list sa pregledom.
 * Vraća { fileName, fileCount, skipped } — skipped su fajlovi koje storage nije izdao (ne bi trebalo da ih bude).
 */
export async function downloadOnboardingZip(packageId, manifest, { onProgress } = {}) {
  const sb = requireSupabase();
  const { data: files, error } = await sb.rpc("start_onboarding_download", { p_package: packageId });
  if (error) throw dataError(error, "start_onboarding_download");
  const list = Array.isArray(files) ? files : [];

  const { data: signed, error: signError } = await sb.storage.from(BUCKET).createSignedUrls(list.map((f) => f.file_path), SIGN_SECONDS);
  if (signError) throw dataError(signError, "onboardingZip.sign");
  const urlByPath = new Map((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set();
  const included = new Set();
  const skipped = [];
  let done = 0;
  for (const f of list) {
    const url = urlByPath.get(f.file_path);
    if (!url) {
      skipped.push(f);
    } else {
      const res = await fetch(url);
      if (!res.ok) skipped.push(f);
      else {
        zip.file(zipEntryName(f, used), await res.blob());
        included.add(f.document_id);
      }
    }
    done += 1;
    onProgress?.(done, list.length);
  }
  zip.file("_pregled_dokumentacije.csv", manifestCsv(manifest, included));

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const fileName = zipFileName(manifest);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return { fileName, fileCount: included.size, skipped };
}

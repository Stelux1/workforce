import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { addDays, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { exportTimesheetPDF } from "@/lib/timesheetPdf";
import { toast } from "sonner";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const LABELS = {
  en: {
    title: "WEEKLY TIMESHEET",
    employeeName: "Employee Name",
    designation: "Designation",
    reference: "Reference ID",
    year: "Year",
    week: "Week",
    no: "No.",
    location: "Location",
    projectNo: "Project No.",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    daysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    dailyTotal: "Total hours / day",
    totalHours: "Total Working Hours",
    overtime: "Overtime Hours",
    employee: "Employee",
    contractor: "Contractor",
    client: "Client",
    signatureDate: "Signature / Date",
    close: "Close",
    download: "Download PDF",
  },
  rs: {
    title: "NEDELJNI SATI",
    employeeName: "Ime zaposlenog",
    designation: "Radno mesto",
    reference: "Referenca",
    year: "Godina",
    week: "Nedelja",
    no: "Br.",
    location: "Lokacija",
    projectNo: "Br. projekta",
    days: ["Ponedeljak", "Utorak", "Sreda", "Cetvrtak", "Petak", "Subota", "Nedelja"],
    daysShort: ["Pon", "Uto", "Sre", "Cet", "Pet", "Sub", "Ned"],
    dailyTotal: "Ukupno sati / dan",
    totalHours: "Ukupan broj radnih sati",
    overtime: "Prekovremeni sati",
    employee: "Zaposleni",
    contractor: "Izvođač radova",
    client: "Naručilac",
    signatureDate: "Potpis / Datum",
    close: "Zatvori",
    download: "Preuzmi PDF",
  },
};

const LOGO_URL = "https://media.base44.com/images/public/6a031d341853d58a773b91ac/daddf74c6_DarkGreenModernGradientWaveLinktreeBackground.png";
const numRows = 6;

const B = "#000000"; // border color — black
const LABEL_BG = "#f5f5f5"; // light grey for label cells

export default function TimesheetPreviewModal({ ts, employees, weekDate: pageWeekDate, open, onClose, lang = "en", projects = [] }) {
  if (!ts) return null;
  // Datumi iz samog reda, broj projekta iz projekta (ranije: nedelja sa stranice i ime klijenta).
  const weekDate = ts.week_start ? parseISO(ts.week_start) : pageWeekDate;
  const projectNo = projects.find((p) => p.id === ts.project_id)?.project_number || "";

  const L = LABELS[lang] || LABELS.en;
  const emp = employees?.find((e) => e.id === ts.employee_id);
  const isoWeek = getISOWeek(weekDate);
  const isoYear = getISOWeekYear(weekDate);
  const ref = ts.week_ref || `${isoYear}W${String(isoWeek).padStart(2, "0")}-${emp?.employee_id || "???"}`;

  const handleDownload = async () => {
    await exportTimesheetPDF([ts], employees, weekDate, `Timesheet_${ref}.pdf`, lang, projects);
    toast.success(lang === "rs" ? "PDF preuzet" : "PDF downloaded");
  };

  const tdStyle = { border: `1px solid ${B}`, padding: "4px 6px" };
  const thStyle = { border: `1px solid ${B}`, padding: "5px 6px", background: LABEL_BG, fontWeight: "bold" };
  const dayThStyle = { border: `1px solid ${B}`, padding: "4px 3px", textAlign: "center", background: LABEL_BG, fontWeight: "bold", minWidth: 52 };
  const weekendThStyle = { ...dayThStyle, background: "#ffe8c8" };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-3">
        <div className="bg-white text-black overflow-x-auto" style={{ fontFamily: "Helvetica, Arial, sans-serif", minWidth: 820, border: "1px solid #ccc" }}>
          <div className="p-5 space-y-3" style={{ fontSize: 10 }}>

            {/* HEADER */}
            <div className="flex items-center justify-between mb-1">
              <img src={LOGO_URL} alt="Stelux Logo" style={{ maxHeight: 50, maxWidth: 160, objectFit: "contain" }} />
              <div className="text-right">
                <div style={{ fontSize: 13, fontWeight: "bold" }}>Stelux Construct DOO</div>
                <div style={{ fontSize: 8.5, color: "#555" }}>Despota Stefana 39a, 11320 Velika Plana, Serbia</div>
                <div style={{ fontSize: 8.5, color: "#555" }}>info@stelux-construct.rs</div>
              </div>
            </div>

            {/* TITLE */}
            <div style={{ border: `2px solid ${B}`, textAlign: "center", padding: "7px 0", fontWeight: "bold", fontSize: 13, letterSpacing: "0.12em" }}>
              {L.title}
            </div>

            {/* EMPLOYEE INFO */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
              <tbody>
                <tr>
                  <td style={{ ...thStyle, width: 130 }}>{L.employeeName}</td>
                  <td style={{ ...tdStyle, fontWeight: "bold", fontSize: 11 }}>{ts.employee_name || "—"}</td>
                  <td style={{ ...thStyle, width: 60, textAlign: "center" }}>{L.year}</td>
                  <td style={{ ...tdStyle, width: 50, textAlign: "center", fontWeight: "bold", fontSize: 12 }}>{isoYear}</td>
                </tr>
                <tr>
                  <td style={thStyle}>{L.designation}</td>
                  <td style={tdStyle}>{emp?.position || ""}</td>
                  <td style={{ ...thStyle, textAlign: "center" }}>{L.week}</td>
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: "bold", fontSize: 12 }}>W{String(isoWeek).padStart(2, "0")}</td>
                </tr>
                <tr>
                  <td style={thStyle}>{L.reference}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 8 }} colSpan={3}>{ref}</td>
                </tr>
              </tbody>
            </table>

            {/* HOURS TABLE */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 26, textAlign: "center" }}>{L.no}</th>
                  <th style={{ ...thStyle, width: 130, textAlign: "left" }}>{L.location}</th>
                  <th style={{ ...thStyle, width: 90, textAlign: "center" }}>{L.projectNo}</th>
                  {DAYS.map((d, i) => {
                    const date = addDays(weekDate, i);
                    const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
                    const isWeekend = i >= 5;
                    return (
                      <th key={d} style={isWeekend ? weekendThStyle : dayThStyle}>
                        <div style={{ fontSize: 7, fontWeight: "bold" }}>{L.days[i]}</div>
                        <div style={{ fontSize: 6.5, fontWeight: "normal" }}>{L.daysShort[i]}</div>
                        <div style={{ fontSize: 6, color: "#666" }}>{dateStr}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: numRows }).map((_, r) => {
                  const isFirst = r === 0;
                  const rowBg = r % 2 === 0 ? "#ffffff" : "#fafafa";
                  return (
                    <tr key={r} style={{ background: rowBg }}>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{r + 1}</td>
                      <td style={tdStyle}>{isFirst ? (ts.project || "") : ""}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{isFirst ? projectNo : ""}</td>
                      {DAYS.map((d, i) => {
                        const val = isFirst ? (ts[`${d}_hours`] || 0) : 0;
                        const isWeekend = i >= 5;
                        return (
                          <td key={d} style={{ ...tdStyle, textAlign: "center", background: isWeekend ? (r % 2 === 0 ? "#fff8f0" : "#fff3e6") : rowBg, fontWeight: isFirst && val > 0 ? "bold" : "normal", fontSize: 10 }}>
                            {isFirst && val > 0 ? val : ""}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr style={{ background: "#f0f0f0", borderTop: `2px solid ${B}` }}>
                  <td style={{ ...tdStyle, fontWeight: "bold", fontSize: 8 }} colSpan={3}>{L.dailyTotal}</td>
                  {DAYS.map((d, i) => {
                    const val = ts[`${d}_hours`] || 0;
                    return (
                      <td key={d} style={{ ...tdStyle, textAlign: "center", fontWeight: "bold", fontSize: 10, background: i >= 5 ? "#ffe8c8" : "#f0f0f0" }}>
                        {val > 0 ? val : ""}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>

            {/* SUMMARY */}
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ display: "flex", border: `1px solid ${B}` }}>
                <div style={{ ...thStyle, borderRight: `1px solid ${B}`, fontSize: 9 }}>{L.totalHours}</div>
                <div style={{ padding: "4px 16px", fontWeight: "bold", fontSize: 16 }}>{(ts.total_hours || 0).toFixed(1)} h</div>
              </div>
              {(ts.overtime_hours || 0) > 0 && (
                <div style={{ display: "flex", border: `1px solid ${B}` }}>
                  <div style={{ ...thStyle, borderRight: `1px solid ${B}`, fontSize: 9 }}>{L.overtime}</div>
                  <div style={{ padding: "4px 16px", fontWeight: "bold", fontSize: 16 }}>{(ts.overtime_hours || 0).toFixed(1)} h</div>
                </div>
              )}
            </div>

            {/* SIGNATURES */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: L.employee, sub: ts.employee_name || "" },
                { label: L.contractor, sub: "Stelux Construct DOO, Velika Plana" },
                { label: L.client, sub: ts.client_name || "" },
              ].map((sig) => (
                <div key={sig.label} style={{ border: `1px solid ${B}` }}>
                  <div style={{ ...thStyle, borderBottom: `1px solid ${B}`, fontSize: 9 }}>{sig.label}</div>
                  <div style={{ height: 40, padding: "4px 6px", color: "#666", fontSize: 8 }}>{sig.sub}</div>
                  <div style={{ ...thStyle, borderTop: `1px solid ${B}`, fontSize: 8 }}>{L.signatureDate}</div>
                </div>
              ))}
            </div>

            {/* FOOTER */}
            <div style={{ borderTop: `1px solid ${B}`, paddingTop: 4, fontSize: 7, color: "#888", display: "flex", justifyContent: "space-between" }}>
              <span>Stelux Construct DOO · Despota Stefana 39a, 11320 Velika Plana · info@stelux-construct.rs</span>
              <span>Ref: {ref}</span>
            </div>

          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{L.close}</Button>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="w-4 h-4" /> {L.download}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
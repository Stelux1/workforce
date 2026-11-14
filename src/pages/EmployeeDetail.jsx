import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUnsavedUpload } from "@/lib/useUnsavedUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Edit, Trash2, User, Phone, Briefcase, Landmark,
  Heart, FileText, Clock, Calendar, Upload, Download, Plus, Eye
} from "lucide-react";
import { parseISO } from "date-fns";
import { toast } from "sonner";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate, shortDatePattern, longDatePattern } from "@/lib/dateFormat";

const NATIONALITY_RS = {
  "Afghan": "Avganistanog", "Albanian": "Albanac", "Algerian": "Alžirac", "American": "Amerikanac",
  "Argentine": "Argentinac", "Armenian": "Jermenin", "Australian": "Australijanac", "Austrian": "Austrijanac",
  "Azerbaijani": "Azerbejdžanac", "Bangladeshi": "Bangladešanin", "Belarusian": "Belorusin",
  "Belgian": "Belgijanac", "Bolivian": "Bolivijac", "Bosnian": "Bosanac", "Brazilian": "Brazilac",
  "British": "Britanac", "Bulgarian": "Bugarin", "Canadian": "Kanadjanin", "Chilean": "Čileanac",
  "Chinese": "Kinez", "Colombian": "Kolumbijac", "Croatian": "Hrvat", "Cuban": "Kubanac",
  "Czech": "Čeh", "Danish": "Danac", "Dutch": "Holanđanin", "Egyptian": "Egipćanin",
  "Estonian": "Estonac", "Finnish": "Finac", "French": "Francuz", "Georgian": "Gruzijac",
  "German": "Nemac", "Greek": "Grk", "Hungarian": "Mađar", "Indian": "Indijac",
  "Indonesian": "Indonežanin", "Iranian": "Iranac", "Iraqi": "Iračanin", "Irish": "Irac",
  "Israeli": "Izraelac", "Italian": "Italijan", "Japanese": "Japanac", "Jordanian": "Jordanac",
  "Kazakhstani": "Kazahstanac", "Kenyan": "Kenijac", "Latvian": "Latvijac", "Lebanese": "Libanac",
  "Lithuanian": "Litvanac", "Malaysian": "Malezijac", "Mexican": "Meksikanac", "Moldovan": "Moldavac",
  "Montenegrin": "Crnogorac", "Moroccan": "Marokanac", "New Zealander": "Novozelandjanin",
  "Nigerian": "Nigerijac", "Norwegian": "Norvežanin", "Pakistani": "Pakistanac", "Polish": "Poljakin",
  "Portuguese": "Portugaac", "Romanian": "Rumun", "Russian": "Rus", "Serbian": "Srbin",
  "Singaporean": "Singapurac", "Slovak": "Slovak", "Slovenian": "Slovenac", "South African": "Južnoafrikanac",
  "South Korean": "Južnokoreanac", "Spanish": "Španac", "Swedish": "Šveđanin", "Swiss": "Švajcarac",
  "Syrian": "Sirijac", "Thai": "Tajlanđanin", "Turkish": "Turčin", "Ukrainian": "Ukraninac",
  "Venezuelan": "Venecuelanac", "Vietnamese": "Vijetnamac",
};

const COUNTRY_RS = {
  "Albania": "Albanija", "Austria": "Austrija", "Belgium": "Belgija",
  "Bosnia and Herzegovina": "Bosna i Hercegovina", "Bulgaria": "Bugarska", "Croatia": "Hrvatska",
  "Cyprus": "Kipar", "Czech Republic": "Češka", "Denmark": "Danska", "Estonia": "Estonija",
  "Finland": "Finska", "France": "Francuska", "Germany": "Nemačka", "Greece": "Grčka",
  "Hungary": "Mađarska", "Ireland": "Irska", "Italy": "Italija", "Kosovo": "Kosovo",
  "Latvia": "Latvija", "Lithuania": "Litvanija", "Luxembourg": "Luksemburg", "Malta": "Malta",
  "Moldova": "Moldavija", "Montenegro": "Crna Gora", "Netherlands": "Holandija",
  "North Macedonia": "Severna Makedonija", "Norway": "Norveška", "Poland": "Poljska",
  "Portugal": "Portugalija", "Romania": "Rumunija", "Russia": "Rusija", "Serbia": "Srbija",
  "Slovakia": "Slovačka", "Slovenia": "Slovenija", "Spain": "Španija", "Sweden": "Švedska",
  "Switzerland": "Švajcarska", "Turkey": "Turska", "Ukraine": "Ukrajina",
  "United Kingdom": "Ujedinjeno Kraljevstvo", "United States": "Sjedinjene Države",
  "Australia": "Australija", "Canada": "Kanada", "China": "Kina", "India": "Indija",
  "Japan": "Japan", "Brazil": "Brazil", "South Africa": "Južna Afrika", "Other": "Ostalo",
};
import DocumentPreviewModal from "@/components/documents/DocumentPreviewModal";
import { documentStatus } from "@/lib/documentStatus";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import EmploymentHistoryCard from "@/components/employees/EmploymentHistoryCard";

const DOC_CATEGORIES = [
  { value: "id_card", label: "Lična karta" },
  { value: "passport", label: "Pasoš" },
  { value: "work_permit", label: "Radna dozvola" },
  { value: "contract", label: "Ugovor" },
  { value: "certificate", label: "Sertifikat" },
  { value: "diploma", label: "Diploma" },
  { value: "training_certificate", label: "Potvrda o obuci" },
  { value: "driver_license", label: "Vozačka dozvola" },
  { value: "insurance", label: "Osiguranje" },
  { value: "medical_certificate", label: "Ljekarsko uvjerenje" },
  { value: "safety_certificate", label: "Potvrda o bezbjednosti" },
  { value: "other", label: "Ostalo" },
];

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

export default function EmployeeDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: empId } = useParams();
  const t = useT();
  const { lang } = useLang();

  const translateGender = (g) => {
    if (lang !== "rs") return g;
    return g === "male" ? "Muški" : g === "female" ? "Ženski" : g === "other" ? "Ostalo" : g;
  };
  const translateNationality = (n) => lang === "rs" ? (NATIONALITY_RS[n] || n) : n;
  const translateCountry = (c) => lang === "rs" ? (COUNTRY_RS[c] || c) : c;

  // Neispravan ID u adresi ne šalje upite (ranije: tri poruke o grešci i večni spinner).
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empId || "");
  const { data: employees = [], isLoading: loadingEmp, isError: empError } = useQuery({
    queryKey: ["employee-detail", empId],
    queryFn: () => base44.entities.Employee.filter({ id: empId }),
    enabled: validId,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["employee-docs", empId],
    queryFn: () => base44.entities.Document.filter({ employee_id: empId }),
    enabled: validId,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["employee-attendance", empId],
    queryFn: () => base44.entities.AttendanceRecord.filter({ employee_id: empId }, "-date", 30),
    enabled: validId,
  });

  const { data: deptConfigs = [] } = useQuery({
    queryKey: ["department-configs"],
    queryFn: () => base44.entities.DepartmentConfig.list("name", 200),
  });

  const translateDepartment = (name) => {
    if (lang !== "rs") return name;
    const dept = deptConfigs.find((d) => d.name === name);
    return dept?.translation || name;
  };

  const translatePosition = (deptName, posName) => {
    if (lang !== "rs") return posName;
    const dept = deptConfigs.find((d) => d.name === deptName);
    const pos = dept?.positions?.find((p) => p.name === posName);
    return pos?.translation || posName;
  };

  const EMPLOYMENT_TYPE_RS = {
    full_time: "Puno radno vreme",
    part_time: "Nepuno radno vreme",
    temporary: "Privremeno",
    contractor: "Ugovor o delu",
  };

  const translateEmploymentType = (val) => {
    if (!val) return null;
    if (lang === "rs") return EMPLOYMENT_TYPE_RS[val] || val.replace(/_/g, " ");
    return val.replace(/_/g, " ");
  };

  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docForm, setDocForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [deleteDocId, setDeleteDocId] = useState(null);
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Employee.delete(empId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success(t("Employee deleted"));
      navigate("/employees");
    },
  });

  const createDocMutation = useMutation({
    mutationFn: (data) => base44.entities.Document.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-docs", empId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(t("Document uploaded"));
      docUpload.commit();
      setDocDialogOpen(false);
      setDocForm({});
    },
  });
  // Kreira se posle mutacije da bi znao da li čuvanje traje (odbacivanje se tada odlaže).
  const docUpload = useUnsavedUpload(createDocMutation.isPending);

  const deleteDocMutation = useMutation({
    mutationFn: (id) => base44.entities.Document.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-docs", empId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(t("Document deleted"));
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadFailed(false);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      docUpload.track(file_url);
      setDocForm((prev) => ({ ...prev, file_url, file_name: file.name }));
    } catch (err) {
      docUpload.discard();
      setUploadFailed(true); // čuvanje blokirano dok se ne izabere drugi fajl (QA 14.11.2026)
      setDocForm((prev) => ({ ...prev, file_url: "", file_name: "" }));
      throw err; // poruku prikazuje lib/errorToasts.js
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDocSave = () => {
    if (!docForm.title || !docForm.category) {
      toast.error(t("Please fill in all required fields"));
      return;
    }
    createDocMutation.mutate({ ...docForm, employee_id: empId });
  };

  const emp = employees[0];
  if (!emp && validId && loadingEmp) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!emp) {
    // Nepostojeći radnik (ranije: spinner zauvek, §9.3 #16).
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-3">
        <h2 className="text-xl font-semibold">{t("Employee not found")}</h2>
        <p className="text-sm text-muted-foreground">{t("The employee does not exist or was deleted.")}</p>
        <Button variant="outline" onClick={() => navigate("/employees")}>{t("Back to employees")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/employees")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {emp.profile_photo ? (
            <img src={emp.profile_photo} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
              {emp.first_name?.[0]}{emp.last_name?.[0]}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{emp.first_name} {emp.last_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">{emp.position}</span>
              <StatusBadge status={emp.status} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate(`/employees/edit?id=${empId}`)}>
            <Edit className="w-4 h-4" /> {t("Edit")}
          </Button>
          <Button variant="destructive" size="icon" onClick={() => setConfirmDeleteEmp(true)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="personal">{t("Personal Tab")}</TabsTrigger>
          <TabsTrigger value="employment">{t("Employment")}</TabsTrigger>
          <TabsTrigger value="engagements">{lang === "rs" ? "Angažovanja" : "Engagements"}</TabsTrigger>
          <TabsTrigger value="financial">{t("Financial")}</TabsTrigger>
          <TabsTrigger value="emergency">{t("Emergency")}</TabsTrigger>
          <TabsTrigger value="documents">{t("Documents")} ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> {t("Personal")}</CardTitle></CardHeader>
              <CardContent className="divide-y">
                <InfoRow label={t("Date of Birth")} value={emp.date_of_birth ? formatDate(parseISO(emp.date_of_birth), longDatePattern(lang), lang) : null} />
                <InfoRow label={t("Gender")} value={translateGender(emp.gender)} />
                <InfoRow label={t("Nationality")} value={translateNationality(emp.nationality)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Phone className="w-4 h-4" /> {t("Contact")}</CardTitle></CardHeader>
              <CardContent className="divide-y">
                <InfoRow label={t("Phone")} value={emp.phone} />
                <InfoRow label={t("Email")} value={emp.email} />
                <InfoRow label={t("Address")} value={[emp.address, emp.city, emp.postal_code, translateCountry(emp.country)].filter(Boolean).join(", ")} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="employment" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Briefcase className="w-4 h-4" /> {t("Employment")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0">
                <div className="divide-y pr-4">
                  <InfoRow label={t("Employee ID")} value={emp.employee_id} />
                  <InfoRow label={t("Position")} value={translatePosition(emp.department, emp.position)} />
                  <InfoRow label={t("Department")} value={translateDepartment(emp.department)} />
                  <InfoRow label={t("Employment Type")} value={translateEmploymentType(emp.employment_type)} />
                </div>
                <div className="divide-y pl-0 md:pl-4">
                  <InfoRow label={t("Start Date")} value={emp.start_date ? formatDate(parseISO(emp.start_date), longDatePattern(lang), lang) : null} />
                  <InfoRow label={t("End Date")} value={emp.end_date ? formatDate(parseISO(emp.end_date), longDatePattern(lang), lang) : null} />

                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagements" className="mt-4">
          <EmploymentHistoryCard
            employeeId={empId}
            employeeName={`${emp.first_name || ""} ${emp.last_name || ""}`.trim()}
          />
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Landmark className="w-4 h-4" /> {t("Financial")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2">
              <div className="divide-y pr-4">
                <InfoRow label={t("Bank Name")} value={emp.bank_name} />
                <InfoRow label={t("IBAN")} value={emp.iban} />
                <InfoRow label={t("SWIFT/BIC")} value={emp.swift_bic} />
              </div>
              <div className="divide-y pl-0 md:pl-4">
                <InfoRow label={t("Tax Number")} value={emp.tax_number} />
                <InfoRow label={t("Salary")} value={emp.salary ? `€${emp.salary.toLocaleString()}` : null} />
                <InfoRow label={t("Payment Frequency")} value={emp.payment_frequency?.replace(/_/g, " ")} />
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> {t("ID Documents & Payroll Basis")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2">
              <div className="divide-y pr-4">
                <InfoRow label={t("JMBG")} value={emp.jmbg} />
                <InfoRow label={t("ID Card Number")} value={emp.id_card_number} />
                <InfoRow label={t("ID Card Expiry")} value={emp.id_card_expiry ? formatDate(parseISO(emp.id_card_expiry), longDatePattern(lang), lang) : null} />
                <InfoRow label={t("Passport Number")} value={emp.passport_number} />
                <InfoRow label={t("Passport Expiry")} value={emp.passport_expiry ? formatDate(parseISO(emp.passport_expiry), longDatePattern(lang), lang) : null} />
                <InfoRow label={t("Rate Basis")} value={emp.rate_basis ? (emp.rate_basis === "bruto" ? t("Gross") : t("Net")) : null} />
                <InfoRow label={t("Work Fraction")} value={emp.work_fraction != null ? String(emp.work_fraction) : null} />
              </div>
              <div className="divide-y pl-0 md:pl-4">
                <InfoRow label={t("B2C Rate")} value={emp.b2c_hourly_rate != null ? `€${emp.b2c_hourly_rate}` : null} />
                <InfoRow label={t("B2B Rate")} value={emp.b2b_hourly_rate != null ? `€${emp.b2b_hourly_rate}` : null} />
                <InfoRow label={t("Overtime Rate")} value={emp.overtime_rate != null ? `€${emp.overtime_rate}` : null} />
                <InfoRow label={t("Weekend Rate")} value={emp.weekend_rate != null ? `€${emp.weekend_rate}` : null} />
                <InfoRow label={t("Holiday Rate")} value={emp.holiday_rate != null ? `€${emp.holiday_rate}` : null} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emergency" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Heart className="w-4 h-4" /> {t("Emergency Contact")}</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <InfoRow label={t("Name")} value={emp.emergency_contact_name} />
              <InfoRow label={t("Relationship")} value={emp.emergency_contact_relationship} />
              <InfoRow label={t("Phone")} value={emp.emergency_contact_phone} />
              <InfoRow label={t("Address")} value={emp.emergency_contact_address} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> {t("Documents")}</CardTitle>
                <Button size="sm" className="gap-2" onClick={() => { setDocForm({}); setDocDialogOpen(true); }}>
                  <Plus className="w-4 h-4" /> {t("Upload Document")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t("No documents uploaded")}</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors">
                      <div>
                        <p className="text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{doc.category?.replace(/_/g, " ")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.expiration_date && (
                          <span className="text-xs text-muted-foreground">{formatDate(parseISO(doc.expiration_date), longDatePattern(lang), lang)}</span>
                        )}
                        <StatusBadge status={documentStatus(doc.expiration_date)} />
                        {doc.file_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewDoc(doc)}>
                            <Eye className="w-3.5 h-3.5 text-purple-500" />
                          </Button>
                        )}
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="w-3.5 h-3.5" /></Button>
                          </a>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteDocId(doc.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <DocumentPreviewModal doc={previewDoc} open={!!previewDoc} onClose={() => setPreviewDoc(null)} />

          {/* Upload Document Dialog */}
          <Dialog open={docDialogOpen} onOpenChange={(o) => { if (!o) docUpload.discard(); setDocDialogOpen(o); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t("Upload Document")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="empdoc-title">{t("Title *")}</Label>
                  <Input id="empdoc-title" value={docForm.title || ""} onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empdoc-category">{t("Category *")}</Label>
                  <Select value={docForm.category || ""} onValueChange={(v) => setDocForm((p) => ({ ...p, category: v }))}>
                    <SelectTrigger id="empdoc-category"><SelectValue placeholder={t("Select category")} /></SelectTrigger>
                    <SelectContent>
                      {DOC_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empdoc-expiration">{t("Expiration Date")}</Label>
                  <Input id="empdoc-expiration" type="date" value={docForm.expiration_date || ""} onChange={(e) => setDocForm((p) => ({ ...p, expiration_date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empdoc-file">{t("File")}</Label>
                  <label className="cursor-pointer">
                    <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">{docForm.file_name || (uploading ? t("Uploading...") : t("Click to upload"))}</p>
                    </div>
                    <input id="empdoc-file" type="file" aria-label={t("File")} accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={handleFileUpload} className="hidden" />
                  </label>
                  {uploadFailed && (
                    <p className="text-xs text-red-600">
                      {t("The file was not uploaded. Choose another file, or")}{" "}
                      <button type="button" className="underline" onClick={() => setUploadFailed(false)}>{t("save without a file")}</button>.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { docUpload.discard(); setDocDialogOpen(false); }}>{t("Cancel")}</Button>
                <Button onClick={handleDocSave} disabled={createDocMutation.isPending || uploading || uploadFailed}>{t("Save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

      </Tabs>

      <ConfirmDeleteDialog
        open={confirmDeleteEmp}
        onClose={() => setConfirmDeleteEmp(false)}
        onConfirm={() => deleteMutation.mutate()}
        message={t("Delete employee confirm").replace("%s", `${emp.first_name} ${emp.last_name}`)}
      />
      <ConfirmDeleteDialog
        open={!!deleteDocId}
        onClose={() => setDeleteDocId(null)}
        onConfirm={() => deleteDocMutation.mutate(deleteDocId)}
        message={t("Delete document confirm")}
      />
    </div>
  );
}
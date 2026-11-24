import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { FileText, Upload, Trash2, Download, Search, Calendar, Eye } from "lucide-react";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnsavedUpload } from "@/lib/useUnsavedUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { parseISO } from "date-fns";
import { formatDate, longDatePattern } from "@/lib/dateFormat";
import { DOCUMENT_CATEGORIES, documentCategoryLabel } from "@/lib/documentCategories";
import { useLang } from "@/lib/LanguageContext";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { documentStatus } from "@/lib/documentStatus";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import ViewToggle from "@/components/shared/ViewToggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import SortSelect from "@/components/shared/SortSelect";
import { useT, useL } from "@/lib/translations";
import DocumentPreviewModal from "@/components/documents/DocumentPreviewModal";


export default function Documents() {
  const queryClient = useQueryClient();
  const t = useT();
  const L = useL();
  const { lang } = useLang();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [view, setView] = useViewPreference("documents", "list");
  const [sort, setSort] = useState("title_asc");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [deleteDocId, setDeleteDocId] = useState(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => base44.entities.Document.list("-created_date", 200),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Document.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(t("Document uploaded"));
      docUpload.commit();
      setDialogOpen(false);
      setForm({});
    },
  });
  // Kreira se posle mutacije da bi znao da li čuvanje traje (odbacivanje se tada odlaže).
  const docUpload = useUnsavedUpload(createMutation.isPending);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Document.delete(id),
    onSuccess: () => {
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
      setForm((prev) => ({ ...prev, file_url, file_name: file.name }));
    } catch (err) {
      // Izabrani fajl nije otpremljen: čuvanje se blokira dok se ne izabere drugi fajl ili ukloni izbor
      // (ranije se dokument tiho čuvao bez fajla, QA 14.11.2026). Poruku prikazuje lib/errorToasts.js.
      setUploadFailed(true);
      docUpload.discard();
      setForm((prev) => ({ ...prev, file_url: "", file_name: "" }));
      throw err;
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = () => {
    if (!form.employee_id || !form.title || !form.category) {
      toast.error(t("Please fill in all required fields"));
      return;
    }
    createMutation.mutate(form);
  };

  const getEmployeeName = (id) => {
    const emp = employees.find((e) => e.id === id);
    return emp ? `${emp.first_name} ${emp.last_name}` : L("Unknown", "Nepoznato", "Neznáme");
  };

  const SORT_OPTIONS = [
    { value: "title_asc", label: L("Title A → Z", "Naslov A → Z", "Názov A → Z") },
    { value: "title_desc", label: L("Title Z → A", "Naslov Z → A", "Názov Z → A") },
    { value: "employee_asc", label: L("Employee A → Z", "Radnik A → Z", "Zamestnanec A → Z") },
    { value: "expiry_asc", label: L("Expiry (earliest)", "Isticanje (najranije)", "Platnosť (najskôr)") },
    { value: "newest", label: L("Newest First", "Najnovije prvo", "Najnovšie ako prvé") },
  ];

  const filtered = [...documents].filter((d) => {
    const matchSearch = !search || d.title?.toLowerCase().includes(search.toLowerCase()) || d.file_name?.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || d.category === catFilter;
    return matchSearch && matchCat;
  }).sort((a, b) => {
    if (sort === "title_asc") return (a.title || "").localeCompare(b.title || "");
    if (sort === "title_desc") return (b.title || "").localeCompare(a.title || "");
    if (sort === "employee_asc") return getEmployeeName(a.employee_id).localeCompare(getEmployeeName(b.employee_id));
    if (sort === "expiry_asc") return (a.expiration_date || "9999").localeCompare(b.expiration_date || "9999");
    return 0;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Documents")}
        subtitle={`${documents.length} ${t("documents")}`}
        actionLabel={t("Upload Document")}
        onAction={() => { setForm({}); setUploadFailed(false); setDialogOpen(true); }}
      >
        <ViewToggle view={view} onViewChange={setView} />
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("Search documents...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t("Category")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Categories")}</SelectItem>
            {DOCUMENT_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{documentCategoryLabel(c.value, lang)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SortSelect value={sort} onValueChange={setSort} options={SORT_OPTIONS} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title={t("No documents found")} actionLabel={t("Upload Document")} onAction={() => { setForm({}); setUploadFailed(false); setDialogOpen(true); }} />
      ) : view === "grid" ? (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <StatusBadge status={documentStatus(doc.expiration_date)} />
                </div>
                <p className="font-semibold text-sm truncate mb-1">{doc.title}</p>
                <p className="text-xs text-muted-foreground capitalize mb-1">{documentCategoryLabel(doc.category, lang)}</p>
                <p className="text-xs text-muted-foreground truncate">{getEmployeeName(doc.employee_id)}</p>
                {doc.expiration_date && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {formatDate(parseISO(doc.expiration_date), longDatePattern(lang), lang)}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t">
                  {doc.file_url && (
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPreviewDoc(doc)}>
                      <Eye className="w-3.5 h-3.5 text-purple-500" />
                    </Button>
                  )}
                  {doc.file_url && (
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full h-7 text-xs">
                        <Download className="w-3 h-3 mr-1" /> {t("Download")}
                      </Button>
                    </a>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteDocId(doc.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">{t("Document")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{t("Employee")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t("Category")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("Expiry")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("Status")}</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.title}</p>
                          {doc.file_name && <p className="text-xs text-muted-foreground">{doc.file_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{getEmployeeName(doc.employee_id)}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize hidden md:table-cell">{documentCategoryLabel(doc.category, lang)}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {doc.expiration_date ? formatDate(parseISO(doc.expiration_date), longDatePattern(lang), lang) : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={documentStatus(doc.expiration_date)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DocumentPreviewModal doc={previewDoc} open={!!previewDoc} onClose={() => setPreviewDoc(null)} />
      <ConfirmDeleteDialog
        open={!!deleteDocId}
        onClose={() => setDeleteDocId(null)}
        onConfirm={() => deleteMutation.mutate(deleteDocId)}
        message={t("Delete document confirm")}
      />

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) docUpload.discard(); setDialogOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("Upload Document")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-employee">{t("Employee *")}</Label>
              <Select value={form.employee_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, employee_id: v }))}>
                <SelectTrigger id="doc-employee"><SelectValue placeholder={t("Select employee")} /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-title">{t("Title *")}</Label>
              <Input id="doc-title" value={form.title || ""} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-category">{t("Category *")}</Label>
              <Select value={form.category || ""} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger id="doc-category"><SelectValue placeholder={t("Select category")} /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{documentCategoryLabel(c.value, lang)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-expiration">{t("Expiration Date")}</Label>
              <Input id="doc-expiration" type="date" value={form.expiration_date || ""} onChange={(e) => setForm((p) => ({ ...p, expiration_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-file">{t("File")}</Label>
              <label className="cursor-pointer">
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{form.file_name || (uploading ? t("Uploading...") : t("Click to upload"))}</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, WEBP, HEIC · max 20 MB</p>
                </div>
                <input id="doc-file" type="file" aria-label={t("File")} accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={handleFileUpload} className="hidden" />
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
            <Button variant="outline" onClick={() => { docUpload.discard(); setDialogOpen(false); }}>{t("Cancel")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || uploading || uploadFailed}>{t("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Mail, Send, Users, FileText, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { useL } from "@/lib/translations";
import { companyNameOf, fillEmailTemplate, COMPANY_NAME_MISSING } from "@/lib/emailTemplate";

const TEMPLATE_TYPES = [
  { value: "timesheet_reminder", label: "Timesheet Reminder", rs: "Podsetnik za satnicu" },
  { value: "payroll_notification", label: "Payroll Notification", rs: "Obaveštenje o platama" },
  { value: "shift_schedule", label: "Shift Schedule", rs: "Raspored smena" },
  { value: "document_expiry", label: "Document Expiry", rs: "Istek dokumenta" },
  { value: "payment_confirmation", label: "Payment Confirmation", rs: "Potvrda uplate" },
  { value: "contract_reminder", label: "Contract Reminder", rs: "Podsetnik o ugovoru" },
  { value: "general_announcement", label: "General Announcement", rs: "Opšte obaveštenje" },
];

const DEFAULT_TEMPLATES = {
  timesheet_reminder: {
    subject: "Reminder: Please Submit Your Timesheet",
    body: "Dear {employee_name},\n\nThis is a reminder that your weekly timesheet for the week of {week_start} has not yet been submitted.\n\nPlease log in and submit your hours as soon as possible.\n\nBest regards,\n{company_name}",
  },
  payroll_notification: {
    subject: "Your Payroll Has Been Approved",
    body: "Dear {employee_name},\n\nYour payroll for the week of {week_start} has been approved.\n\nTotal Hours: {total_hours}\nAmount: {payroll_amount}\n\nPayment will be processed by {payment_date}.\n\nBest regards,\n{company_name}",
  },
  shift_schedule: {
    subject: "Your Schedule for the Week of {week_start}",
    body: "Dear {employee_name},\n\nPlease find your work schedule for the week of {week_start} below:\n\n{schedule_details}\n\nIf you have any questions, please contact your supervisor.\n\nBest regards,\n{company_name}",
  },
  document_expiry: {
    subject: "Document Expiry Notice: {document_name}",
    body: "Dear {employee_name},\n\nThis is a reminder that your document \"{document_name}\" is expiring on {expiry_date}.\n\nPlease ensure you renew it before the expiry date.\n\nBest regards,\n{company_name}",
  },
  payment_confirmation: {
    subject: "Payment Confirmation",
    body: "Dear {employee_name},\n\nThis is to confirm that your payment of {amount} for the period {period} has been processed.\n\nBest regards,\n{company_name}",
  },
  contract_reminder: {
    subject: "Contract Renewal Reminder",
    body: "Dear {employee_name},\n\nYour employment contract is due for renewal on {expiry_date}. Please contact HR to discuss renewal options.\n\nBest regards,\n{company_name}",
  },
  general_announcement: {
    subject: "{announcement_title}",
    body: "Dear Team,\n\n{announcement_body}\n\nBest regards,\n{company_name}",
  },
};

export default function EmailNotifications() {
  const L = useL();
  const typeLabel = (t) => L(t.label, t.rs);
  const queryClient = useQueryClient();
  const [templateDialog, setTemplateDialog] = useState(false);
  const [sendDialog, setSendDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({});
  const [sendForm, setSendForm] = useState({ subject: "", body: "", recipients: [] });
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["email_templates"],
    queryFn: () => base44.entities.EmailTemplate.list("-created_date", 100),
  });

  // Naziv firme za {company_name} iz „Podaci firme" (D18) — ne upisan u kodu.
  const { data: companyRows = [] } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => base44.entities.CompanySettings.list(null, 1),
  });
  const companyName = companyNameOf(companyRows[0]);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date", 200),
  });

  const createTemplate = useMutation({
    mutationFn: (data) => base44.entities.EmailTemplate.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["email_templates"] }); toast.success(L("Template saved", "Šablon sačuvan")); setTemplateDialog(false); setTemplateForm({}); setEditingTemplate(null); },
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmailTemplate.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["email_templates"] }); toast.success(L("Template updated", "Šablon ažuriran")); setTemplateDialog(false); setEditingTemplate(null); },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id) => base44.entities.EmailTemplate.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["email_templates"] }); toast.success(L("Deleted", "Obrisano")); },
  });

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ type: "general_announcement", is_active: true });
    setTemplateDialog(true);
  };

  const openEditTemplate = (t) => {
    setEditingTemplate(t);
    setTemplateForm({ ...t });
    setTemplateDialog(true);
  };

  const handleTypeChange = (type) => {
    const defaults = DEFAULT_TEMPLATES[type] || {};
    setTemplateForm((p) => ({ ...p, type, ...(!p.subject ? { subject: defaults.subject } : {}), ...(!p.body ? { body: defaults.body } : {}) }));
  };

  const handleSaveTemplate = () => {
    if (!templateForm.name || !templateForm.type || !templateForm.subject || !templateForm.body) {
      toast.error(L("All fields required", "Sva polja su obavezna")); return;
    }
    if (editingTemplate) {
      updateTemplate.mutate({ id: editingTemplate.id, data: templateForm });
    } else {
      createTemplate.mutate(templateForm);
    }
  };

  const openSendDialog = (template = null) => {
    setSendForm(template ? { subject: template.subject, body: template.body } : { subject: "", body: "" });
    setSelectedEmployees([]);
    setSendToAll(false);
    setSendDialog(true);
  };

  const toggleEmployee = (empId) => {
    setSelectedEmployees((prev) => prev.includes(empId) ? prev.filter((e) => e !== empId) : [...prev, empId]);
  };

  const handleSendEmails = async () => {
    const targets = sendToAll
      ? employees.filter((e) => e.email && e.status === "active")
      : employees.filter((e) => selectedEmployees.includes(e.id) && e.email);

    if (targets.length === 0) {
      toast.error(sendToAll ? L("No active employees with an email address", "Nema aktivnih radnika sa email adresom") : L("Select at least one recipient (or tick “Send to all active employees”)", "Izaberite bar jednog primaoca (ili označite „Pošalji svim aktivnim radnicima“)"));
      return;
    }
    if (!sendForm.subject || !sendForm.body) { toast.error(L("Subject and body required", "Naslov i tekst su obavezni")); return; }

    if (!companyName && /{company_name}/.test(`${sendForm.subject} ${sendForm.body}`)) {
      toast.error(L(`Company name is not entered (Settings → Company details) — the message would go out with “${COMPANY_NAME_MISSING}”.`, `Naziv firme nije unet (Podešavanja → Podaci firme) — poruka bi otišla sa „${COMPANY_NAME_MISSING}“.`), { duration: 12000 });
      return;
    }

    setSending(true);
    let successCount = 0;
    try {
      for (const emp of targets) {
        // Menjaju se samo ove dve promenljive, i u naslovu i u telu (ranije samo u telu).
        const fill = (text) => fillEmailTemplate(text, { employeeName: `${emp.first_name} ${emp.last_name}`, companyName });
        const body = fill(sendForm.body);
        await base44.integrations.Core.SendEmail({
          to: emp.email,
          subject: fill(sendForm.subject),
          body,
        });
        successCount++;
      }
    } finally {
      setSending(false); // greška se prikazuje globalno (lib/errorToasts.js)
      if (successCount) toast.success(L(`Email sent to ${successCount} employee(s)`, `Email poslat na ${successCount} radnika`));
    }
    setSendDialog(false);
  };

  const activeEmployees = employees.filter((e) => e.status === "active" && e.email);

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Email Notifications", "Email obaveštenja")}
        subtitle={L("Send emails to employees and manage templates", "Slanje emailova radnicima i upravljanje šablonima")}
        actionLabel={L("Compose Email", "Napiši email")}
        onAction={() => openSendDialog()}
      />

      <Tabs defaultValue="send">
        <TabsList>
          <TabsTrigger value="send"><Send className="w-4 h-4 mr-2" />{L("Send Email", "Pošalji email")}</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="w-4 h-4 mr-2" />{L("Templates", "Šabloni")}</TabsTrigger>
        </TabsList>

        {/* Send Tab */}
        <TabsContent value="send" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATE_TYPES.map((t) => {
              const saved = templates.find((tpl) => tpl.type === t.value);
              return (
                <Card key={t.value} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openSendDialog(saved || { subject: DEFAULT_TEMPLATES[t.value]?.subject, body: DEFAULT_TEMPLATES[t.value]?.body })}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{typeLabel(t)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{L("Click to send using this template", "Kliknite da pošaljete pomoću ovog šablona")}</p>
                      {saved && <Badge className="mt-1 text-[10px] bg-emerald-100 text-emerald-700 border-0">{L("Custom template", "Prilagođeni šablon")}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNewTemplate}><Plus className="w-4 h-4 mr-2" />{L("New Template", "Novi šablon")}</Button>
          </div>
          {templates.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">{L("No templates yet. Create one to get started.", "Još nema šablona. Napravite prvi.")}</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{t.name}</p>
                        <Badge className="text-[10px] bg-muted text-muted-foreground border-0">{(() => { const ty = TEMPLATE_TYPES.find((x) => x.value === t.type); return ty ? typeLabel(ty) : null; })()}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openSendDialog(t)}><Send className="w-3 h-3 mr-1" />{L("Send", "Pošalji")}</Button>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => openEditTemplate(t)}><Edit2 className="w-3 h-3" /></Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-red-500" onClick={() => { if (confirm(L("Delete template?", "Obrisati šablon?"))) deleteTemplate.mutate(t.id); }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Template Edit Dialog */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTemplate ? L("Edit Template", "Uredi šablon") : L("New Template", "Novi šablon")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{L("Template Name *", "Naziv šablona *")}</Label>
              <Input value={templateForm.name || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))} placeholder={L("e.g. Weekly Timesheet Reminder", "npr. Nedeljni podsetnik za satnicu")} />
            </div>
            <div className="space-y-2">
              <Label>{L("Type *", "Tip *")}</Label>
              <Select value={templateForm.type || ""} onValueChange={handleTypeChange}>
                <SelectTrigger><SelectValue placeholder={L("Select type", "Izaberite tip")} /></SelectTrigger>
                <SelectContent>{TEMPLATE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{typeLabel(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{L("Subject *", "Naslov *")}</Label>
              <Input value={templateForm.subject || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, subject: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{L("Body *", "Tekst *")}</Label>
              <Textarea value={templateForm.body || ""} onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))} rows={8} className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">{L("Filled in automatically:", "Popunjava se automatski:")} {"{employee_name}"}, {"{company_name}"}. {L("Other placeholders in the default templates (e.g.", "Ostale oznake u podrazumevanim šablonima (npr.")} {"{week_start}"}, {"{amount}"}) {L("must be replaced by hand before sending.", "moraju se ručno zameniti pre slanja.")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>{L("Cancel", "Otkaži")}</Button>
            <Button onClick={handleSaveTemplate}>{L("Save Template", "Sačuvaj šablon")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{L("Send Email", "Pošalji email")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{L("Subject *", "Naslov *")}</Label>
              <Input value={sendForm.subject || ""} onChange={(e) => setSendForm((p) => ({ ...p, subject: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{L("Body *", "Tekst *")}</Label>
              <Textarea value={sendForm.body || ""} onChange={(e) => setSendForm((p) => ({ ...p, body: e.target.value }))} rows={7} className="text-sm" />
              <p className="text-xs text-muted-foreground">{"{employee_name}"} {L("will be replaced automatically for each recipient", "se automatski zamenjuje za svakog primaoca")}</p>
              <div className="rounded-md border bg-muted/40 p-3" data-testid="email-preview">
                <p className="text-xs font-medium text-muted-foreground mb-1">{L("Preview", "Pregled")}</p>
                <p className="text-sm whitespace-pre-wrap">{fillEmailTemplate(sendForm.body || "", { companyName })}</p>
                {!companyName && (
                  <p className="text-xs text-destructive mt-2">{L("Company name is not entered (Settings → Company details).", "Naziv firme nije unet (Podešavanja → Podaci firme).")}</p>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <Label>{L("Recipients", "Primaoci")}</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="all" checked={sendToAll} onCheckedChange={setSendToAll} />
                <label htmlFor="all" className="text-sm font-medium cursor-pointer">{L("Send to all active employees", "Pošalji svim aktivnim radnicima")} ({activeEmployees.length})</label>
              </div>
              {!sendToAll && (
                <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                  {activeEmployees.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">{L("No employees with email addresses", "Nema radnika sa email adresama")}</p>
                  ) : (
                    activeEmployees.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
                        <Checkbox id={e.id} checked={selectedEmployees.includes(e.id)} onCheckedChange={() => toggleEmployee(e.id)} />
                        <label htmlFor={e.id} className="text-sm cursor-pointer flex-1">
                          {e.first_name} {e.last_name}
                          <span className="text-muted-foreground ml-2 text-xs">{e.email}</span>
                        </label>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>{L("Cancel", "Otkaži")}</Button>
            <Button onClick={handleSendEmails} disabled={sending}>
              {sending ? L("Sending...", "Slanje...") : <><Send className="w-4 h-4 mr-2" />{L("Send Email", "Pošalji email")}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
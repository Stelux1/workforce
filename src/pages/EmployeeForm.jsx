import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowLeft, Save, Upload, User, Phone, Briefcase, Landmark, Heart, IdCard } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/translations";
import { useAuth } from "@/lib/AuthContext";
import { privateFieldErrors, normalizePrivate } from "@/lib/employeePrivate";
import {
  PersonalInfoFields, ContactInfoFields, EmploymentInfoFields,
  FinancialInfoFields, PrivateInfoFields, EmergencyContactFields,
} from "@/components/employees/EmployeeFormFields";

export default function EmployeeForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const T = useT();
  const { isAdmin } = useAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get("id");

  const [form, setForm] = useState({ status: "active" });
  const [uploading, setUploading] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["employee", editId],
    queryFn: () => base44.entities.Employee.filter({ id: editId }),
    enabled: !!editId,
  });

  // Auto-generate employee ID for new employees
  const { data: allEmployees } = useQuery({
    queryKey: ["employees-for-id"],
    queryFn: () => base44.entities.Employee.list("-created_date", 100),
    enabled: !editId,
  });

  useEffect(() => {
    if (existing?.[0]) setForm(existing[0]);
  }, [existing]);

  useEffect(() => {
    if (editId || !allEmployees) return;
    // Find the highest EMP-XXX number among existing employees
    const nums = allEmployees
      .map((e) => {
        const match = e.employee_id?.match(/^EMP-(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      });
    const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    const nextId = `EMP-${String(next).padStart(3, "0")}`;
    setForm((prev) => prev.employee_id ? prev : { ...prev, employee_id: nextId });
  }, [allEmployees, editId]);

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editId
        ? base44.entities.Employee.update(editId, data)
        : base44.entities.Employee.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success(T("Employee saved"));
      navigate("/employees");
    },
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // „Maks 5MB" sa ekrana se sada i proverava (ranije je prolazila i fotografija od 6 MB).
      const { file_url } = await base44.integrations.Core.UploadFile({ file, maxBytes: 5 * 1024 * 1024 });
      setForm((prev) => ({ ...prev, profile_photo: file_url }));
    } finally {
      setUploading(false); // greška se prikazuje globalno (lib/errorToasts.js)
      e.target.value = ""; // isti fajl može ponovo da se izabere posle greške
    }
  };

  const handleSave = () => {
    if (!form.first_name || !form.last_name) {
      toast.error(T("Please fill in all required fields"));
      return;
    }
    if (!isAdmin) {
      saveMutation.mutate(form);
      return;
    }
    const errors = privateFieldErrors(form);
    if (errors.length) {
      toast.error(errors.map((e) => T(e)).join(" · "));
      return;
    }
    saveMutation.mutate(normalizePrivate(form));
  };

  const sections = [
    { title: T("Personal Information"), icon: User, content: <PersonalInfoFields form={form} setForm={setForm} /> },
    { title: T("Contact Information"), icon: Phone, content: <ContactInfoFields form={form} setForm={setForm} /> },
    { title: T("Employment Information"), icon: Briefcase, content: <EmploymentInfoFields form={form} setForm={setForm} /> },
    ...(isAdmin ? [
      { title: T("Financial Information"), icon: Landmark, content: <FinancialInfoFields form={form} setForm={setForm} /> },
      { title: T("ID Documents & Payroll Basis"), icon: IdCard, content: <PrivateInfoFields form={form} setForm={setForm} /> },
    ] : []),
    { title: T("Emergency Contact"), icon: Heart, content: <EmergencyContactFields form={form} setForm={setForm} /> },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">{editId ? T("Edit Employee") : T("New Employee")}</h1>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? T("Saving...") : T("Save")}
        </Button>
      </div>

      {/* Profile Photo */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            {form.profile_photo ? (
              <img src={form.profile_photo} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <User className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <label className="cursor-pointer">
                <Button variant="outline" className="gap-2" disabled={uploading} asChild>
                  <span>
                    <Upload className="w-4 h-4" />
                    {uploading ? T("Uploading...") : T("Upload Photo")}
                  </span>
                </Button>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              <p className="text-xs text-muted-foreground mt-1">{T("JPG, PNG. Max 5MB.")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Accordion type="single" collapsible className="w-full">
          {sections.map((section, idx) => (
            <AccordionItem key={section.title} value={`section-${idx}`} className="border-b last:border-b-0">
              <AccordionTrigger className="hover:no-underline px-6 py-4 flex items-center gap-2 [&>svg:last-child]:rotate-0">
                <section.icon className="w-5 h-5 text-primary" />
                <span className="text-lg font-semibold">{section.title}</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                {section.content}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </div>
  );
}
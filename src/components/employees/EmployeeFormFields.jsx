import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";

const NATIONALITIES = [
  { en: "Afghan", rs: "Afganistanog" },
  { en: "Albanian", rs: "Albanac" },
  { en: "Algerian", rs: "Alžirac" },
  { en: "American", rs: "Amerikanac" },
  { en: "Andorran", rs: "Andoranac" },
  { en: "Angolan", rs: "Angolac" },
  { en: "Argentine", rs: "Argentinac" },
  { en: "Armenian", rs: "Jermenin" },
  { en: "Australian", rs: "Australijanac" },
  { en: "Austrian", rs: "Austrijanac" },
  { en: "Azerbaijani", rs: "Azerbejdžanac" },
  { en: "Bahraini", rs: "Bahrejanac" },
  { en: "Bangladeshi", rs: "Bangladešanin" },
  { en: "Belarusian", rs: "Belorusin" },
  { en: "Belgian", rs: "Belgijanac" },
  { en: "Bolivian", rs: "Bolivijac" },
  { en: "Bosnian", rs: "Bosanac" },
  { en: "Brazilian", rs: "Brazilac" },
  { en: "British", rs: "Britanac" },
  { en: "Bulgarian", rs: "Bugarin" },
  { en: "Cambodian", rs: "Kambodžanin" },
  { en: "Cameroonian", rs: "Kamerunac" },
  { en: "Canadian", rs: "Kanadjanin" },
  { en: "Chilean", rs: "Čileanac" },
  { en: "Chinese", rs: "Kinez" },
  { en: "Colombian", rs: "Kolumbijac" },
  { en: "Croatian", rs: "Hrvat" },
  { en: "Cuban", rs: "Kubanac" },
  { en: "Czech", rs: "Čeh" },
  { en: "Danish", rs: "Danac" },
  { en: "Dominican", rs: "Dominikanac" },
  { en: "Dutch", rs: "Holanđanin" },
  { en: "Ecuadorian", rs: "Ekvadorac" },
  { en: "Egyptian", rs: "Egipćanin" },
  { en: "Emirati", rs: "Emiratanin" },
  { en: "Estonian", rs: "Estonac" },
  { en: "Ethiopian", rs: "Etiopjanin" },
  { en: "Finnish", rs: "Finac" },
  { en: "French", rs: "Francuz" },
  { en: "Georgian", rs: "Gruzijac" },
  { en: "German", rs: "Nemac" },
  { en: "Ghanaian", rs: "Ganac" },
  { en: "Greek", rs: "Grk" },
  { en: "Guatemalan", rs: "Gvatemalac" },
  { en: "Hungarian", rs: "Mađar" },
  { en: "Indian", rs: "Indijac" },
  { en: "Indonesian", rs: "Indonežanin" },
  { en: "Iranian", rs: "Iranac" },
  { en: "Iraqi", rs: "Iračanin" },
  { en: "Irish", rs: "Irac" },
  { en: "Israeli", rs: "Izraelac" },
  { en: "Italian", rs: "Italijan" },
  { en: "Ivorian", rs: "Obalokostarac" },
  { en: "Jamaican", rs: "Jamajčanin" },
  { en: "Japanese", rs: "Japanac" },
  { en: "Jordanian", rs: "Jordanac" },
  { en: "Kazakhstani", rs: "Kazahstanac" },
  { en: "Kenyan", rs: "Kenijac" },
  { en: "Kuwaiti", rs: "Kuvajtanin" },
  { en: "Latvian", rs: "Latvijac" },
  { en: "Lebanese", rs: "Libanac" },
  { en: "Libyan", rs: "Libijac" },
  { en: "Lithuanian", rs: "Litvanac" },
  { en: "Luxembourgish", rs: "Luksemburžanin" },
  { en: "Malaysian", rs: "Malezijac" },
  { en: "Maltese", rs: "Maltežanin" },
  { en: "Mexican", rs: "Meksikanac" },
  { en: "Moldovan", rs: "Moldavac" },
  { en: "Montenegrin", rs: "Crnogorac" },
  { en: "Moroccan", rs: "Marokanac" },
  { en: "Mozambican", rs: "Mozambičanin" },
  { en: "Namibian", rs: "Namibijac" },
  { en: "New Zealander", rs: "Novozelandjanin" },
  { en: "Nigerian", rs: "Nigerijac" },
  { en: "Norwegian", rs: "Norvežanin" },
  { en: "Pakistani", rs: "Pakistanac" },
  { en: "Palestinian", rs: "Palestinac" },
  { en: "Paraguayan", rs: "Paragvajac" },
  { en: "Peruvian", rs: "Peruanac" },
  { en: "Philippine", rs: "Filipinac" },
  { en: "Polish", rs: "Poljakin" },
  { en: "Portuguese", rs: "Portugalac" },
  { en: "Qatari", rs: "Katarčanin" },
  { en: "Romanian", rs: "Rumun" },
  { en: "Russian", rs: "Rus" },
  { en: "Saudi", rs: "Sauđanin" },
  { en: "Serbian", rs: "Srbin" },
  { en: "Singaporean", rs: "Singapurac" },
  { en: "Slovak", rs: "Slovak" },
  { en: "Slovenian", rs: "Slovenac" },
  { en: "South African", rs: "Južnoafrikanac" },
  { en: "South Korean", rs: "Južnokoreanac" },
  { en: "Spanish", rs: "Španac" },
  { en: "Sri Lankan", rs: "Šrilančanin" },
  { en: "Swedish", rs: "Šveđanin" },
  { en: "Swiss", rs: "Švajcarac" },
  { en: "Syrian", rs: "Sirijac" },
  { en: "Taiwanese", rs: "Tajvanac" },
  { en: "Thai", rs: "Tajlanđanin" },
  { en: "Tunisian", rs: "Tunižanin" },
  { en: "Turkish", rs: "Turčin" },
  { en: "Ukrainian", rs: "Ukraninac" },
  { en: "Uruguayan", rs: "Urugvajac" },
  { en: "Uzbekistani", rs: "Uzbekistanac" },
  { en: "Venezuelan", rs: "Venecuelanac" },
  { en: "Vietnamese", rs: "Vijetnamac" },
  { en: "Yemeni", rs: "Jemenac" },
  { en: "Zambian", rs: "Zambijac" },
  { en: "Zimbabwean", rs: "Zimbabveanac" },
];

const COUNTRIES = [
  { en: "Albania", rs: "Albanija" },
  { en: "Austria", rs: "Austrija" },
  { en: "Belgium", rs: "Belgija" },
  { en: "Bosnia and Herzegovina", rs: "Bosna i Hercegovina" },
  { en: "Bulgaria", rs: "Bugarska" },
  { en: "Croatia", rs: "Hrvatska" },
  { en: "Cyprus", rs: "Kipar" },
  { en: "Czech Republic", rs: "Češka" },
  { en: "Denmark", rs: "Danska" },
  { en: "Estonia", rs: "Estonija" },
  { en: "Finland", rs: "Finska" },
  { en: "France", rs: "Francuska" },
  { en: "Germany", rs: "Nemačka" },
  { en: "Greece", rs: "Grčka" },
  { en: "Hungary", rs: "Mađarska" },
  { en: "Ireland", rs: "Irska" },
  { en: "Italy", rs: "Italija" },
  { en: "Kosovo", rs: "Kosovo" },
  { en: "Latvia", rs: "Latvija" },
  { en: "Lithuania", rs: "Litvanija" },
  { en: "Luxembourg", rs: "Luksemburg" },
  { en: "Malta", rs: "Malta" },
  { en: "Moldova", rs: "Moldavija" },
  { en: "Montenegro", rs: "Crna Gora" },
  { en: "Netherlands", rs: "Holandija" },
  { en: "North Macedonia", rs: "Severna Makedonija" },
  { en: "Norway", rs: "Norveška" },
  { en: "Poland", rs: "Poljska" },
  { en: "Portugal", rs: "Portugalija" },
  { en: "Romania", rs: "Rumunija" },
  { en: "Russia", rs: "Rusija" },
  { en: "Serbia", rs: "Srbija" },
  { en: "Slovakia", rs: "Slovačka" },
  { en: "Slovenia", rs: "Slovenija" },
  { en: "Spain", rs: "Španija" },
  { en: "Sweden", rs: "Švedska" },
  { en: "Switzerland", rs: "Švajcarska" },
  { en: "Turkey", rs: "Turska" },
  { en: "Ukraine", rs: "Ukrajina" },
  { en: "United Kingdom", rs: "Ujedinjeno Kraljevstvo" },
  { en: "United States", rs: "Sjedinjene Države" },
  { en: "Australia", rs: "Australija" },
  { en: "Canada", rs: "Kanada" },
  { en: "China", rs: "Kina" },
  { en: "India", rs: "Indija" },
  { en: "Japan", rs: "Japan" },
  { en: "Brazil", rs: "Brazil" },
  { en: "South Africa", rs: "Južna Afrika" },
  { en: "Other", rs: "Ostalo" },
];

export function PersonalInfoFields({ form, setForm }) {
  const T = useT();
  const { lang } = useLang();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{T("First Name *")}</Label>
        <Input value={form.first_name || ""} onChange={(e) => update("first_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Last Name *")}</Label>
        <Input value={form.last_name || ""} onChange={(e) => update("last_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Date of Birth")}</Label>
        <Input type="date" value={form.date_of_birth || ""} onChange={(e) => update("date_of_birth", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Gender")}</Label>
        <Select value={form.gender || ""} onValueChange={(v) => update("gender", v)}>
          <SelectTrigger><SelectValue placeholder={T("Select gender")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="male">{T("Male")}</SelectItem>
            <SelectItem value="female">{T("Female")}</SelectItem>
            <SelectItem value="other">{T("Other")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{T("Nationality")}</Label>
        <Select value={form.nationality || ""} onValueChange={(v) => update("nationality", v)}>
          <SelectTrigger><SelectValue placeholder={T("Select nationality")} /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {NATIONALITIES.map((n) => (
              <SelectItem key={n.en} value={n.en}>
                {lang === "rs" ? n.rs : n.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function ContactInfoFields({ form, setForm }) {
  const T = useT();
  const { lang } = useLang();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{T("Phone")}</Label>
        <Input value={form.phone || ""} onChange={(e) => update("phone", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Email")}</Label>
        <Input type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>{T("Address")}</Label>
        <Input value={form.address || ""} onChange={(e) => update("address", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("City")}</Label>
        <Input value={form.city || ""} onChange={(e) => update("city", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Postal Code")}</Label>
        <Input value={form.postal_code || ""} onChange={(e) => update("postal_code", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Country")}</Label>
        <Select value={form.country || ""} onValueChange={(v) => update("country", v)}>
          <SelectTrigger><SelectValue placeholder={T("Select country")} /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {COUNTRIES.map((c) => (
              <SelectItem key={c.en} value={c.en}>
                {lang === "rs" ? c.rs : c.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function EmploymentInfoFields({ form, setForm }) {
  const T = useT();
  const { lang } = useLang();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const { data: deptConfigs = [] } = useQuery({
    queryKey: ["department-configs"],
    queryFn: () => base44.entities.DepartmentConfig.list("name", 200),
  });

  const selectedDept = deptConfigs.find((d) => d.name === form.department);
  const positions = selectedDept?.positions || [];

  const getDisplayName = (item, translateKey) => {
    if (lang === "rs" && item.translation) {
      return item.translation;
    }
    return translateKey ? T(item.name) : item.name;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{T("Employee ID")}</Label>
        <Input value={form.employee_id || ""} onChange={(e) => update("employee_id", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Department")}</Label>
        {deptConfigs.length > 0 ? (
          <Select value={form.department || ""} onValueChange={(v) => { update("department", v); update("position", ""); }}>
            <SelectTrigger><SelectValue placeholder={T("Select department")} /></SelectTrigger>
            <SelectContent>
              {deptConfigs.map((d) => (
                <SelectItem key={d.id} value={d.name}>{getDisplayName(d, true)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={form.department || ""} onChange={(e) => update("department", e.target.value)} placeholder={T("No departments configured yet")} />
        )}
      </div>
      <div className="space-y-2">
        <Label>{T("Position")}</Label>
        {positions.length > 0 ? (
          <Select value={form.position || ""} onValueChange={(v) => update("position", v)}>
            <SelectTrigger><SelectValue placeholder={T("Select position")} /></SelectTrigger>
            <SelectContent>
              {positions.map((pos) => (
                <SelectItem key={pos.name} value={pos.name}>{getDisplayName(pos, false)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={form.position || ""} onChange={(e) => update("position", e.target.value)} placeholder={form.department ? T("No positions in this department") : T("Select a department first")} />
        )}
      </div>
      <div className="space-y-2">
        <Label>{T("Employment Type")}</Label>
        <Select value={form.employment_type || ""} onValueChange={(v) => update("employment_type", v)}>
          <SelectTrigger><SelectValue placeholder={T("Select type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="full_time">{T("Full-time")}</SelectItem>
            <SelectItem value="part_time">{T("Part-time")}</SelectItem>
            <SelectItem value="temporary">{T("Temporary")}</SelectItem>
            <SelectItem value="contractor">{T("Contractor")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{T("Start Date")}</Label>
        <Input type="date" value={form.start_date || ""} onChange={(e) => update("start_date", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("End Date")}</Label>
        <Input type="date" value={form.end_date || ""} onChange={(e) => update("end_date", e.target.value)} />
      </div>


      <div className="space-y-2">
        <Label>{T("Status")}</Label>
        <Select value={form.status || "active"} onValueChange={(v) => update("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{T("Active")}</SelectItem>
            <SelectItem value="suspended">{T("Suspended")}</SelectItem>
            <SelectItem value="on_leave">{T("On Leave")}</SelectItem>
            <SelectItem value="terminated">{T("Terminated")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function FinancialInfoFields({ form, setForm }) {
  const T = useT();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{T("Bank Name")}</Label>
        <Input value={form.bank_name || ""} onChange={(e) => update("bank_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("IBAN")}</Label>
        <Input value={form.iban || ""} onChange={(e) => update("iban", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("SWIFT/BIC")}</Label>
        <Input value={form.swift_bic || ""} onChange={(e) => update("swift_bic", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Tax Number")}</Label>
        <Input value={form.tax_number || ""} onChange={(e) => update("tax_number", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Salary")}</Label>
        <Input type="number" value={form.salary || ""} onChange={(e) => update("salary", parseFloat(e.target.value) || 0)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Payment Frequency")}</Label>
        <Select value={form.payment_frequency || ""} onValueChange={(v) => update("payment_frequency", v)}>
          <SelectTrigger><SelectValue placeholder={T("Select frequency")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">{T("Monthly")}</SelectItem>
            <SelectItem value="bi_weekly">{T("Bi-weekly")}</SelectItem>
            <SelectItem value="weekly">{T("Weekly")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function PayrollInfoFields({ form, setForm }) {
  const T = useT();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{T("B2C Hourly Rate (€) — Worker Pay")}</Label>
        <Input type="number" step="0.01" value={form.b2c_hourly_rate || ""} onChange={(e) => update("b2c_hourly_rate", parseFloat(e.target.value) || 0)} placeholder={T("e.g. 20.00")} />
      </div>
      <div className="space-y-2">
        <Label>{T("B2B Hourly Rate (€) — Client Billing")}</Label>
        <Input type="number" step="0.01" value={form.b2b_hourly_rate || ""} onChange={(e) => update("b2b_hourly_rate", parseFloat(e.target.value) || 0)} placeholder={T("e.g. 35.00")} />
      </div>
      {(form.b2c_hourly_rate || form.b2b_hourly_rate) ? (
        <div className="md:col-span-2 bg-muted/50 rounded-lg p-3 text-sm flex gap-6">
          <span>{T("Profit/hour")}: <strong className="text-emerald-600">€{((form.b2b_hourly_rate || 0) - (form.b2c_hourly_rate || 0)).toFixed(2)}</strong></span>
          <span>{T("Margin")}: <strong>{form.b2b_hourly_rate > 0 ? ((((form.b2b_hourly_rate || 0) - (form.b2c_hourly_rate || 0)) / form.b2b_hourly_rate) * 100).toFixed(1) : 0}%</strong></span>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>{T("Overtime Rate (€/h)")}</Label>
        <Input type="number" step="0.01" value={form.overtime_rate || ""} onChange={(e) => update("overtime_rate", parseFloat(e.target.value) || 0)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Weekend Rate (€/h)")}</Label>
        <Input type="number" step="0.01" value={form.weekend_rate || ""} onChange={(e) => update("weekend_rate", parseFloat(e.target.value) || 0)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Holiday Rate (€/h)")}</Label>
        <Input type="number" step="0.01" value={form.holiday_rate || ""} onChange={(e) => update("holiday_rate", parseFloat(e.target.value) || 0)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Payment Type")}</Label>
        <Select value={form.payment_type || "hourly"} onValueChange={(v) => update("payment_type", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hourly">{T("Hourly")}</SelectItem>
            <SelectItem value="daily">{T("Daily")}</SelectItem>
            <SelectItem value="weekly">{T("Weekly")}</SelectItem>
            <SelectItem value="monthly">{T("Monthly")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{T("Payroll Status")}</Label>
        <Select value={form.payroll_status || "active"} onValueChange={(v) => update("payroll_status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{T("Active")}</SelectItem>
            <SelectItem value="on_hold">{T("On Hold")}</SelectItem>
            <SelectItem value="closed">{T("Closed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{T("Preferred Payment Method")}</Label>
        <Input value={form.preferred_payment_method || ""} onChange={(e) => update("preferred_payment_method", e.target.value)} placeholder={T("e.g. Bank Transfer")} />
      </div>
      <div className="space-y-2">
        <Label>{T("VAT Number")}</Label>
        <Input value={form.vat_number || ""} onChange={(e) => update("vat_number", e.target.value)} />
      </div>
    </div>
  );
}

export function EmergencyContactFields({ form, setForm }) {
  const T = useT();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>{T("Contact Name")}</Label>
        <Input value={form.emergency_contact_name || ""} onChange={(e) => update("emergency_contact_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Relationship")}</Label>
        <Input value={form.emergency_contact_relationship || ""} onChange={(e) => update("emergency_contact_relationship", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{T("Phone")}</Label>
        <Input value={form.emergency_contact_phone || ""} onChange={(e) => update("emergency_contact_phone", e.target.value)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>{T("Address")}</Label>
        <Input value={form.emergency_contact_address || ""} onChange={(e) => update("emergency_contact_address", e.target.value)} />
      </div>
    </div>
  );
}
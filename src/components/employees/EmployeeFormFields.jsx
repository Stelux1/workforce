import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { jmbgValid } from "@/lib/jmbg";
import { NATIONALITY_SK, COUNTRY_SK } from "@/lib/geoNames.sk";

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
  const uid = useId();
  const T = useT();
  const { lang } = useLang();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${uid}-first_name`}>{T("First Name *")}</Label>
        <Input id={`${uid}-first_name`} value={form.first_name || ""} onChange={(e) => update("first_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-last_name`}>{T("Last Name *")}</Label>
        <Input id={`${uid}-last_name`} value={form.last_name || ""} onChange={(e) => update("last_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-date_of_birth`}>{T("Date of Birth")}</Label>
        <Input id={`${uid}-date_of_birth`} type="date" value={form.date_of_birth || ""} onChange={(e) => update("date_of_birth", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-gender`}>{T("Gender")}</Label>
        <Select value={form.gender || ""} onValueChange={(v) => update("gender", v)}>
          <SelectTrigger id={`${uid}-gender`}><SelectValue placeholder={T("Select gender")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="male">{T("Male")}</SelectItem>
            <SelectItem value="female">{T("Female")}</SelectItem>
            <SelectItem value="other">{T("Other")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-nationality`}>{T("Nationality")}</Label>
        <Select value={form.nationality || ""} onValueChange={(v) => update("nationality", v)}>
          <SelectTrigger id={`${uid}-nationality`}><SelectValue placeholder={T("Select nationality")} /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {NATIONALITIES.map((n) => (
              <SelectItem key={n.en} value={n.en}>
                {lang === "rs" ? n.rs : lang === "sk" ? (NATIONALITY_SK[n.en] || n.en) : n.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function ContactInfoFields({ form, setForm }) {
  const uid = useId();
  const T = useT();
  const { lang } = useLang();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${uid}-phone`}>{T("Phone")}</Label>
        <Input id={`${uid}-phone`} value={form.phone || ""} onChange={(e) => update("phone", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-email`}>{T("Email")}</Label>
        <Input id={`${uid}-email`} type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${uid}-address`}>{T("Address")}</Label>
        <Input id={`${uid}-address`} value={form.address || ""} onChange={(e) => update("address", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-city`}>{T("City")}</Label>
        <Input id={`${uid}-city`} value={form.city || ""} onChange={(e) => update("city", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-postal_code`}>{T("Postal Code")}</Label>
        <Input id={`${uid}-postal_code`} value={form.postal_code || ""} onChange={(e) => update("postal_code", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-country`}>{T("Country")}</Label>
        <Select value={form.country || ""} onValueChange={(v) => update("country", v)}>
          <SelectTrigger id={`${uid}-country`}><SelectValue placeholder={T("Select country")} /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {COUNTRIES.map((c) => (
              <SelectItem key={c.en} value={c.en}>
                {lang === "rs" ? c.rs : lang === "sk" ? (COUNTRY_SK[c.en] || c.en) : c.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function EmploymentInfoFields({ form, setForm }) {
  const uid = useId();
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
    return translateKey ? T(item.name) : item.name;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${uid}-employee_id`}>{T("Employee ID")}</Label>
        <Input id={`${uid}-employee_id`} value={form.employee_id || ""} onChange={(e) => update("employee_id", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-department`}>{T("Department")}</Label>
        {deptConfigs.length > 0 ? (
          <Select value={form.department || ""} onValueChange={(v) => { update("department", v); update("position", ""); }}>
            <SelectTrigger id={`${uid}-department`}><SelectValue placeholder={T("Select department")} /></SelectTrigger>
            <SelectContent>
              {deptConfigs.map((d) => (
                <SelectItem key={d.id} value={d.name}>{getDisplayName(d, true)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input id={`${uid}-department`} value={form.department || ""} onChange={(e) => update("department", e.target.value)} placeholder={T("No departments configured yet")} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-position`}>{T("Position")}</Label>
        {positions.length > 0 ? (
          <Select value={form.position || ""} onValueChange={(v) => update("position", v)}>
            <SelectTrigger id={`${uid}-position`}><SelectValue placeholder={T("Select position")} /></SelectTrigger>
            <SelectContent>
              {positions.map((pos) => (
                <SelectItem key={pos.name} value={pos.name}>{getDisplayName(pos, false)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input id={`${uid}-position`} value={form.position || ""} onChange={(e) => update("position", e.target.value)} placeholder={form.department ? T("No positions in this department") : T("Select a department first")} />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-employment_type`}>{T("Employment Type")}</Label>
        <Select value={form.employment_type || ""} onValueChange={(v) => update("employment_type", v)}>
          <SelectTrigger id={`${uid}-employment_type`}><SelectValue placeholder={T("Select type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="full_time">{T("Full-time")}</SelectItem>
            <SelectItem value="part_time">{T("Part-time")}</SelectItem>
            <SelectItem value="temporary">{T("Temporary")}</SelectItem>
            <SelectItem value="contractor">{T("Contractor")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-start_date`}>{T("Start Date")}</Label>
        <Input id={`${uid}-start_date`} type="date" value={form.start_date || ""} onChange={(e) => update("start_date", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-end_date`}>{T("End Date")}</Label>
        <Input id={`${uid}-end_date`} type="date" value={form.end_date || ""} onChange={(e) => update("end_date", e.target.value)} />
      </div>


      <div className="space-y-2">
        <Label htmlFor={`${uid}-status`}>{T("Status")}</Label>
        <Select value={form.status || "active"} onValueChange={(v) => update("status", v)}>
          <SelectTrigger id={`${uid}-status`}><SelectValue /></SelectTrigger>
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
  const uid = useId();
  const T = useT();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${uid}-bank_name`}>{T("Bank Name")}</Label>
        <Input id={`${uid}-bank_name`} value={form.bank_name || ""} onChange={(e) => update("bank_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-iban`}>{T("IBAN")}</Label>
        <Input id={`${uid}-iban`} value={form.iban || ""} onChange={(e) => update("iban", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-swift_bic`}>{T("SWIFT/BIC")}</Label>
        <Input id={`${uid}-swift_bic`} value={form.swift_bic || ""} onChange={(e) => update("swift_bic", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-tax_number`}>{T("Tax Number")}</Label>
        <Input id={`${uid}-tax_number`} value={form.tax_number || ""} onChange={(e) => update("tax_number", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-salary`}>{T("Salary")}</Label>
        <Input id={`${uid}-salary`} type="number" value={form.salary || ""} onChange={(e) => update("salary", parseFloat(e.target.value) || 0)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-payment_frequency`}>{T("Payment Frequency")}</Label>
        <Select value={form.payment_frequency || ""} onValueChange={(v) => update("payment_frequency", v)}>
          <SelectTrigger id={`${uid}-payment_frequency`}><SelectValue placeholder={T("Select frequency")} /></SelectTrigger>
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

export function PrivateInfoFields({ form, setForm }) {
  const uid = useId();
  const T = useT();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const jmbgBad = !jmbgValid(String(form.jmbg ?? "").trim());

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${uid}-jmbg`}>{T("JMBG")}</Label>
        <Input
          id={`${uid}-jmbg`}
          value={form.jmbg || ""}
          inputMode="numeric"
          maxLength={13}
          aria-invalid={jmbgBad}
          className={jmbgBad ? "border-destructive" : ""}
          onChange={(e) => update("jmbg", e.target.value)}
        />
        {jmbgBad && <p className="text-xs text-destructive">{T("JMBG must be 13 digits with a valid check digit")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-foreign_personal_number`}>{T("Foreign Personal Number")}</Label>
        <Input
          id={`${uid}-foreign_personal_number`}
          value={form.foreign_personal_number || ""}
          placeholder={T("OIB, rodné číslo or another country's personal number")}
          maxLength={40}
          onChange={(e) => update("foreign_personal_number", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-id_card_number`}>{T("ID Card Number")}</Label>
        <Input id={`${uid}-id_card_number`} value={form.id_card_number || ""} onChange={(e) => update("id_card_number", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-id_card_expiry`}>{T("ID Card Expiry")}</Label>
        <Input id={`${uid}-id_card_expiry`} type="date" value={form.id_card_expiry || ""} onChange={(e) => update("id_card_expiry", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-passport_number`}>{T("Passport Number")}</Label>
        <Input id={`${uid}-passport_number`} value={form.passport_number || ""} onChange={(e) => update("passport_number", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-passport_expiry`}>{T("Passport Expiry")}</Label>
        <Input id={`${uid}-passport_expiry`} type="date" value={form.passport_expiry || ""} onChange={(e) => update("passport_expiry", e.target.value)} />
      </div>
    </div>
  );
}

export function EmergencyContactFields({ form, setForm }) {
  const uid = useId();
  const T = useT();
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor={`${uid}-emergency_contact_name`}>{T("Contact Name")}</Label>
        <Input id={`${uid}-emergency_contact_name`} value={form.emergency_contact_name || ""} onChange={(e) => update("emergency_contact_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-emergency_contact_relationship`}>{T("Relationship")}</Label>
        <Input id={`${uid}-emergency_contact_relationship`} value={form.emergency_contact_relationship || ""} onChange={(e) => update("emergency_contact_relationship", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-emergency_contact_phone`}>{T("Phone")}</Label>
        <Input id={`${uid}-emergency_contact_phone`} value={form.emergency_contact_phone || ""} onChange={(e) => update("emergency_contact_phone", e.target.value)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${uid}-emergency_contact_address`}>{T("Address")}</Label>
        <Input id={`${uid}-emergency_contact_address`} value={form.emergency_contact_address || ""} onChange={(e) => update("emergency_contact_address", e.target.value)} />
      </div>
    </div>
  );
}
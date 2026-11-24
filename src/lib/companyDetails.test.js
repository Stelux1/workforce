import { describe, it, expect } from "vitest";
import {
  taxIdValid, zipValid, formatAddress, registrationNumberValid, normalizeCompany, companyErrors, companyIsEmpty, companyHeader,
  logoProblem, LOGO_MAX_BYTES, COMPANY_FIELDS,
} from "@/lib/companyDetails";
import { PRIMARY_KEY } from "@/api/base44Client";

const fileOf = (bytes, size) => {
  const blob = new Blob([new Uint8Array(bytes)]);
  return size ? { size, slice: (a, b) => blob.slice(a, b) } : blob;
};

describe("Tax ID, ZIP i matični broj", () => {
  it("prazno je dozvoljeno", () => {
    expect(taxIdValid("")).toBe(true);
    expect(taxIdValid(null)).toBe(true);
    expect(zipValid(undefined)).toBe(true);
    expect(registrationNumberValid(undefined)).toBe(true);
  });
  it("Tax ID je slobodnog formata (nema više srpske provere 9 cifara), do 30 znakova", () => {
    expect(taxIdValid("SK2020123456")).toBe(true);
    expect(taxIdValid("2020123456")).toBe(true);
    expect(taxIdValid("12345678")).toBe(true);
    expect(taxIdValid("x".repeat(30))).toBe(true);
    expect(taxIdValid("x".repeat(31))).toBe(false);
  });
  it("ZIP je slobodnog formata, do 12 znakova", () => {
    expect(zipValid("821 06")).toBe(true);
    expect(zipValid("1".repeat(13))).toBe(false);
  });
  it("nema polja PIB — samo Tax ID i ZIP", () => {
    expect(COMPANY_FIELDS).not.toContain("pib");
    expect(COMPANY_FIELDS).toEqual(expect.arrayContaining(["tax_id", "zip"]));
  });
  it("matični broj ima tačno 8 cifara", () => {
    expect(registrationNumberValid("12345678")).toBe(true);
    expect(registrationNumberValid("1234567")).toBe(false);
    expect(registrationNumberValid("123456789")).toBe(false);
  });
  it("companyErrors javlja samo pogrešna polja", () => {
    expect(companyErrors({ tax_id: "SK2020123456", registration_number: "1" })).toEqual({ registration_number: "registration_number" });
    expect(companyErrors({ tax_id: "x".repeat(31), zip: "1".repeat(13) })).toEqual({ tax_id: "tax_id", zip: "zip" });
    expect(companyErrors({})).toEqual({});
  });
});

describe("normalizeCompany / companyIsEmpty", () => {
  it("prazna i razmaci postaju null", () => {
    const n = normalizeCompany({ name: "  ", tax_id: "", zip: " 821 06 ", address: " Ulica 1 " });
    expect(n.name).toBeNull();
    expect(n.tax_id).toBeNull();
    expect(n.zip).toBe("821 06");
    expect(n.address).toBe("Ulica 1");
  });
  it("prazan red je prazan; logo se računa kao popunjen", () => {
    expect(companyIsEmpty({ name: null, tax_id: "", zip: "", logo_url: null })).toBe(true);
    expect(companyIsEmpty({ zip: "821 06" })).toBe(false);
    expect(companyIsEmpty({ name: null, logo_url: "x" })).toBe(false);
  });
});

describe("adresa", () => {
  it("„Adresa, ZIP Grad“ — samo uneti delovi", () => {
    expect(formatAddress({ address: "Dvojkrížna ulica 12227/49", zip: "821 06", city: "Bratislava" }))
      .toBe("Dvojkrížna ulica 12227/49, 821 06 Bratislava");
    expect(formatAddress({ address: "Ulica 1", city: "Bratislava" })).toBe("Ulica 1, Bratislava");
    expect(formatAddress({ zip: "821 06", city: "Bratislava" })).toBe("821 06 Bratislava");
    expect(formatAddress({ address: " ", zip: null, city: "" })).toBe("");
    expect(formatAddress()).toBe("");
  });
  it("zaglavlje PDF-a: adresa sa ZIP-om i Tax ID", () => {
    const h = companyHeader({ name: "MS Plant Service SRO", tax_id: "SK2020123456", address: "Dvojkrížna ulica 12227/49", zip: "821 06", city: "Bratislava" });
    expect(h.lines).toEqual(["Dvojkrížna ulica 12227/49, 821 06 Bratislava", "Tax ID: SK2020123456"]);
    expect(h.footer).not.toContain("PIB");
  });
});

describe("logotip", () => {
  it("PNG i JPG prolaze, prema sadržaju", async () => {
    expect(await logoProblem(fileOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBeNull();
    expect(await logoProblem(fileOf([0xff, 0xd8, 0xff, 0xe0, 0]))).toBeNull();
  });
  it("PDF i WebP ne prolaze", async () => {
    expect(await logoProblem(fileOf([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("type");
    expect(await logoProblem(fileOf([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("type");
  });
  it("veći od 2 MB se odbija", async () => {
    expect(await logoProblem(fileOf([0xff, 0xd8, 0xff], LOGO_MAX_BYTES + 1))).toBe("tooBig");
  });
});

describe("sloj podataka", () => {
  it("company_settings se čita po ključu id (jedan red)", () => {
    expect(PRIMARY_KEY.company_settings).toBe("id");
  });
});

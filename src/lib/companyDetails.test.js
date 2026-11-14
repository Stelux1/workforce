import { describe, it, expect } from "vitest";
import {
  pibValid, registrationNumberValid, normalizeCompany, companyErrors, companyIsEmpty, logoProblem, LOGO_MAX_BYTES,
} from "@/lib/companyDetails";
import { PRIMARY_KEY } from "@/api/base44Client";

const fileOf = (bytes, size) => {
  const blob = new Blob([new Uint8Array(bytes)]);
  return size ? { size, slice: (a, b) => blob.slice(a, b) } : blob;
};

describe("PIB i matični broj", () => {
  it("prazno je dozvoljeno", () => {
    expect(pibValid("")).toBe(true);
    expect(pibValid(null)).toBe(true);
    expect(registrationNumberValid(undefined)).toBe(true);
  });
  it("PIB ima tačno 9 cifara", () => {
    expect(pibValid("123456789")).toBe(true);
    expect(pibValid("12345678")).toBe(false);
    expect(pibValid("1234567890")).toBe(false);
    expect(pibValid("12345678a")).toBe(false);
  });
  it("matični broj ima tačno 8 cifara", () => {
    expect(registrationNumberValid("12345678")).toBe(true);
    expect(registrationNumberValid("1234567")).toBe(false);
    expect(registrationNumberValid("123456789")).toBe(false);
  });
  it("companyErrors javlja samo pogrešna polja", () => {
    expect(companyErrors({ pib: "1", registration_number: "12345678" })).toEqual({ pib: "pib" });
    expect(companyErrors({})).toEqual({});
  });
});

describe("normalizeCompany / companyIsEmpty", () => {
  it("prazna i razmaci postaju null", () => {
    const n = normalizeCompany({ name: "  ", pib: "", address: " Ulica 1 " });
    expect(n.name).toBeNull();
    expect(n.pib).toBeNull();
    expect(n.address).toBe("Ulica 1");
  });
  it("prazan red je prazan; logo se računa kao popunjen", () => {
    expect(companyIsEmpty({ name: null, pib: "", logo_url: null })).toBe(true);
    expect(companyIsEmpty({ name: null, logo_url: "x" })).toBe(false);
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

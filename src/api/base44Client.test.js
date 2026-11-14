import { beforeEach, describe, expect, it, vi } from "vitest";

// Simuliran Supabase: tabela sa N redova i PostgREST ograničenjem od 1000 redova po zahtevu.
const state = { rows: [], ranges: [], uploads: [], removed: [] };
function builder() {
  const q = {
    select: () => q, order: () => q, eq: () => q, in: () => q, not: () => q, is: () => q,
    gte: () => q, lte: () => q, gt: () => q, lt: () => q, neq: () => q,
    range: (from, to) => {
      state.ranges.push([from, to]);
      const end = Math.min(to, from + 999); // max_rows = 1000
      return Promise.resolve({ data: state.rows.slice(from, end + 1), error: null });
    },
  };
  return q;
}
vi.mock("@/api/supabase", () => ({
  requireSupabase: () => ({
    from: () => builder(),
    rpc: () => Promise.resolve({ data: true, error: null }),
    auth: { onAuthStateChange: () => {} },
    storage: {
      from: () => ({
        upload: (path, file, opts) => { state.uploads.push({ path, type: opts?.contentType }); return Promise.resolve({ error: null }); },
        createSignedUrl: (path) => Promise.resolve({ data: { signedUrl: `http://x/storage/v1/object/sign/files/${path}?token=t` } }),
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
        remove: (paths) => { state.removed.push(...paths); return Promise.resolve({ error: null }); },
      }),
    },
  }),
}));

const { base44, PAGE_SIZE } = await import("./base44Client");

beforeEach(() => {
  state.rows = Array.from({ length: 2500 }, (_, i) => ({ id: `t${i}`, week_start: "2026-11-02", approval_status: "approved" }));
  state.ranges = [];
  state.uploads = [];
});

describe("čitanje u delovima (granica PostgREST-a)", () => {
  it("bez ograničenja vraća SVE redove, ne samo prvih 1000", async () => {
    const rows = await base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start");
    expect(rows).toHaveLength(2500);
    expect(state.ranges).toEqual([[0, PAGE_SIZE - 1], [PAGE_SIZE, 2 * PAGE_SIZE - 1], [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1]]);
  });

  it("poštuje zadato ograničenje", async () => {
    expect(await base44.entities.Timesheet.list("-week_start", 500)).toHaveLength(500);
    expect(await base44.entities.Timesheet.list("-week_start", 1500)).toHaveLength(1500);
  });
});

describe("otpremanje fajla", () => {
  const file = (bytes, name, type) => new File([new Uint8Array(bytes)], name, { type });

  it("pravi PDF prolazi i čuva se sa stvarnim tipom", async () => {
    const res = await base44.integrations.Core.UploadFile({ file: file([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31], "a.pdf", "application/pdf") });
    expect(res.storage_ref).toMatch(/^storage:\/\/files\//);
    expect(state.uploads[0].type).toBe("application/pdf");
  });

  it(".exe preimenovan u .pdf je odbijen", async () => {
    await expect(base44.integrations.Core.UploadFile({ file: file([0x4d, 0x5a, 0x90, 0], "x.pdf", "application/pdf") }))
      .rejects.toThrow(/Sadržaj fajla|file content/);
    expect(state.uploads).toHaveLength(0);
  });

  it("fotografija preko zadate granice je odbijena pre slanja", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await expect(base44.integrations.Core.UploadFile({ file: big, maxBytes: 5 * 1024 * 1024 })).rejects.toThrow(/5 MB/);
  });
});

describe("odbacivanje nesačuvanog fajla (Otkaži posle otpremanja)", () => {
  beforeEach(() => { state.removed = []; });

  it("briše objekat po potpisanom linku", async () => {
    await base44.integrations.Core.DiscardUpload({ file_url: "http://x/storage/v1/object/sign/files/2026-11/a-b.pdf?token=t" });
    expect(state.removed).toEqual(["2026-11/a-b.pdf"]);
  });

  it("briše objekat i po storage:// referenci", async () => {
    await base44.integrations.Core.DiscardUpload({ file_url: "storage://files/2026-11/c.pdf" });
    expect(state.removed).toEqual(["2026-11/c.pdf"]);
  });

  it("ignoriše sve što nije u našem bucketu", async () => {
    await base44.integrations.Core.DiscardUpload({ file_url: "https://example.com/a.pdf" });
    await base44.integrations.Core.DiscardUpload({ file_url: "" });
    await base44.integrations.Core.DiscardUpload({});
    expect(state.removed).toEqual([]);
  });
});

describe("potpisani linkovi se osvežavaju pre isteka", () => {
  it("osvežavanje je pre isteka linka", async () => {
    const { SIGNED_URL_REFRESH_MS, STALE_AFTER_MS } = await import("@/lib/query-client");
    const { SIGNED_URL_SECONDS } = await import("./base44Client");
    expect(SIGNED_URL_REFRESH_MS).toBeLessThan(SIGNED_URL_SECONDS * 1000);
    expect(STALE_AFTER_MS).toBeLessThan(SIGNED_URL_REFRESH_MS);
  });
});

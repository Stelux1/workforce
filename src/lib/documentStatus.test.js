import { describe, expect, it } from "vitest";
import { documentStatus } from "./documentStatus";

describe("documentStatus", () => {
  const today = new Date(2026, 10, 14, 15, 30); // 14.11.2026 15:30
  it("računa status iz roka (kalendarski dani)", () => {
    expect(documentStatus(null, today)).toBe("no_expiry");
    expect(documentStatus("2026-11-13", today)).toBe("expired");
    expect(documentStatus("2026-11-14", today)).toBe("expiring_soon");
    expect(documentStatus("2026-12-14", today)).toBe("expiring_soon");
    expect(documentStatus("2026-12-15", today)).toBe("valid");
  });
});

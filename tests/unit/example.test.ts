import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn()", () => {
  it("combina classes simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignora valores falsy", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("resolve conflitos de utilitários Tailwind mantendo o último", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

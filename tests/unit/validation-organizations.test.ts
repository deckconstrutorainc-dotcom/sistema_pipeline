import { describe, expect, it } from "vitest";

import {
  createOrganizationSchema,
  inviteMemberSchema,
  switchOrganizationSchema,
} from "@/lib/validation/organizations";

describe("createOrganizationSchema", () => {
  it("aceita nome e slug válidos", () => {
    const result = createOrganizationSchema.safeParse({
      name: "Minha Empresa",
      slug: "minha-empresa",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slug com maiúsculas/caracteres inválidos", () => {
    expect(
      createOrganizationSchema.safeParse({ name: "Empresa", slug: "Minha Empresa!" }).success,
    ).toBe(false);
  });

  it("rejeita slug com hífen duplicado no formato inválido", () => {
    expect(
      createOrganizationSchema.safeParse({ name: "Empresa", slug: "--invalido" }).success,
    ).toBe(false);
  });

  it("normaliza slug para minúsculas antes de validar", () => {
    const result = createOrganizationSchema.safeParse({ name: "Empresa", slug: "Empresa-XYZ" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("empresa-xyz");
    }
  });
});

describe("switchOrganizationSchema", () => {
  it("exige um uuid válido", () => {
    expect(switchOrganizationSchema.safeParse({ organizationId: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(
      switchOrganizationSchema.safeParse({
        organizationId: "11111111-1111-1111-1111-111111111111",
      }).success,
    ).toBe(true);
  });
});

describe("inviteMemberSchema", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";

  it("aceita papel atribuível válido", () => {
    const result = inviteMemberSchema.safeParse({
      organizationId: orgId,
      email: "novo@empresa.com",
      roleKey: "member",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita papel não atribuível manualmente (super_admin)", () => {
    const result = inviteMemberSchema.safeParse({
      organizationId: orgId,
      email: "novo@empresa.com",
      roleKey: "super_admin",
    });
    expect(result.success).toBe(false);
  });
});

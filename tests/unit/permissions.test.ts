import { describe, expect, it } from "vitest";

import { roleHasPermission } from "@/lib/permissions";

const rolePermissions = {
  super_admin: ["organization.manage", "organization.delete", "member.invite"],
  admin: ["organization.manage", "member.invite"],
  member: ["pipe.view"],
  read_only: ["pipe.view"],
} as const;

describe("roleHasPermission", () => {
  it("retorna true quando o papel possui a permissão", () => {
    expect(roleHasPermission(rolePermissions, "admin", "member.invite")).toBe(true);
  });

  it("retorna false quando o papel não possui a permissão", () => {
    expect(roleHasPermission(rolePermissions, "member", "organization.manage")).toBe(false);
  });

  it("retorna false para papel desconhecido", () => {
    expect(roleHasPermission(rolePermissions, "unknown_role", "pipe.view")).toBe(false);
  });

  it("super_admin possui permissões destrutivas que admin não possui", () => {
    expect(roleHasPermission(rolePermissions, "super_admin", "organization.delete")).toBe(true);
    expect(roleHasPermission(rolePermissions, "admin", "organization.delete")).toBe(false);
  });
});

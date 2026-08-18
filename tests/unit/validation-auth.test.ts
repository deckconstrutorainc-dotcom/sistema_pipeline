import { describe, expect, it } from "vitest";

import {
  resetPasswordRequestSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

describe("signInSchema", () => {
  it("aceita e-mail e senha válidos", () => {
    const result = signInSchema.safeParse({ email: "user@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejeita e-mail inválido", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejeita senha vazia", () => {
    const result = signInSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const base = {
    fullName: "Ana Silva",
    email: "ana@example.com",
    password: "senha1234",
    confirmPassword: "senha1234",
  };

  it("aceita dados válidos", () => {
    expect(signUpSchema.safeParse(base).success).toBe(true);
  });

  it("rejeita senha curta", () => {
    const result = signUpSchema.safeParse({ ...base, password: "123", confirmPassword: "123" });
    expect(result.success).toBe(false);
  });

  it("rejeita senhas que não coincidem", () => {
    const result = signUpSchema.safeParse({ ...base, confirmPassword: "outraSenha1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("confirmPassword");
    }
  });

  it("rejeita nome muito curto", () => {
    const result = signUpSchema.safeParse({ ...base, fullName: "A" });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordRequestSchema", () => {
  it("exige e-mail válido", () => {
    expect(resetPasswordRequestSchema.safeParse({ email: "" }).success).toBe(false);
    expect(resetPasswordRequestSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
});

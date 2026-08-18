import { describe, expect, it } from "vitest";

import {
  createPortalSchema,
  configurePortalItemsSchema,
  formatProtocol,
  isValidProtocolFormat,
  publicSubmissionSchema,
  validatePortalSubmissionValues,
  type PortalFieldSpec,
} from "@/lib/validation/portals";

const pipeId = "11111111-1111-1111-1111-111111111111";
const portalId = "22222222-2222-2222-2222-222222222222";
const fieldId = "33333333-3333-3333-3333-333333333333";

describe("createPortalSchema", () => {
  it("aceita um portal público simples", () => {
    const result = createPortalSchema.safeParse({
      pipeId,
      name: "Solicitação de contrato",
      slug: "solicitacao-contrato",
      visibility: "public",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slug com maiúsculas ou espaços", () => {
    const result = createPortalSchema.safeParse({
      pipeId,
      name: "Portal",
      slug: "Slug Inválido",
      visibility: "public",
    });
    expect(result.success).toBe(false);
  });

  it("exige código de acesso quando visibility = restricted", () => {
    const result = createPortalSchema.safeParse({
      pipeId,
      name: "Portal restrito",
      slug: "portal-restrito",
      visibility: "restricted",
    });
    expect(result.success).toBe(false);
  });

  it("aceita portal restrito com código de acesso informado", () => {
    const result = createPortalSchema.safeParse({
      pipeId,
      name: "Portal restrito",
      slug: "portal-restrito",
      visibility: "restricted",
      accessCode: "senha123",
    });
    expect(result.success).toBe(true);
  });
});

describe("configurePortalItemsSchema — is_required_override só pode endurecer", () => {
  it("aceita isRequiredOverride true ou ausente", () => {
    expect(
      configurePortalItemsSchema.safeParse({
        portalId,
        pipeId,
        items: [{ fieldId, position: 0, isRequiredOverride: true }],
      }).success,
    ).toBe(true);

    expect(
      configurePortalItemsSchema.safeParse({
        portalId,
        pipeId,
        items: [{ fieldId, position: 0 }],
      }).success,
    ).toBe(true);
  });

  it("rejeita isRequiredOverride = false (afrouxaria a regra interna)", () => {
    const result = configurePortalItemsSchema.safeParse({
      portalId,
      pipeId,
      items: [{ fieldId, position: 0, isRequiredOverride: false }],
    });
    expect(result.success).toBe(false);
  });
});

describe("publicSubmissionSchema", () => {
  it("aceita submissão mínima válida", () => {
    const result = publicSubmissionSchema.safeParse({
      fieldValues: { [fieldId]: "valor" },
      requesterEmail: "solicitante@exemplo.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita e-mail de solicitante inválido", () => {
    const result = publicSubmissionSchema.safeParse({
      fieldValues: {},
      requesterEmail: "não-é-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("formatProtocol / isValidProtocolFormat", () => {
  it("gera protocolo no formato ORG-YYYYMMDD-NNNN", () => {
    const protocol = formatProtocol("acme", new Date(Date.UTC(2026, 7, 18)), 7);
    expect(protocol).toBe("ACME-20260818-0007");
  });

  it("preenche a sequência com zeros à esquerda até 4 dígitos", () => {
    expect(formatProtocol("acme", new Date(Date.UTC(2026, 0, 1)), 1)).toBe("ACME-20260101-0001");
  });

  it("remove caracteres não alfanuméricos do slug da organização", () => {
    expect(formatProtocol("min-org", new Date(Date.UTC(2026, 7, 18)), 1)).toBe("MINORG-20260818-0001");
  });

  it("valida o formato correto e rejeita formatos inválidos", () => {
    expect(isValidProtocolFormat("ACME-20260818-0007")).toBe(true);
    expect(isValidProtocolFormat("acme-20260818-0007")).toBe(false);
    expect(isValidProtocolFormat("ACME-2026-0007")).toBe(false);
    expect(isValidProtocolFormat("ACME-20260818")).toBe(false);
  });
});

describe("validatePortalSubmissionValues — reaproveita validateFieldValue", () => {
  const items: PortalFieldSpec[] = [
    { fieldId: "f1", label: "Nome", type: "short_text", isRequired: true },
    { fieldId: "f2", label: "E-mail", type: "email", isRequired: false },
  ];

  it("bloqueia quando um campo obrigatório do portal está vazio", () => {
    const errors = validatePortalSubmissionValues(items, { f2: "a@b.com" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fieldId).toBe("f1");
  });

  it("não bloqueia quando os campos obrigatórios estão preenchidos", () => {
    const errors = validatePortalSubmissionValues(items, { f1: "Fulano", f2: "a@b.com" });
    expect(errors).toHaveLength(0);
  });

  it("valida tipo mesmo em campo opcional preenchido", () => {
    const errors = validatePortalSubmissionValues(items, { f1: "Fulano", f2: "não-é-email" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fieldId).toBe("f2");
  });
});

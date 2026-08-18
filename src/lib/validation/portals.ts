import { z } from "zod";

import { validateFieldValue, type FieldType } from "@/lib/validation/fields";

export const portalVisibilityValues = ["public", "restricted"] as const;
export type PortalVisibility = (typeof portalVisibilityValues)[number];

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o identificador do portal.")
  .max(80, "Identificador muito longo.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen.");

export const createPortalSchema = z
  .object({
    pipeId: z.string().uuid("Pipe inválido."),
    name: z.string().trim().min(1, "Informe o nome do portal.").max(120, "Nome muito longo."),
    description: z.string().trim().max(500, "Descrição muito longa.").optional(),
    slug: slugSchema,
    visibility: z.enum(portalVisibilityValues).default("public"),
    welcomeMessage: z.string().trim().max(2000, "Mensagem muito longa.").optional(),
    accessCode: z.string().trim().min(4, "Código de acesso muito curto.").max(60).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.visibility === "restricted" && !data.accessCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um código de acesso para portais restritos.",
        path: ["accessCode"],
      });
    }
  });
export type CreatePortalInput = z.infer<typeof createPortalSchema>;

export const updatePortalSchema = z.object({
  portalId: z.string().uuid("Portal inválido."),
  name: z.string().trim().min(1, "Informe o nome do portal.").max(120).optional(),
  description: z.string().trim().max(500).optional(),
  welcomeMessage: z.string().trim().max(2000).optional(),
  visibility: z.enum(portalVisibilityValues).optional(),
  accessCode: z.string().trim().min(4).max(60).optional(),
});
export type UpdatePortalInput = z.infer<typeof updatePortalSchema>;

export const togglePortalSchema = z.object({
  portalId: z.string().uuid("Portal inválido."),
  isActive: z.boolean(),
});
export type TogglePortalInput = z.infer<typeof togglePortalSchema>;

/**
 * `isRequiredOverride` só pode ENDURECER a obrigatoriedade do campo no
 * formulário externo (true) — nunca afrouxá-la em relação à regra interna
 * da fase (mesma restrição imposta no banco pelo check constraint
 * `portal_items_override_only_tightens`, migration `20260818092900_portals.sql`).
 */
const portalItemInputSchema = z
  .object({
    fieldId: z.string().uuid("Campo inválido."),
    position: z.number().int().min(0),
    isRequiredOverride: z.boolean().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isRequiredOverride === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Não é permitido afrouxar a obrigatoriedade interna do campo no portal.",
        path: ["isRequiredOverride"],
      });
    }
  });
export type PortalItemInput = z.infer<typeof portalItemInputSchema>;

export const configurePortalItemsSchema = z.object({
  portalId: z.string().uuid("Portal inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  items: z.array(portalItemInputSchema),
});
export type ConfigurePortalItemsInput = z.infer<typeof configurePortalItemsSchema>;

/** Body aceito pela rota pública de submissão (`/api/portals/[slug]/submit`). */
export const publicSubmissionSchema = z.object({
  fieldValues: z.record(z.string().uuid(), z.unknown()).default({}),
  requesterName: z.string().trim().max(200).optional(),
  requesterEmail: z.string().trim().email("E-mail inválido.").max(200).optional().or(z.literal("")),
  accessCode: z.string().trim().max(60).optional(),
});
export type PublicSubmissionInput = z.infer<typeof publicSubmissionSchema>;

export const requestStatusLookupSchema = z.object({
  protocol: z.string().trim().min(1, "Informe o protocolo."),
});
export type RequestStatusLookupInput = z.infer<typeof requestStatusLookupSchema>;

// ---------------------------------------------------------------------
// Protocolo: `<ORG_SLUG>-<YYYYMMDD>-<NNNN>`, sequencial por organização e
// por dia. A geração AUTORITATIVA acontece dentro do RPC `submit_portal_request`
// (SQL, `supabase/migrations/20260818093500_submit_portal_request_rpc.sql`)
// — as funções abaixo são um espelho PURO (sem I/O) usado por testes
// unitários e por qualquer exibição client-side do formato esperado, nunca
// para decidir o protocolo real de uma request.
// ---------------------------------------------------------------------

const PROTOCOL_FORMAT = /^[A-Z0-9]+-[0-9]{8}-[0-9]{4,}$/;

export function formatProtocol(orgSlug: string, date: Date, sequence: number): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const seq = String(Math.max(sequence, 0)).padStart(4, "0");
  const cleanSlug = orgSlug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `${cleanSlug}-${year}${month}${day}-${seq}`;
}

export function isValidProtocolFormat(protocol: string): boolean {
  return PROTOCOL_FORMAT.test(protocol);
}

// ---------------------------------------------------------------------
// Validação de campos do formulário externo — reaproveita EXATAMENTE
// `validateFieldValue` (src/lib/validation/fields.ts), a mesma função usada
// pelo formulário interno de card. Não duplica lógica de validação por
// tipo; só decide, por item de portal, se o campo é obrigatório
// (considerando o override) antes de delegar.
// ---------------------------------------------------------------------

export interface PortalFieldSpec {
  fieldId: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  selectValues?: readonly string[];
}

export interface PortalFieldValidationError {
  fieldId: string;
  label: string;
  message: string;
}

export function validatePortalSubmissionValues(
  items: readonly PortalFieldSpec[],
  values: Readonly<Record<string, unknown>>,
): PortalFieldValidationError[] {
  const errors: PortalFieldValidationError[] = [];
  for (const item of items) {
    const result = validateFieldValue(item.type, values[item.fieldId], {
      required: item.isRequired,
      selectValues: item.selectValues,
    });
    if (!result.valid) {
      errors.push({ fieldId: item.fieldId, label: item.label, message: result.error ?? "Valor inválido." });
    }
  }
  return errors;
}

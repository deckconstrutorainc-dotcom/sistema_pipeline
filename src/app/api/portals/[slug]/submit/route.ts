import { NextResponse } from "next/server";

import { createAnonClient } from "@/lib/supabase/anon";
import { type FieldType } from "@/lib/validation/fields";
import {
  publicSubmissionSchema,
  validatePortalSubmissionValues,
  type PortalFieldSpec,
} from "@/lib/validation/portals";

export const dynamic = "force-dynamic";

interface PortalConfigRow {
  portal_id: string;
  name: string;
  is_active: boolean;
  visibility: string;
  field_id: string | null;
  field_label: string | null;
  field_type: string | null;
  is_required: boolean | null;
  field_options: { value: string; label: string }[] | null;
}

/**
 * Rota pública (SEM autenticação) de submissão de formulário de portal.
 *
 * Usa `createAnonClient()` (chave `anon`, nunca a service role — CLAUDE.md
 * §10) para chamar `get_portal_public_config`/`submit_portal_request`, as
 * duas únicas funções SECURITY DEFINER do banco liberadas para o role
 * `anon` que esta rota precisa.
 *
 * Camadas de validação (defesa em profundidade, CLAUDE.md §13/§14):
 *   1. Zod (`publicSubmissionSchema`) — formato básico do payload.
 *   2. `validatePortalSubmissionValues` (reaproveita `validateFieldValue`
 *      de `src/lib/validation/fields.ts`, mesma função usada no formulário
 *      interno do card) — tipo e obrigatoriedade, camada de UX/aplicação.
 *   3. O RPC `submit_portal_request` no banco — fonte de verdade final,
 *      revalida obrigatoriedade e nunca aceita um field_id fora de
 *      portal_items, independente do que esta rota validou antes.
 *
 * PENDÊNCIA REAL: sem rate limiting nesta rota (ver comentário detalhado na
 * migration `20260818093500_submit_portal_request_rpc.sql` e no relatório
 * final) — endpoint público sujeito a abuso/spam em produção sem proteção
 * adicional na borda (WAF/edge middleware).
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = publicSubmissionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const supabase = createAnonClient();

  const { data: configRows, error: configError } = await supabase.rpc("get_portal_public_config", {
    p_slug: slug,
  });

  if (configError || !configRows || (configRows as PortalConfigRow[]).length === 0) {
    return NextResponse.json({ success: false, error: "Portal não encontrado." }, { status: 404 });
  }

  const rows = configRows as PortalConfigRow[];
  const [first] = rows;
  if (!first?.is_active) {
    return NextResponse.json(
      { success: false, error: "Este portal não está recebendo solicitações no momento." },
      { status: 403 },
    );
  }

  const items: PortalFieldSpec[] = rows
    .filter((row): row is PortalConfigRow & { field_id: string; field_label: string; field_type: string } =>
      Boolean(row.field_id && row.field_label && row.field_type),
    )
    .map((row) => ({
      fieldId: row.field_id,
      label: row.field_label,
      type: row.field_type as FieldType,
      isRequired: row.is_required ?? false,
      selectValues: (row.field_options ?? []).map((o) => o.value),
    }));

  const validationErrors = validatePortalSubmissionValues(items, parsed.data.fieldValues);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { success: false, error: validationErrors[0]?.message ?? "Dados inválidos.", fieldErrors: validationErrors },
      { status: 400 },
    );
  }

  const { data: submitResult, error: submitError } = await supabase.rpc("submit_portal_request", {
    p_portal_slug: slug,
    p_field_values: parsed.data.fieldValues,
    p_requester_name: parsed.data.requesterName || null,
    p_requester_email: parsed.data.requesterEmail || null,
    p_access_code: parsed.data.accessCode || null,
    p_ip_hash: null,
  });

  if (submitError || !submitResult || (submitResult as unknown[]).length === 0) {
    return NextResponse.json(
      { success: false, error: submitError?.message ?? "Não foi possível enviar a solicitação." },
      { status: 400 },
    );
  }

  const [result] = submitResult as { card_id: string; protocol: string }[];
  return NextResponse.json({ success: true, protocol: result?.protocol, cardId: result?.card_id });
}

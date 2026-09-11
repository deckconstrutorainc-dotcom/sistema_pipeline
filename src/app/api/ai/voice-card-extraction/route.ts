import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { extractCardDataFromAudio } from "@/server/services/voice-card-extraction";

export const dynamic = "force-dynamic";

/**
 * `POST /api/ai/voice-card-extraction` (feature "Voz -> Card", M8):
 * transcreve um áudio curto e extrai título/prazo/responsável/campos
 * customizados para PRÉ-PREENCHER o formulário de criação de card
 * (`CreateCardForm`) — nunca cria um card sozinha (CLAUDE.md §3.27-3.29,
 * ver comentário em `voice-card-extraction.ts`).
 *
 * Route Handler (não Server Action) deliberadamente: Server Actions do
 * Next.js têm um limite de payload menor por padrão, e um áudio em base64,
 * mesmo curto/comprimido, pode facilmente passar de 1MB.
 *
 * LIMITE REAL DE PAYLOAD (documentado, não contornável por código): o plano
 * Hobby da Vercel limita o corpo de um Route Handler a ~4.5MB. Uma gravação
 * de até ~90s em `audio/webm` (ver `create-card-form.tsx`) fica bem abaixo
 * disso, mas o limite é da infraestrutura de hospedagem, não desta rota —
 * uma gravação muito mais longa falharia antes mesmo de chegar aqui (erro
 * 413 do próprio Vercel).
 *
 * Autenticação: `getCurrentUser()` (nunca `requireAuth()`, que redireciona —
 * inadequado para uma API JSON). Autorização: a policy `pipes_select`
 * (`is_pipe_member`, RLS) já garante que o SELECT abaixo só retorna o pipe
 * se o usuário for membro da organização e tiver acesso ao pipe (não
 * restrito, ou admin, ou listado em pipe_memberships) — mesma fonte de
 * verdade usada por `getPipeBoardData`, não uma checagem paralela.
 */

const MAX_AUDIO_BASE64_LENGTH = 6_500_000; // ~4.9MB decodificados — folga sob o limite de payload da Vercel Hobby.

const requestSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  audioBase64: z
    .string()
    .min(1, "Áudio ausente.")
    .max(MAX_AUDIO_BASE64_LENGTH, "Áudio grande demais — grave um trecho mais curto."),
  mimeType: z
    .string()
    .min(1, "Tipo de arquivo ausente.")
    .refine((value) => value.startsWith("audio/"), "Tipo de arquivo inválido — envie um áudio."),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corpo da requisição inválido (esperado JSON)." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: pipe, error: pipeError } = await supabase
    .from("pipes")
    .select("id, organization_id")
    .eq("id", parsed.data.pipeId)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (pipeError || !pipe) {
    // Mesma postura de segurança de `getPipeBoardData`: não distinguir
    // "pipe inexistente" de "sem permissão" (RLS já decidiu).
    return NextResponse.json(
      { success: false, error: "Pipe não encontrado ou sem permissão de acesso." },
      { status: 404 },
    );
  }

  const result = await extractCardDataFromAudio({
    pipeId: pipe.id,
    organizationId: pipe.organization_id,
    audioBase64: parsed.data.audioBase64,
    mimeType: parsed.data.mimeType,
    actorUserId: user.id,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 422 });
  }

  return NextResponse.json(result);
}

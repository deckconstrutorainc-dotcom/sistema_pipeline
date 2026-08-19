"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { requireActiveOrganization, requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  archivePipeSchema,
  createPipeSchema,
  updatePipeSchema,
  type ArchivePipeInput,
  type CreatePipeInput,
  type UpdatePipeInput,
} from "@/lib/validation/pipes";

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface PipeSummary {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isArchived: boolean;
  isRestricted: boolean;
  cardCount: number;
}

/**
 * Lista os pipes da organização ativa aos quais o usuário autenticado tem
 * acesso (RLS de `pipes` já filtra por `is_pipe_member`). Retorna
 * também a contagem de cards não arquivados de cada pipe.
 */
export async function listPipes(includeArchived = false): Promise<PipeSummary[]> {
  const organization = await requireActiveOrganization();
  const supabase = await createClient();

  let query = supabase
    .from("pipes")
    .select("id, name, description, icon, color, is_archived, is_restricted, cards(count)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  interface Row {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    is_archived: boolean;
    is_restricted: boolean;
    cards: { count: number }[] | null;
  }

  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    isArchived: row.is_archived,
    isRestricted: row.is_restricted,
    cardCount: row.cards?.[0]?.count ?? 0,
  }));
}

/** Cria um pipe. Requer admin/super_admin da organização ativa. */
export async function createPipe(input: CreatePipeInput): Promise<ActionResult> {
  const parsed = createPipeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  // Gera o id no client em vez de usar `.insert().select().single()`: a
  // policy `pipes_select` (`is_pipe_member(id)`) reconsulta a própria
  // tabela `pipes`, e o RETURNING de um INSERT avalia essa policy contra o
  // snapshot do INÍCIO do comando — que ainda não enxerga a linha recém-
  // inserida. Resultado: PostgREST recusa com "new row violates row-level
  // security policy", mesmo com o INSERT (WITH CHECK) validado com sucesso.
  // Conhecendo o id de antemão, evitamos depender do RETURNING.
  const pipeId = randomUUID();

  const supabase = await createClient();
  const { error } = await supabase.from("pipes").insert({
    id: pipeId,
    organization_id: parsed.data.organizationId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    icon: parsed.data.icon ?? null,
    color: parsed.data.color ?? null,
    is_restricted: parsed.data.isRestricted,
    created_by: user.id,
  });

  if (error) {
    return { success: false, error: "Não foi possível criar o pipe." };
  }

  redirect(`/pipes/${pipeId}`);
}

export async function updatePipe(input: UpdatePipeInput): Promise<ActionResult> {
  const parsed = updatePipeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { data: pipe } = await supabase
    .from("pipes")
    .select("organization_id")
    .eq("id", parsed.data.pipeId)
    .maybeSingle<{ organization_id: string }>();
  if (!pipe) {
    return { success: false, error: "Pipe não encontrado." };
  }
  await requireOrgRole(pipe.organization_id, ["super_admin", "admin"]);

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.color !== undefined) update.color = parsed.data.color;
  if (parsed.data.isRestricted !== undefined) update.is_restricted = parsed.data.isRestricted;
  if (parsed.data.startFormPhaseId !== undefined) update.start_form_phase_id = parsed.data.startFormPhaseId;

  const { error } = await supabase.from("pipes").update(update).eq("id", parsed.data.pipeId);
  if (error) {
    return { success: false, error: "Não foi possível atualizar o pipe." };
  }

  return { success: true };
}

/** Arquiva/desarquiva um pipe (soft delete — CLAUDE.md §22). */
export async function archivePipe(input: ArchivePipeInput): Promise<ActionResult> {
  const parsed = archivePipeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { data: pipe } = await supabase
    .from("pipes")
    .select("organization_id")
    .eq("id", parsed.data.pipeId)
    .maybeSingle<{ organization_id: string }>();
  if (!pipe) {
    return { success: false, error: "Pipe não encontrado." };
  }
  await requireOrgRole(pipe.organization_id, ["super_admin", "admin"]);

  const { error } = await supabase
    .from("pipes")
    .update({ is_archived: parsed.data.isArchived })
    .eq("id", parsed.data.pipeId);

  if (error) {
    return { success: false, error: "Não foi possível arquivar o pipe." };
  }

  return { success: true };
}

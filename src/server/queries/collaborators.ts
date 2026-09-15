import { createClient } from "@/lib/supabase/server";

export interface CardCollaborator {
  id: string;
  userId: string;
  fullName: string | null;
  request: string | null;
  invitedBy: string;
  createdAt: string;
}

interface Row {
  id: string;
  user_id: string;
  request: string | null;
  invited_by: string;
  created_at: string;
}

/** Quem foi convidado a colaborar neste card. */
export async function listCardCollaborators(cardId: string): Promise<CardCollaborator[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("card_collaborators")
    .select("id, user_id, request, invited_by, created_at")
    .eq("card_id", cardId)
    .order("created_at");

  if (error) throw new Error(`Falha ao carregar colaboradores: ${error.message}`);

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // Nomes em consulta separada: `profiles` não tem relação declarada com
  // `card_collaborators`, então o join embutido do PostgREST não resolve.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set(rows.map((r) => r.user_id))]);

  const nameById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullName: nameById.get(row.user_id) ?? null,
    request: row.request,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  }));
}

import { createClient } from "@/lib/supabase/server";

export interface PortalSummary {
  id: string;
  organizationId: string;
  pipeId: string;
  name: string;
  description: string | null;
  slug: string;
  visibility: "public" | "restricted";
  isActive: boolean;
  welcomeMessage: string | null;
  itemCount: number;
  requestCount: number;
}

export interface PortalItemSummary {
  fieldId: string;
  position: number;
  isRequiredOverride: boolean | null;
}

/** Lista os portais de um pipe (RLS decide visibilidade: membros da
 * organização dona do pipe). */
export async function listPortalsForPipe(pipeId: string): Promise<PortalSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("portals")
    .select(
      "id, organization_id, pipe_id, name, description, slug, visibility, is_active, welcome_message, portal_items(count), requests(count)",
    )
    .eq("pipe_id", pipeId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      organization_id: string;
      pipe_id: string;
      name: string;
      description: string | null;
      slug: string;
      visibility: "public" | "restricted";
      is_active: boolean;
      welcome_message: string | null;
      portal_items: { count: number }[];
      requests: { count: number }[];
    }[]
  ).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    pipeId: row.pipe_id,
    name: row.name,
    description: row.description,
    slug: row.slug,
    visibility: row.visibility,
    isActive: row.is_active,
    welcomeMessage: row.welcome_message,
    itemCount: row.portal_items?.[0]?.count ?? 0,
    requestCount: row.requests?.[0]?.count ?? 0,
  }));
}

export async function getPortalItems(portalId: string): Promise<PortalItemSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("portal_items")
    .select("field_id, position, is_required_override")
    .eq("portal_id", portalId)
    .order("position", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as { field_id: string; position: number; is_required_override: boolean | null }[]
  ).map((row) => ({
    fieldId: row.field_id,
    position: row.position,
    isRequiredOverride: row.is_required_override,
  }));
}

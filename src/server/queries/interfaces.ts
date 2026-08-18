import { createClient } from "@/lib/supabase/server";
import type { InterfaceComponentType } from "@/lib/validation/interfaces";

export interface InterfaceSummary {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  slug: string;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterfaceComponentSummary {
  id: string;
  interfaceId: string;
  componentType: InterfaceComponentType;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export interface InterfaceDetail {
  interface: InterfaceSummary;
  components: InterfaceComponentSummary[];
}

function mapInterfaceRow(row: {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  slug: string;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}): InterfaceSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    slug: row.slug,
    isPublished: row.is_published,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listInterfaces(organizationId: string): Promise<InterfaceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interfaces")
    .select("id, organization_id, name, description, slug, is_published, created_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as Parameters<typeof mapInterfaceRow>[0][]).map(mapInterfaceRow);
}

export async function getInterfaceDetail(interfaceId: string): Promise<InterfaceDetail | null> {
  const supabase = await createClient();

  const { data: interfaceRow, error } = await supabase
    .from("interfaces")
    .select("id, organization_id, name, description, slug, is_published, created_by, created_at, updated_at")
    .eq("id", interfaceId)
    .maybeSingle<Parameters<typeof mapInterfaceRow>[0]>();

  if (error || !interfaceRow) return null;

  const { data: componentRows } = await supabase
    .from("interface_components")
    .select("id, interface_id, component_type, config, position_x, position_y, width, height")
    .eq("interface_id", interfaceId)
    .order("position_y", { ascending: true })
    .order("position_x", { ascending: true });

  const components: InterfaceComponentSummary[] = (
    (componentRows ?? []) as {
      id: string;
      interface_id: string;
      component_type: InterfaceComponentType;
      config: Record<string, unknown>;
      position_x: number;
      position_y: number;
      width: number;
      height: number;
    }[]
  ).map((row) => ({
    id: row.id,
    interfaceId: row.interface_id,
    componentType: row.component_type,
    config: row.config,
    positionX: row.position_x,
    positionY: row.position_y,
    width: row.width,
    height: row.height,
  }));

  return { interface: mapInterfaceRow(interfaceRow), components };
}

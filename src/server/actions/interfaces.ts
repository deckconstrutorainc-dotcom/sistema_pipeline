"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  addComponentSchema,
  createInterfaceSchema,
  publishInterfaceSchema,
  updateComponentSchema,
  type AddComponentInput,
  type CreateInterfaceInput,
  type PublishInterfaceInput,
  type UpdateComponentInput,
} from "@/lib/validation/interfaces";

export interface ActionResult {
  success: boolean;
  error?: string;
  interfaceId?: string;
  componentId?: string;
}

async function requireInterfaceManager(interfaceId: string): Promise<void> {
  const supabase = await createClient();
  const { data: iface } = await supabase
    .from("interfaces")
    .select("organization_id")
    .eq("id", interfaceId)
    .maybeSingle<{ organization_id: string }>();

  if (!iface) {
    throw new Error("Interface não encontrada.");
  }
  await requireOrgRole(iface.organization_id, ["super_admin", "admin"]);
}

export async function createInterface(input: CreateInterfaceInput): Promise<ActionResult> {
  const parsed = createInterfaceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interfaces")
    .insert({
      organization_id: parsed.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      slug: parsed.data.slug,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "Já existe uma interface com esse identificador nesta organização." };
    }
    return { success: false, error: "Não foi possível criar a interface." };
  }

  revalidatePath("/interfaces");
  return { success: true, interfaceId: (data as { id: string }).id };
}

export async function publishInterface(input: PublishInterfaceInput): Promise<ActionResult> {
  const parsed = publishInterfaceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireInterfaceManager(parsed.data.interfaceId);
  } catch {
    return { success: false, error: "Interface não encontrada ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("interfaces")
    .update({ is_published: parsed.data.isPublished })
    .eq("id", parsed.data.interfaceId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar a publicação da interface." };
  }

  revalidatePath("/interfaces");
  revalidatePath(`/interfaces/${parsed.data.interfaceId}`);
  return { success: true, interfaceId: parsed.data.interfaceId };
}

export async function addComponent(input: AddComponentInput): Promise<ActionResult> {
  const parsed = addComponentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireInterfaceManager(parsed.data.interfaceId);
  } catch {
    return { success: false, error: "Interface não encontrada ou sem permissão." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interface_components")
    .insert({
      interface_id: parsed.data.interfaceId,
      component_type: parsed.data.componentType,
      config: parsed.data.config,
      position_x: parsed.data.positionX,
      position_y: parsed.data.positionY,
      width: parsed.data.width,
      height: parsed.data.height,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível adicionar o componente." };
  }

  revalidatePath(`/interfaces/${parsed.data.interfaceId}`);
  return { success: true, componentId: (data as { id: string }).id };
}

export async function updateComponent(input: UpdateComponentInput): Promise<ActionResult> {
  const parsed = updateComponentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireInterfaceManager(parsed.data.interfaceId);
  } catch {
    return { success: false, error: "Interface não encontrada ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.config !== undefined) update.config = parsed.data.config;
  if (parsed.data.positionX !== undefined) update.position_x = parsed.data.positionX;
  if (parsed.data.positionY !== undefined) update.position_y = parsed.data.positionY;
  if (parsed.data.width !== undefined) update.width = parsed.data.width;
  if (parsed.data.height !== undefined) update.height = parsed.data.height;

  const supabase = await createClient();
  const { error } = await supabase
    .from("interface_components")
    .update(update)
    .eq("id", parsed.data.componentId)
    .eq("interface_id", parsed.data.interfaceId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o componente." };
  }

  revalidatePath(`/interfaces/${parsed.data.interfaceId}`);
  return { success: true, componentId: parsed.data.componentId };
}

import { PortalSubmissionForm, type PortalFormField } from "@/components/forms/portal-submission-form";
import { createAnonClient } from "@/lib/supabase/anon";
import type { FieldType } from "@/lib/validation/fields";

interface PortalPageProps {
  params: Promise<{ slug: string }>;
}

interface PortalConfigRow {
  portal_id: string;
  name: string;
  description: string | null;
  welcome_message: string | null;
  visibility: "public" | "restricted";
  is_active: boolean;
  field_id: string | null;
  field_label: string | null;
  field_type: string | null;
  field_help_text: string | null;
  field_placeholder: string | null;
  is_required: boolean | null;
  field_options: { value: string; label: string }[] | null;
}

/**
 * Página pública do portal (`/portal/[slug]`) — FORA do route group
 * `(app)` autenticado, Server Component. Lê a config exclusivamente via
 * `get_portal_public_config` (RPC SECURITY DEFINER liberada `to anon`) num
 * client verdadeiramente anônimo (`createAnonClient`, chave `anon` — nunca
 * service role no browser/servidor aqui, CLAUDE.md §10). O envio do
 * formulário acontece client-side contra `/api/portals/[slug]/submit`.
 */
export default async function PublicPortalPage({ params }: PortalPageProps) {
  const { slug } = await params;
  const supabase = createAnonClient();

  const { data, error } = await supabase.rpc("get_portal_public_config", { p_slug: slug });
  const rows = (data as PortalConfigRow[] | null) ?? [];

  if (error || rows.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Portal não encontrado</h1>
        <p className="text-muted-foreground">Verifique se o link está correto.</p>
      </main>
    );
  }

  const [first] = rows;
  const fields: PortalFormField[] = rows
    .filter((row): row is PortalConfigRow & { field_id: string; field_label: string; field_type: string } =>
      Boolean(row.field_id && row.field_label && row.field_type),
    )
    .map((row) => ({
      fieldId: row.field_id,
      label: row.field_label,
      type: row.field_type as FieldType,
      helpText: row.field_help_text,
      placeholder: row.field_placeholder,
      isRequired: row.is_required ?? false,
      options: row.field_options ?? [],
    }));

  if (!first?.is_active) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{first?.name ?? "Portal"}</h1>
        <p className="text-muted-foreground">
          Este portal não está recebendo solicitações no momento. Tente novamente mais tarde.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-6 px-4 py-12">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{first.name}</h1>
        {first.description ? <p className="text-muted-foreground">{first.description}</p> : null}
      </div>
      {first.welcome_message ? (
        <div className="rounded-lg border bg-muted/50 p-4 text-sm">{first.welcome_message}</div>
      ) : null}
      <PortalSubmissionForm slug={slug} fields={fields} visibility={first.visibility} />
    </main>
  );
}

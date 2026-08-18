"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPortalSchema, type CreatePortalInput } from "@/lib/validation/portals";
import { createPortal } from "@/server/actions/portals";

interface CreatePortalFormProps {
  pipeId: string;
}

export function CreatePortalForm({ pipeId }: CreatePortalFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePortalInput>({
    resolver: zodResolver(createPortalSchema),
    defaultValues: { pipeId, name: "", slug: "", visibility: "public" },
  });

  const visibility = watch("visibility");

  const onSubmit = async (values: CreatePortalInput) => {
    setFormError(null);
    const result = await createPortal(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o portal.");
      return;
    }
    reset({ pipeId, name: "", slug: "", visibility: "public" });
    router.refresh();
  };

  return (
    <form className="space-y-3 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("pipeId")} />
      <h3 className="text-sm font-semibold">Novo portal</h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="portal-name">Nome</Label>
          <Input id="portal-name" placeholder="Ex.: Solicitação de contrato" {...register("name")} />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="portal-slug">Identificador (slug)</Label>
          <Input id="portal-slug" placeholder="ex-solicitacao-contrato" {...register("slug")} />
          {errors.slug ? <p className="text-sm text-destructive">{errors.slug.message}</p> : null}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="portal-description">Descrição</Label>
        <Input id="portal-description" {...register("description")} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="portal-welcome">Mensagem de boas-vindas</Label>
        <Input id="portal-welcome" {...register("welcomeMessage")} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="portal-visibility">Visibilidade</Label>
        <select
          id="portal-visibility"
          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
          {...register("visibility")}
        >
          <option value="public">Público (link aberto)</option>
          <option value="restricted">Restrito (exige código de acesso)</option>
        </select>
      </div>

      {visibility === "restricted" ? (
        <div className="space-y-1">
          <Label htmlFor="portal-access-code">Código de acesso</Label>
          <Input id="portal-access-code" {...register("accessCode")} />
          {errors.accessCode ? <p className="text-sm text-destructive">{errors.accessCode.message}</p> : null}
        </div>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar portal"}
      </Button>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

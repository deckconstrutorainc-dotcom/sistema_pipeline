"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteMember } from "@/server/actions/organizations";
import {
  assignableRoleKeys,
  inviteMemberSchema,
  type InviteMemberInput,
} from "@/lib/validation/organizations";

interface InviteMemberFormProps {
  organizationId: string;
}

export function InviteMemberForm({ organizationId }: InviteMemberFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { organizationId, email: "", roleKey: "member" },
  });

  const onSubmit = async (values: InviteMemberInput) => {
    setFormError(null);
    setSuccess(false);
    const result = await inviteMember(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível convidar o membro.");
      return;
    }
    setSuccess(true);
    reset({ organizationId, email: "", roleKey: "member" });
    router.refresh();
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="space-y-1">
        <Label htmlFor="invite-email">E-mail do convidado</Label>
        <Input id="invite-email" type="email" placeholder="pessoa@empresa.com" {...register("email")} />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="invite-role">Papel</Label>
        <select
          id="invite-role"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          {...register("roleKey")}
        >
          {assignableRoleKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Convidando..." : "Convidar"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
      {success ? (
        <p className="w-full text-sm text-muted-foreground">Convite registrado.</p>
      ) : null}
    </form>
  );
}

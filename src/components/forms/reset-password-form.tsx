"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/server/actions/auth";
import {
  resetPasswordRequestSchema,
  type ResetPasswordRequestInput,
} from "@/lib/validation/auth";

export function ResetPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordRequestInput>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ResetPasswordRequestInput) => {
    await resetPassword(values);
    setSent(true);
  };

  if (sent) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Se houver uma conta com esse e-mail, enviamos um link de recuperação de senha.
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com"
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Enviando..." : "Enviar link de recuperação"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}

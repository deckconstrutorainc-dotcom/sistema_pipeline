"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  resetPasswordRequestSchema,
  signInSchema,
  signUpSchema,
  type ResetPasswordRequestInput,
  type SignInInput,
  type SignUpInput,
} from "@/lib/validation/auth";

export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Cria a conta no Supabase Auth. A criação de `public.profiles` é feita
 * automaticamente pelo trigger `on_auth_user_created` (M1, migration
 * 20260817090200_profiles.sql) — nenhuma escrita manual na tabela é
 * necessária aqui.
 */
export async function signUp(input: SignUpInput): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function signIn(input: SignInInput): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { success: false, error: "E-mail ou senha inválidos." };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Envia e-mail de recuperação de senha (fluxo básico). */
export async function resetPassword(input: ResetPasswordRequestInput): Promise<ActionResult> {
  const parsed = resetPasswordRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/login`,
  });

  if (error) {
    // Não vazamos se o e-mail existe ou não (evita enumeração de contas).
    return { success: true };
  }

  return { success: true };
}

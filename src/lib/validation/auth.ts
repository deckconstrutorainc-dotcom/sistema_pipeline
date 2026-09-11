import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .email("E-mail inválido.");

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha."),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Informe seu nome completo.")
      .max(120, "Nome muito longo."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});
export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;

export const resetPasswordConfirmSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;

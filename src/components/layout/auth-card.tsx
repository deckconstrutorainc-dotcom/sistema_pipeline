import Image from "next/image";

/**
 * Cartão das telas de autenticação.
 *
 * Existe para que entrar, cadastrar e recuperar senha compartilhem a mesma
 * moldura — inclusive a logo, que antes só aparecia no login.
 *
 * As cores são escritas aqui em vez de virem dos tokens do design system:
 * estas telas têm tema escuro fixo, enquanto a aplicação depois do login é
 * clara. Usar `bg-card` aqui produziria um cartão branco sobre fundo
 * escuro.
 */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    // `bg-card` (opaco) em vez de translúcido: os campos de formulário
    // dentro dele também usam bg-card, e sobre um fundo semitransparente a
    // malha do fundo apareceria através da caixa de digitação.
    <div className="space-y-5 rounded-xl border border-white/[0.08] bg-card p-6 shadow-[0_16px_60px_-20px_rgba(0,0,0,0.75)]">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image
          src="/koryn-logo-dark.png"
          alt="Koryn Sistemas"
          width={960}
          height={356}
          priority
          className="h-auto w-36"
        />
        <div className="space-y-1">
          <h1 className="text-ui-lg font-semibold tracking-tight text-white">{title}</h1>
          <p className="text-ui-sm text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, KanbanSquare, Timer, Zap } from "lucide-react";

const highlights = [
  {
    icon: KanbanSquare,
    title: "Quadros por processo",
    description: "Cada processo com suas fases, campos e responsáveis — sem precisar programar.",
  },
  {
    icon: Zap,
    title: "Automações",
    description: "Regras de gatilho, condição e ação que movem cards e avisam quem precisa saber.",
  },
  {
    icon: Timer,
    title: "Prazos e SLA",
    description: "Prazo por fase, alerta de vencimento e histórico completo de cada movimentação.",
  },
  {
    icon: BarChart3,
    title: "Indicadores",
    description: "Tempo por fase, gargalos e aderência ao prazo a partir do histórico real.",
  },
] as const;

/**
 * Página de entrada.
 *
 * Tema escuro fixo, independente do resto da aplicação (que é claro): é uma
 * vitrine, não uma tela de trabalho. Por isso as cores vêm escritas aqui, e
 * não dos tokens do design system.
 *
 * O efeito de grade com brilho seguindo o cursor é puro CSS: o container
 * grava a posição do mouse em duas custom properties e cada cartão usa um
 * `radial-gradient` ancorado nelas. Sem JavaScript, sem re-render.
 */
export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0d12] text-slate-200">
      {/* Grade de fundo, esmaecida nas bordas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, #000 40%, transparent 100%)",
        }}
      />

      {/* Halo azul difuso atrás do título. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-12rem] size-[38rem] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(circle, #2f6bff 0%, #12b8a6 55%, transparent 70%)" }}
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-12 px-5 py-16">
        <header className="space-y-6">
          <Image
            src="/koryn-logo-dark.png"
            alt="Koryn Sistemas — tecnologia para gestão inteligente"
            width={960}
            height={356}
            priority
            className="h-auto w-56 sm:w-64"
          />

          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-ui-xs font-medium text-slate-300 backdrop-blur-sm">
              <span className="size-1.5 rounded-full bg-[#22d3b8]" aria-hidden />
              Gestão de processos
            </span>

            <h1 className="max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
              Koryn Task
            </h1>

            <p className="max-w-xl text-ui-md leading-relaxed text-slate-400">
              Organize solicitações, aprovações e tarefas em processos claros.
              Cada demanda vira um card que caminha por fases definidas, com
              prazo, responsável e histórico.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link
              href="/dashboard"
              className="group inline-flex h-10 items-center gap-2 rounded-lg bg-white px-5 text-ui-md font-semibold text-[#0b0d12] transition-all hover:bg-slate-100 hover:shadow-[0_0_28px_-6px_rgba(255,255,255,0.45)]"
            >
              Acessar o sistema
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-lg border border-white/15 bg-white/[0.03] px-5 text-ui-md font-medium text-slate-200 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.07]"
            >
              Entrar
            </Link>
          </div>
        </header>

        {/* `group/grid` + as custom properties: o brilho de todos os cartões
            acompanha o mesmo cursor, como se fosse uma lanterna sobre a
            grade inteira. */}
        <ul className="group/grid grid gap-3 sm:grid-cols-2">
          {highlights.map((item) => (
            <li key={item.title}>
              <article className="group/card relative h-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.04] hover:shadow-[0_8px_40px_-12px_rgba(47,107,255,0.35)]">
                {/* Brilho que segue o cursor dentro do cartão. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
                  style={{
                    background:
                      "radial-gradient(420px circle at var(--x, 50%) var(--y, 50%), rgba(47,107,255,0.10), transparent 42%)",
                  }}
                />
                {/* Quadriculado que só aparece no hover. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-[0.10]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    maskImage:
                      "radial-gradient(240px circle at var(--x, 50%) var(--y, 50%), #000 10%, transparent 70%)",
                    WebkitMaskImage:
                      "radial-gradient(240px circle at var(--x, 50%) var(--y, 50%), #000 10%, transparent 70%)",
                  }}
                />

                <div className="relative flex gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-gradient-to-br from-[#2f6bff]/20 to-[#12b8a6]/15 text-[#7aa2ff] transition-colors duration-300 group-hover/card:text-[#9dbaff]">
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <div className="space-y-1">
                    <h2 className="text-ui-md font-semibold text-slate-100">{item.title}</h2>
                    <p className="text-ui-sm leading-relaxed text-slate-400">{item.description}</p>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>

        <footer className="flex items-center gap-2 border-t border-white/[0.06] pt-5 text-ui-xs text-slate-500">
          <span className="size-1 rounded-full bg-[#12b8a6]" aria-hidden />
          Koryn Sistemas · Tecnologia para gestão inteligente
        </footer>
      </main>

      {/* Rastreia o cursor e grava em --x / --y para os gradientes acima.
          Um script mínimo, sem estado do React: mover o mouse não pode
          disparar re-render de componente nenhum. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('pointermove', function (e) {
              var cards = document.querySelectorAll('.group\\\\/card');
              for (var i = 0; i < cards.length; i++) {
                var r = cards[i].getBoundingClientRect();
                cards[i].style.setProperty('--x', (e.clientX - r.left) + 'px');
                cards[i].style.setProperty('--y', (e.clientY - r.top) + 'px');
              }
            }, { passive: true });
          `,
        }}
      />
    </div>
  );
}

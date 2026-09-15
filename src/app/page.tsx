import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, KanbanSquare, Timer, Zap } from "lucide-react";

import { CursorSmoke } from "@/components/landing/cursor-smoke";

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
 * O fundo reage ao cursor em duas frentes, ambas cobrindo a página inteira:
 *
 * 1. Lanterna sobre a malha — a posição do mouse é gravada em duas custom
 *    properties no elemento raiz, e as camadas usam essas variáveis como
 *    centro de um `radial-gradient`. Só as variáveis mudam, então o
 *    navegador repinta sem recalcular layout e sem re-render do React.
 * 2. Rastro de fumaça — `CursorSmoke`, em canvas.
 */
export default function HomePage() {
  return (
    <div
      id="landing"
      className="relative min-h-screen overflow-hidden bg-[#0b0d12] text-slate-200"
    >
      {/* Camada 1 — malha base, sempre visível, bem fraca. Quadrados de
          26px: densos o bastante para ler como textura técnica, sem virar
          ruído. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />

      {/* Camada 2 — a mesma malha em azul, revelada só ao redor do cursor.
          Sem controle de opacidade: a própria máscara deixa tudo invisível
          enquanto --mx/--my estão fora da tela (-999px). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, #7aa2ff 1px, transparent 1px), linear-gradient(to bottom, #7aa2ff 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage:
            "radial-gradient(260px circle at var(--mx, -999px) var(--my, -999px), #000 0%, rgba(0,0,0,0.3) 45%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(260px circle at var(--mx, -999px) var(--my, -999px), #000 0%, rgba(0,0,0,0.3) 45%, transparent 75%)",
        }}
      />

      {/* Camada 3 — rastro de fumaça em canvas, acompanhando o cursor. */}
      <CursorSmoke />

      {/* Halo fixo atrás do título, independente do cursor. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-14rem] size-[40rem] -translate-x-1/2 rounded-full opacity-20 blur-[130px]"
        style={{ background: "radial-gradient(circle, #2f6bff 0%, #12b8a6 55%, transparent 70%)" }}
      />

      {/* z-10 explícito: o canvas da fumaça é z-0, e o conteúdo precisa
          ficar por cima dele em qualquer ordem de empilhamento. */}
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-12 px-5 py-16">
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

        <ul className="grid gap-3 sm:grid-cols-2">
          {highlights.map((item) => (
            <li key={item.title}>
              <article className="group/card relative h-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 backdrop-blur-[2px] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.045] hover:shadow-[0_10px_44px_-14px_rgba(47,107,255,0.45)]">
                {/* Brilho interno no hover. Fica centralizado no cartão, e
                    não no cursor: --mx/--my estão em coordenadas de tela,
                    que dentro de um elemento posicionado apontariam para o
                    lugar errado. A lanterna global, essa sim, segue o mouse
                    e passa por cima. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
                  style={{
                    background:
                      "radial-gradient(300px circle at 50% 0%, rgba(122,162,255,0.14), transparent 65%)",
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

      {/* Grava a posição do cursor em --mx / --my no elemento raiz, em
          coordenadas de viewport — que é o sistema das camadas `fixed`.
          `requestAnimationFrame` limita a escrita a uma por quadro, então
          mover o mouse rápido não enfileira trabalho. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var root = document.getElementById('landing');
              if (!root) return;
              var x = 0, y = 0, queued = false;
              function paint() {
                queued = false;
                root.style.setProperty('--mx', x + 'px');
                root.style.setProperty('--my', y + 'px');
              }
              window.addEventListener('pointermove', function (e) {
                x = e.clientX; y = e.clientY;
                if (!queued) { queued = true; requestAnimationFrame(paint); }
              }, { passive: true });
              window.addEventListener('pointerleave', function () {
                root.style.setProperty('--mx', '-999px');
                root.style.setProperty('--my', '-999px');
              });
            })();
          `,
        }}
      />
    </div>
  );
}

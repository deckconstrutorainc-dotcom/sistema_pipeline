import { redirect } from "next/navigation";

import { CursorSmoke } from "@/components/landing/cursor-smoke";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Moldura das telas de autenticação (entrar, cadastrar, recuperar senha).
 *
 * Mesmo tratamento visual da página de entrada: tema escuro fixo, malha
 * reagindo ao cursor e rastro de fumaça. São telas de vitrine — a aplicação
 * em si, depois do login, é clara.
 *
 * O efeito vive aqui, e não em cada página, para que as três compartilhem o
 * fundo sem repetição.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div
      id="landing"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0d12] p-6 text-slate-200"
    >
      {/* Malha base, sempre visível e bem fraca. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />

      {/* A mesma malha em azul, revelada só ao redor do cursor. A máscara
          já a mantém invisível enquanto --mx/--my estão fora da tela. */}
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

      <CursorSmoke />

      {/* Halo difuso atrás do cartão, para descolá-lo do fundo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.18] blur-[120px]"
        style={{ background: "radial-gradient(circle, #2f6bff 0%, #12b8a6 55%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-sm">{children}</div>

      {/* Grava a posição do cursor em --mx / --my, em coordenadas de
          viewport — o sistema das camadas `fixed` acima. Uma escrita por
          quadro via requestAnimationFrame. */}
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

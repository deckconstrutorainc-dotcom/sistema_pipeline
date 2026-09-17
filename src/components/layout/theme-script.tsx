/**
 * Aplica o tema salvo antes da primeira pintura.
 *
 * Sem isto, quem escolheu o tema escuro vê um lampejo branco a cada
 * carregamento: o HTML chega sem a classe `dark` e só o React a adiciona,
 * depois de hidratar.
 *
 * Roda como script bloqueante no `<head>`, de propósito. É a única coisa
 * que precisa acontecer antes do primeiro quadro, e são poucas linhas.
 * Mantenha a regra idêntica à de `applyTheme` em `theme-toggle.tsx` — se
 * divergirem, a página pisca na cor errada.
 */
export function ThemeScript() {
  const script = `
    (function () {
      try {
        var stored = localStorage.getItem('koryn:theme');
        var isDark =
          stored === 'dark' ||
          ((stored === 'system' || !stored) &&
            window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (isDark) document.documentElement.classList.add('dark');
      } catch (e) {
        // Armazenamento bloqueado (janela anônima): segue no tema claro.
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

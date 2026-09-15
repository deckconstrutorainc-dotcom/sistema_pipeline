import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Sidebar } from "@/components/layout/sidebar";
import {
  flatNavigation,
  getNavIcon,
  isNavItemActive,
  navigationGroups,
  settingsNavItem,
} from "@/lib/navigation";

/**
 * Regressão: os itens de navegação já guardaram o COMPONENTE do ícone. Isso
 * compila e passa no build, mas quebra em execução — o layout é Server
 * Component e a sidebar é Client Component, e funções não atravessam essa
 * fronteira ("Functions cannot be passed directly to Client Components").
 *
 * Hoje o item guarda a chave (string) e `getNavIcon` resolve no cliente.
 * Estes testes prendem esse contrato.
 */
describe("navegação", () => {
  it("guarda o ícone como string serializável, nunca como componente", () => {
    for (const item of flatNavigation) {
      expect(typeof item.icon).toBe("string");
    }
  });

  it("resolve um componente para cada ícone declarado", () => {
    for (const item of flatNavigation) {
      expect(getNavIcon(item.icon)).toBeTypeOf("object");
    }
  });

  it("inclui configurações na lista achatada usada pelo menu do celular", () => {
    const hrefs = flatNavigation.map((item) => item.href);
    expect(hrefs).toContain(settingsNavItem.href);
    for (const group of navigationGroups) {
      for (const item of group.items) {
        expect(hrefs).toContain(item.href);
      }
    }
  });

  it("renderiza a sidebar com os rótulos em pt-BR", () => {
    render(<Sidebar />);
    expect(screen.getByText("Início")).toBeDefined();
    expect(screen.getByText("Minhas tarefas")).toBeDefined();
    expect(screen.getByText("Bases de dados")).toBeDefined();
    expect(screen.getByText("Configurações")).toBeDefined();
  });

  describe("isNavItemActive", () => {
    const inicio = { label: "Início", href: "/dashboard", icon: "inicio", exact: true } as const;
    const pipes = { label: "Pipes", href: "/pipes", icon: "pipes" } as const;

    it("casa a rota exata quando `exact`", () => {
      expect(isNavItemActive(inicio, "/dashboard")).toBe(true);
    });

    it("não confunde /dashboard com /dashboards", () => {
      // Sem `exact`, "Início" acenderia junto com "Indicadores".
      expect(isNavItemActive(inicio, "/dashboards")).toBe(false);
    });

    it("casa rotas filhas quando não é `exact`", () => {
      expect(isNavItemActive(pipes, "/pipes/abc/cards/1")).toBe(true);
    });

    it("tolera pathname nulo", () => {
      // `usePathname()` devolve null antes da hidratação.
      expect(isNavItemActive(pipes, null)).toBe(false);
    });
  });
});

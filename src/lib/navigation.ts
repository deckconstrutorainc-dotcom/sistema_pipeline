import {
  BarChart3,
  Bot,
  Columns3,
  Database,
  LayoutGrid,
  ListChecks,
  Settings,
  Sparkles,
  Webhook,
  type LucideIcon,
} from "lucide-react";

/**
 * Navegação principal do Koryn Task.
 *
 * A barra anterior tinha nove itens soltos, sem ícones, misturando português
 * e inglês, com "Dashboard" e "Dashboards" lado a lado — dois nomes quase
 * iguais para coisas diferentes. Aqui os itens são agrupados por frequência
 * de uso e nomeados em pt-BR.
 *
 * CONVENÇÃO (decidida em 14/09/2026): rótulos em pt-BR, **URLs em inglês**.
 * `/dashboard`, `/pipes`, `/tasks` etc. permanecem como estão — não as
 * traduza. Rotas em inglês são estáveis, combinam com os nomes de tabela e
 * de rota do resto do código, e traduzi-las exigiria redirecionamentos
 * permanentes sem nenhum ganho para o usuário, que navega pelo menu.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Casa apenas a rota exata; por padrão casa também as filhas. */
  exact?: boolean;
  description?: string;
}

export interface NavGroup {
  /** Sem título, o grupo aparece sem cabeçalho (caso do primeiro). */
  title?: string;
  items: NavItem[];
}

export const navigationGroups: NavGroup[] = [
  {
    items: [
      {
        label: "Início",
        href: "/dashboard",
        icon: LayoutGrid,
        exact: true,
        description: "Seu resumo do dia",
      },
      {
        label: "Minhas tarefas",
        href: "/tasks",
        icon: ListChecks,
        description: "Tarefas atribuídas a você",
      },
    ],
  },
  {
    title: "Processos",
    items: [
      {
        label: "Pipes",
        href: "/pipes",
        icon: Columns3,
        description: "Seus processos e quadros",
      },
      {
        label: "Bases de dados",
        href: "/databases",
        icon: Database,
        description: "Cadastros de apoio",
      },
    ],
  },
  {
    title: "Análise",
    items: [
      {
        label: "Indicadores",
        href: "/dashboards",
        icon: BarChart3,
        description: "Painéis e relatórios",
      },
      {
        label: "Telas",
        href: "/interfaces",
        icon: Webhook,
        description: "Visões personalizadas",
      },
    ],
  },
  {
    title: "Inteligência",
    items: [
      {
        label: "Execuções de IA",
        href: "/ai-runs",
        icon: Sparkles,
        description: "Histórico e aprovações",
      },
      {
        label: "Agentes",
        href: "/settings/ai-agents",
        icon: Bot,
        description: "Configuração dos agentes",
      },
    ],
  },
];

/** Fica separado, ancorado no rodapé da sidebar. */
export const settingsNavItem: NavItem = {
  label: "Configurações",
  href: "/settings/members",
  icon: Settings,
  description: "Membros, integrações e webhooks",
};

/** Lista achatada, para o menu compacto do celular. */
export const flatNavigation: NavItem[] = [
  ...navigationGroups.flatMap((group) => group.items),
  settingsNavItem,
];

/**
 * Decide se o item está ativo para o caminho atual.
 *
 * Itens `exact` casam só a própria rota — `/dashboard` não deve acender
 * quando o usuário está em `/dashboards`, que é outra seção.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href) return true;
  return pathname.startsWith(`${item.href}/`);
}

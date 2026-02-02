# Diagnóstico do Projeto (aura-companhia)

## Stack e estrutura

- Vite + React + TypeScript (SPA)
- React Router (rotas)
- Tailwind + shadcn/ui (Radix)
- Framer Motion (animações)
- TanStack React Query (instalado e provider configurado)

Arquivos de referência:

- Rotas e providers: [App.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/App.tsx)
- Config do Vite: [vite.config.ts](file:///e:/APLICATIVOS/projects/aura/aura-companhia/vite.config.ts)
- Tailwind: [tailwind.config.ts](file:///e:/APLICATIVOS/projects/aura/aura-companhia/tailwind.config.ts)

## O que já funciona (hoje)

Rotas existentes e navegáveis:

- `/` (Landing)
- `/dashboard`
- `/personas`
- `/planos`
- `/clientes`
- `/configuracao-persona`
- `*` (NotFound)

Layout e UI:

- Layout de dashboard (sidebar + header) pronto: [DashboardLayout.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/components/layouts/DashboardLayout.tsx)
- Componentes shadcn/ui configurados e reutilizáveis em `src/components/ui`

Telas principais prontas (UI):

- Landing: [Landing.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Landing.tsx)
- Dashboard: [Dashboard.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Dashboard.tsx)
- Personas: [Personas.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Personas.tsx)
- Planos: [Planos.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Planos.tsx)
- Clientes: [Clientes.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/Clientes.tsx)
- Configuração de persona (wizard + preview):
  - [ConfiguracaoPersona.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/pages/ConfiguracaoPersona.tsx)
  - [PersonaWizard.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/components/persona/PersonaWizard.tsx)
  - [WhatsAppFlowPreview.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/components/persona/WhatsAppFlowPreview.tsx)

## O que ainda não existe (ou está só protótipo)

- Não há backend nem chamadas HTTP no código atual (sem `fetch`, sem `useQuery` usado, sem endpoints `/api`).
- Os dados de Dashboard/Clientes/Planos/Personas são estáticos (arrays no frontend), sem persistência/CRUD real.
- Não existe autenticação/autorização no projeto.
- Existem itens no menu que apontam para rotas inexistentes e caem em 404:
  - `/conversas`, `/agente`, `/configuracoes`, `/ajuda`
  - Sidebar: [dashboard-sidebar.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/components/ui/dashboard-sidebar.tsx)

## Alertas e correções aplicadas

### 1) CSS: ordem do @import

Problema: o build avisava que `@import` precisa vir antes de `@tailwind`.

Correção: movi o `@import` do Google Fonts para o topo do arquivo.

- Arquivo: [index.css](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/index.css)

### 2) Bundle grande: code-splitting

Problema: o bundle principal estava grande; as páginas eram importadas de forma estática.

Correção: apliquei lazy-loading nas páginas via `React.lazy` + `Suspense`, o que gera chunks por rota.

- Arquivo: [App.tsx](file:///e:/APLICATIVOS/projects/aura/aura-companhia/src/App.tsx)

Resultado (build): foram gerados chunks separados para as páginas (ex.: `Landing-*.js`, `Planos-*.js`, etc.).

### 3) Vulnerabilidades (npm audit)

- Foi executado `npm audit fix` (sem `--force`).
- Sobrou 2 vulnerabilidades moderadas relacionadas ao `esbuild` via `vite`.
- O `npm audit` indica que a correção completa exige `npm audit fix --force`, que atualizaria o `vite` para uma versão com breaking changes.

## Status de compilação (verificado)

- `npm run build` passou.
- `npx tsc --noEmit` passou.

## Próximos passos recomendados (curto prazo)

- Decidir se as rotas do menu faltantes serão implementadas ou removidas do menu.
- Trocar dados estáticos por dados reais (definir backend/API e persistência).
- Implementar autenticação e controle de acesso.
- Decidir estratégia para resolver as 2 vulnerabilidades restantes (aceitar risco temporariamente ou planejar upgrade do Vite).


# Plano de Refatoração (Onboarding + Rotas WhatsApp + Landing) (sem quebrar nada)

Este documento descreve um plano **por etapas** para refatorar três áreas específicas:
- **Fluxo de onboarding do WhatsApp** (principalmente `server/whatsapp/fluxos/onboarding.fluxo.mjs`)
- **Rotas e pipeline de WhatsApp** (principalmente `server/rotas/whatsapp.rotas.mjs` e módulos relacionados)
- **Landing page** (principalmente `src/pages/Landing.tsx`)

Objetivo: **reduzir tamanho de arquivos**, **remover duplicações**, e **isolar responsabilidades**, mantendo o comportamento atual.

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando eu iniciar uma etapa, mudo para 🟡. Quando finalizar e validar, mudo para ✅.

---

## Regras rígidas (não negociáveis)
1. **Não alterar comportamento**: o sistema deve continuar funcionando exatamente como hoje.
2. **Não mudar rotas existentes** sem uma etapa específica e aprovada para isso.
3. **Não mudar contrato de resposta** (status HTTP, shape de JSON, mensagens enviadas no WhatsApp) sem aprovação explícita.
4. **Não mudar regras de negócio** de:
   - onboarding
   - roteamento de fluxos WhatsApp (comandos, billing, upgrade, conversa/agente)
   - controle de trial/assinatura/limites
5. **Não mudar persistência** (tabelas/colunas/semântica) e **não executar reset de banco**.
6. **Nunca executar comandos `npx prisma`** nem qualquer ação que resete o banco.
7. **Refatoração incremental**: mover código primeiro, melhorar depois. Cada etapa deve ser “pequena” e validável.
8. **Sem comentários novos no código**, a menos que você peça.
9. **Compatível com Windows/PowerShell** (sem `&&`).
10. **Erros de Redis e erros de auth do client podem ser ignorados** conforme regras do projeto.

---

## Critérios de validação (obrigatórios em toda etapa)
Ao concluir uma etapa (marcar ✅), deve ser verdadeiro que:
- `npx tsc --noEmit` passa (0 erros).
- `node --check` passa para os arquivos `.mjs` tocados na etapa.
- `npm run build` passa (garante que a Landing e o front compilam).

Observação: `npm run lint` pode ser usado como reforço, mas não é obrigatório para marcar ✅ se o projeto já tem ruído de lint.

---

## Estrutura alvo (resultado final esperado)

### Server (WhatsApp / onboarding)
- `server/rotas/whatsapp.rotas.mjs`
  - Handler único e consistente do webhook (sem duplicação “legado” com regras divergentes).
  - Decisão centralizada de “store” (`message` vs `onboardingMessage`) e `step` inbound.
- `server/whatsapp/onboarding/`
  - `opcoes.mjs`: catálogos de opções (ex.: etnia/cabelo/cor/profissão/roupa etc.).
  - `etapas/`: um módulo por etapa do onboarding (ex.: `askName.mjs`, `askEmail.mjs`, `askPersonality.mjs`, ...).
  - `roteador.mjs`: roteia `state.step` → handler da etapa.
- `server/dominio/mensagens/persistencia.mjs`
  - Helpers ampliados para reduzir boilerplate (`queued → send → sent/failed`) em qualquer fluxo, inclusive onboarding.

### Front (Landing)
- `src/pages/Landing.tsx`
  - Fica como “composição” (layout), com seções extraídas.
- `src/components/landing/`
  - Componentes de seção (ex.: `navbar-landing.tsx`, `hero-landing.tsx`, `secao-recursos.tsx`, `secao-precos.tsx`, `rodape-landing.tsx`).
- `src/domain/` (ou `src/constants/`)
  - Dados compartilhados (ex.: planos) para evitar duplicação entre Landing e `src/pages/Planos.tsx`.

---

## Etapas (por ordem de execução)

### ✅ Etapa 0 — Linha de base e inventário mínimo
**Objetivo**: garantir “baseline” antes de mexer e registrar o inventário do que existe hoje.
- Confirmar arquivos-alvo e pontos de duplicação (onboarding e rotas WhatsApp).
- Inventariar as rotas WhatsApp relevantes e suas responsabilidades.
- Inventariar as seções da Landing (sem alterar UI).

**Saída esperada**
- Documento atualizado (neste arquivo) com inventário mínimo.
- Nenhuma mudança funcional.

**Validação**
- `npx tsc --noEmit`
- `npm run build`
- `node --check server/rotas/whatsapp.rotas.mjs` (ou os arquivos tocados, se houver)

---

### ✅ Etapa 1 — Consolidar pipeline do WhatsApp (sem mudar contrato)
**Objetivo**: eliminar duplicações/inconsistências de roteamento e persistência no handler de WhatsApp.
- Garantir que exista **uma regra única** para:
  - decidir `store` (`message` vs `onboardingMessage`)
  - calcular `inboundStep`
- Se ainda existir endpoint “legado” (ou caminho alternativo) com regras divergentes:
  - transformar em “alias” do pipeline principal (mesmo roteamento), ou isolar o legado em um módulo único para evitar duplicação.

**Regras rígidas da etapa**
- Não mudar a ordem dos fluxos no pipeline (comandos → billing → upgrade → onboarding → conversa/agente), a menos que exista etapa explícita para isso.
- Não mudar textos/mensagens enviadas.

**Validação**
- `npx tsc --noEmit`
- `npm run build`
- `node --check server/rotas/whatsapp.rotas.mjs`

---

### ✅ Etapa 2 — Generalizar helper de “salvar saída + enviar + atualizar status”
**Objetivo**: reduzir boilerplate (principalmente no onboarding) usando helpers de persistência.
- Evoluir o helper existente para aceitar:
  - `type` (text/audio) quando necessário
  - e ser reutilizável por fluxos diferentes (sem duplicar `prisma.*.create/update`).
- Padronizar o uso do helper no onboarding (primeiro mover, depois melhorar).

**Regras rígidas da etapa**
- Persistência deve continuar igual (mesmas tabelas, semântica e status finais).
- Nenhuma mudança nos textos e botões.

**Validação**
- `npx tsc --noEmit`
- `npm run build`
- `node --check server/dominio/mensagens/persistencia.mjs`
- `node --check server/whatsapp/fluxos/onboarding.fluxo.mjs` (se tocado)

---

### ✅ Etapa 3 — Extrair “catálogos” do onboarding (opções/listas)
**Objetivo**: remover duplicação de arrays/mapeamentos e reduzir ruído do fluxo principal.
- Criar `server/whatsapp/onboarding/opcoes.mjs` com:
  - listas para WhatsApp List/Buttons (ex.: etnia, cabelo, cor, corpo, profissão, roupa…)
  - maps `reply → label` quando aplicável
- Substituir no onboarding os arrays inline por imports do catálogo.

**Regras rígidas da etapa**
- IDs de botões/listas (ex.: `etnia_*`, `cabelo_*`) não podem mudar.
- Ordem e conteúdo exibido devem permanecer equivalentes.

**Validação**
- `npx tsc --noEmit`
- `npm run build`
- `node --check server/whatsapp/onboarding/opcoes.mjs`
- `node --check server/whatsapp/fluxos/onboarding.fluxo.mjs`

---

### ✅ Etapa 4 — Componentizar o onboarding por etapas (roteador de step)
**Objetivo**: quebrar `onboarding.fluxo.mjs` em módulos menores mantendo o mesmo comportamento.
- Criar `server/whatsapp/onboarding/roteador.mjs`:
  - recebe `ctx`, lê `state.step` e chama handler da etapa.
- Criar pasta `server/whatsapp/onboarding/etapas/` com handlers pequenos por etapa.
- Fazer `onboarding.fluxo.mjs` virar um “orquestrador”:
  - detecção inicial (greeting / start) + chamada do roteador.

**Regras rígidas da etapa**
- Transições de `state.step` devem permanecer idênticas.
- Mensagens (texto), botões e listas devem permanecer idênticos.
- Persistência (tabela usada e `step` gravado) deve permanecer idêntica.

**Validação**
- `npx tsc --noEmit`
- `npm run build`
- `node --check server/whatsapp/fluxos/onboarding.fluxo.mjs`
- `node --check server/whatsapp/onboarding/roteador.mjs`
- `node --check` nos handlers novos tocados

---

### ✅ Etapa 5 — Componentizar a Landing por seções
**Objetivo**: reduzir `Landing.tsx` e isolar responsabilidades visuais.
- Criar componentes em `src/components/landing/` para:
  - navegação
  - hero
  - recursos
  - como funciona
  - preços
  - CTA final
  - rodapé
- Manter `src/pages/Landing.tsx` como composição das seções.

**Regras rígidas da etapa**
- Não alterar textos, links, ids (`#features`, `#pricing`, `#how-it-works`, `#cta`) nem classes relevantes.
- Não alterar comportamento de animações (framer-motion) sem etapa específica.

**Validação**
- `npx tsc --noEmit`
- `npm run build`

---

### 🔴 Etapa 6 — Centralizar dados de planos (Landing + Planos)
**Objetivo**: remover duplicação do conceito de “planos” no front.
- Extrair definição de planos para um módulo compartilhado (ex.: `src/domain/planos.ts`).
- Adaptar `Landing.tsx` e `Planos.tsx` para consumir do mesmo lugar.

**Regras rígidas da etapa**
- Manter visual e conteúdo equivalentes; mudanças de copy só com aprovação.

**Validação**
- `npx tsc --noEmit`
- `npm run build`

---

### 🔴 Etapa 7 — Limpeza final (redução física de arquivos e imports)
**Objetivo**: fechar a refatoração reduzindo o tamanho dos arquivos-alvo e removendo sobras.
- Garantir que:
  - `onboarding.fluxo.mjs` ficou “orquestrador”
  - `whatsapp.rotas.mjs` não contém blocos duplicados/legados divergentes
  - `Landing.tsx` ficou composição
- Remover imports mortos e consolidar exports.

**Validação**
- `npx tsc --noEmit`
- `npm run build`
- `node --check` para os `.mjs` tocados

---

## Inventário mínimo (referência)

### WhatsApp (rotas)
- Webhook verify e receive: `GET/POST /api/whatsapp/webhook/:phoneNumberId`
- Endpoint “legado” (se existir): `GET/POST /api/webhook/whatsapp` (não remover sem etapa específica)
- Endpoint interno de envio (se existir): `POST /api/whatsapp/send`

### Onboarding (server)
- Fluxo principal: `server/whatsapp/fluxos/onboarding.fluxo.mjs`
- Estado em memória: `server/whatsapp/estado.mjs`

### Landing (front)
- Página: `src/pages/Landing.tsx`

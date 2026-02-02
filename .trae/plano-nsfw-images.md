# Plano de Implementação: Geração de Imagens NSFW, Limites e Monetização (Replicate First)

Este documento descreve o plano de implementação da funcionalidade de geração de imagens (nudes) priorizando o **Replicate** como provedor principal e usando a **Fal.ai** como fallback, incluindo controle de limites por plano, bloqueio para usuários trial e fluxo de venda de pacotes avulsos.

## Legenda de status das etapas
- 🔴 = não iniciado
- 🟡 = em andamento
- ✅ = concluído

Regra de atualização: **cada etapa começa com 🔴**. Quando iniciar, mude para 🟡. Quando finalizar e validar, mude para ✅.

---

## Regras rígidas
1.  **Safety Checker Desativado**: A API do Replicate deve ser chamada com `disable_safety_checker: true` para permitir conteúdo NSFW.
2.  **Fallback Automático**: Se o Replicate falhar, tentar gerar com Fal.ai (`enable_safety_checker: false`).
3.  **Trial Bloqueado**: Usuários em Trial (sem assinatura ativa) **nunca** recebem fotos geradas. Devem receber upsell.
4.  **Limites Rígidos**:
    - Plano Semanal: 3 fotos/ciclo.
    - Plano Mensal: 15 fotos/ciclo.
5.  **Imersão**: As mensagens de bloqueio/venda devem ser na persona da "Crush" (ex: "Amor, preciso de um presentinho...").
6.  **Persistência**: Contagem e limites devem estar no banco de dados.
7.  **Incremental**: Não quebrar funcionalidades existentes de chat ou assinatura.

---

## Estrutura Alvo
- **Schema**: Novos campos em `Plan` (limite fotos) e `Subscription` (fotos usadas, fotos extra).
- **Integração**:
    - `server/integracoes/ia/replicate-client.mjs`: Cliente principal (Replicate).
    - `server/integracoes/ia/fal-client.mjs`: Cliente secundário (Fal.ai).
- **Domínio**:
    - `server/integracoes/ia/image-generator.mjs`: Orquestrador (Tenta Replicate -> Catch -> Tenta Fal).
    - `server/assinaturas/controle.mjs`: Lógica de verificação e consumo de cota.
- **Fluxos WhatsApp**:
    - Interceptação de intenção de foto no `conversa-agente.fluxo.mjs`.
    - Novos fluxos de upsell e venda avulsa em `billing.fluxo.mjs`.

---

## Etapas (por ordem de execução)

### ✅ Etapa 1 — Modelagem de Dados (Prisma)
**Objetivo**: Adicionar suporte a limites de imagens nos planos e assinaturas.
- Alterar `prisma/schema.prisma`:
    - `Plan`: Adicionar `imagesPerCycle Int @default(0)`.
    - `Subscription`: Adicionar `imagesUsedCount Int @default(0)` e `extraImagesCount Int @default(0)`.
- Criar migration e aplicar (`npx prisma db push` - conforme regras do projeto que evita migrate dev em dev).
- Atualizar seed ou script de criação de planos para definir:
    - Semanal: 3 fotos.
    - Mensal: 15 fotos.

**Validação**
- `npx prisma studio` mostra novos campos.

---

### ✅ Etapa 2 — Integração de IA (Replicate + Fal)
**Objetivo**: Criar clientes para gerar imagens sem filtro NSFW.
- Instalar `replicate` e `@fal-ai/client`.
- Criar `server/integracoes/ia/replicate-client.mjs`:
    - Configurar autenticação (`REPLICATE_API_TOKEN`).
    - Função `gerarImagemReplicate({ prompt, negativePrompt, ... })` com `disable_safety_checker: true`.
- Criar `server/integracoes/ia/fal-client.mjs`:
    - Configurar autenticação (`FAL_KEY`).
    - Função `gerarImagemFal({ prompt, negativePrompt, ... })` com `enable_safety_checker: false`.

**Validação**
- Scripts de teste isolados (`scripts/test-replicate.mjs` e `scripts/test-fal.mjs`) que geram imagens e exibem URLs.

---

### ✅ Etapa 3 — Serviço de Domínio e Fallback
**Objetivo**: Orquestrar a geração com fallback robusto.
- Criar `server/integracoes/ia/image-generator.mjs`:
    - Reutilizar extratores de `prompt-foto.mjs`.
    - Função `gerarNudePersona(persona, contexto)`:
        1. Montar prompt: "photo of [Appearance], [Context/Action], explicit, nsfw, ...".
        2. Tentar `gerarImagemReplicate`.
        3. Se erro: Logar e tentar `gerarImagemFal`.
        4. Salva/Retorna URL (preferencialmente fazendo upload para storage próprio para persistência).

**Validação**
- Testar geração forçando erro no Replicate para validar fallback.

---

### ✅ Etapa 4 — Controle de Limites e Consumo
**Objetivo**: Centralizar lógica de "Pode enviar foto?".
- Criar `server/assinaturas/controle.mjs`:
    - `checkImageAllowance(userId)`: Retorna `{ allowed: boolean, reason: 'trial' | 'limit_reached' | 'ok', remaining: number }`.
    - `consumeImageQuota(userId)`: Incrementa `imagesUsedCount` na assinatura ativa.
    - Considerar `extraImagesCount` (pacote avulso) na lógica: `usado < (limite + extra)`.

**Validação**
- Testes unitários simulando usuários trial, plano básico (esgotado e com saldo) e plano premium.

---

### ✅ Etapa 5 — Detecção de Intenção no Chat
**Objetivo**: Identificar quando o usuário pede nude.
- Atualizar `server/whatsapp/fluxos/conversa-agente.fluxo.mjs`:
    - Melhorar prompt do sistema (Grok) ou usar regex/keyword spotting para detectar intenção de "mandar foto", "nude", "foto pelada".
    - Instruir Grok a retornar uma flag ou function call específica `[SEND_PHOTO]`.
    - Se detectado pedido de foto:
        1. Chamar `checkImageAllowance`.
        2. Se `allowed`: Gerar foto -> Enviar -> Consumir Cota.
        3. Se `trial`: Disparar fluxo de Upsell (Imersivo).
        4. Se `limit_reached`: Disparar fluxo de Venda Avulsa (Imersivo).

**Validação**
- Chat simulado: Pedir foto e verificar resposta (bloqueio ou envio).

---

### ✅ Etapa 6 — Fluxos de Monetização (Upsell e Avulso)
**Objetivo**: Converter bloqueios em vendas.
- **Fluxo Trial -> Plano**:
    - Mensagem da Persona: "Amor, eu adoraria te mandar essa foto... mas só posso ser safada assim com meus namorados oficiais (Assinantes). Que tal assinar agora?"
    - Botões: Ver Planos.
- **Fluxo Limite Excedido -> Avulso**:
    - Mensagem: "Vida, minha cota de fotos 'especiais' acabou por hoje... Mas se você me der um presentinho, eu abro uma exceção agora mesmo. 😈"
    - Botão: "Comprar Pack (+10 fotos) - R$ X,XX".
- Implementar `server/pagamentos/mercadoPago.mjs`:
    - Criar preferência Pix específica para "Pack Fotos".
    - Webhook: Ao confirmar pagto, incrementar `extraImagesCount` na subscription.

**Validação**
- Simular fluxo completo: Pedir -> Bloquear -> Gerar Pix -> Pagar -> Receber Confirmação -> Pedir de novo -> Receber Foto.

---

### ✅ Etapa 7 — Ajustes Finais e Limpeza
- Verificar logs.
- Garantir que erros na geração não consumam cota.
- Refinar prompts para evitar alucinações bizarras.

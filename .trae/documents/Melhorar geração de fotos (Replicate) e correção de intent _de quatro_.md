## Diagnóstico atual
- O fluxo de geração NSFW tenta nesta ordem: RunComfy → ComfyUI → Replicate → Fal.ai ([image-generator.mjs](file:///e:/APLICATIVOS/projects/aura/crushzap/server/integracoes/ia/image-generator.mjs#L14-L67)).
- Replicate, quando acionado, usa o modelo `aisha-ai-official/flux.1dev-uncensored-msfluxnsfw-v3` com `steps=28`, `cfg_scale=3.5`, `scheduler="Euler flux beta"` e dimensões por aspect ratio ([replicate-client.mjs](file:///e:/APLICATIVOS/projects/aura/crushzap/server/integracoes/ia/replicate-client.mjs#L5-L45)).
- Pelo `.env` atual, ComfyUI está desativado (API base vazia) e RunComfy provavelmente falha (base não parece URL), então na prática o sistema tende a cair no Replicate como provedor efetivo.

## Causa do bug “de quatro” virar “peitos”
- O tipo de foto é decidido só pelo conteúdo da tag `[SEND_PHOTO: ...]` gerada pelo LLM (não usa o texto do usuário), para evitar falsos positivos com negação ([conversa-agente.fluxo.mjs](file:///e:/APLICATIVOS/projects/aura/crushzap/server/whatsapp/fluxos/conversa-agente.fluxo.mjs#L21-L28)).
- Se a tag do LLM contiver termos como `breasts/peitos`, cai no prompt fixo de close em seios ([conversa-agente.fluxo.mjs](file:///e:/APLICATIVOS/projects/aura/crushzap/server/whatsapp/fluxos/conversa-agente.fluxo.mjs#L29-L67)).

## Mudanças planejadas (código)
1) Ajustar `resolveImagePrompt` para priorizar pose explícita do usuário
- Implementar detecção “com negação” (ex.: ignorar `bunda` em “não quero bunda”), e permitir que termos fortes como “de quatro/cachorrinho/on all fours/doggystyle” sobrescrevam triggers de close-up.
- Adicionar um prompt fixo específico para “de quatro” (full-body/rear view) para reduzir a chance de virar close-up de seios.

2) Melhorar realismo e suporte a “cinematic / foto real”
- Trocar o estilo fixo “amateur/phone camera” por um estilo escolhido por intenção:
  - Se o usuário pedir “cinematic/foto real/filme”, usar linguagem de fotografia (lente, DOF, iluminação, granulação, color grading) sem conflitar com “amador”.
  - Caso contrário, manter “amador” como default.
- Refinar o negative prompt para combater o “emborrachado” (ex.: waxy/plastic/over-smoothed/beauty filter/over-processed) de forma mais agressiva e consistente.

3) Ajustar parâmetros do Replicate para mais naturalidade
- Tornar `steps/cfg` ajustáveis via env (com defaults atuais) e testar um preset mais realista (ex.: `steps=36`, `cfg=2.7`) para reduzir “pele plástica”.
- Manter dimensões atuais, mas permitir um modo “high-res” via env para quem quiser.

4) Observabilidade sem vazar conteúdo sensível
- Reduzir logs de prompt (ou mascarar mais) para evitar exposição de conteúdo explícito e dados do usuário.

## Validação
- Criar testes automatizados (unit) para `resolveImagePrompt` cobrindo:
  - “de quatro” não virar `breasts`.
  - negações (“não quero bunda”) não ativarem triggers.
  - pedidos “cinematic/foto real” alterarem o estilo.
- Rodar `npx tsc --noEmit` para garantir que nada quebre em TypeScript (se aplicável no repo).
- Executar um fluxo local mínimo (simulação de tag `[SEND_PHOTO]`) para comparar prompt/negative antes e depois.

## Entregáveis
- Correção do roteamento de intenção (“de quatro” → doggystyle) e prompts mais consistentes.
- Presets de realismo/cinematic e negativos melhores.
- Replicate mais configurável e com parâmetros mais adequados ao realismo.

Resumo do que foi feito: mapeei o que o Replicate usa hoje (modelo/params) e identifiquei o ponto exato do código que faz “de quatro” cair em prompt fixo de seios quando a tag do LLM contém `breasts`.
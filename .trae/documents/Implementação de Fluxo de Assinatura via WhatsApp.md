Vou implementar o fluxo de assinatura completo diretamente no chat do WhatsApp, permitindo que o usuário escolha um plano e receba o código PIX para pagamento sem sair da conversa.

### Passos da Implementação:

1.  **Criação de Planos (Seed)**
    *   Criar script `scripts/seed-plans.mjs` para garantir que existam planos no banco de dados (Ex: Semanal e Mensal).
    *   Isso é necessário para que a oferta apareça para o usuário.

2.  **Refatoração do Pagamento PIX**
    *   Extrair a lógica de criação de pagamento do Mercado Pago (atualmente dentro da rota `/api/pagamentos/pix/checkout`) para uma função reutilizável `createPixPayment`.
    *   Isso permitirá gerar o PIX diretamente pelo fluxo do bot, sem depender de chamadas HTTP internas.

3.  **Melhoria na Mensagem de Bloqueio (Trial Expirado)**
    *   No arquivo `server/index.mjs`, alterar a lógica que verifica o fim do trial.
    *   Em vez de enviar apenas texto ("Seu teste terminou..."), enviar uma **Lista Interativa** (botão de menu) com os planos disponíveis.

4.  **Fluxo de Contratação**
    *   Adicionar lógica no processamento de mensagens para identificar quando o usuário seleciona um plano (ID começando com `assinar_`).
    *   Ao selecionar:
        1.  Identificar o plano escolhido.
        2.  Gerar o pagamento PIX usando a nova função.
        3.  Enviar o código **PIX Copia e Cola** para o usuário.
        4.  Enviar instruções de pagamento.

### Resultado Esperado:
Quando o trial do usuário acabar, ele receberá um menu "Ver Planos". Ao clicar e escolher uma opção, receberá imediatamente o código PIX para pagar e liberar o acesso.
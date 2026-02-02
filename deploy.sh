#!/bin/bash

# Script de Deploy para VPS (aaPanel/Linux)
# Uso: ./deploy.sh

# Parar execução em caso de erro
set -e

echo "🚀 Iniciando deploy do CrushZap..."

# 1. Puxar últimas alterações do Git
echo "📦 Atualizando código (git pull)..."
git pull

# 2. Instalar dependências do Node.js
echo "📚 Instalando dependências (npm install)..."
npm install

# 3. Gerar cliente do Prisma (Banco de Dados)
echo "🗃️ Gerando Prisma Client..."
npx prisma generate

# 4. Build do Frontend (Vite -> dist)
echo "🏗️ Construindo o frontend (npm run build)..."
npm run build

# 5. Reiniciar o servidor
# Se estiver usando o Gerenciador de Node do aaPanel, ele gerencia o PM2.
# Mas se quiser forçar via PM2 (caso tenha configurado manualmente):
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "crushzap"; then
        echo "🔄 Reiniciando processo PM2 'crushzap'..."
        pm2 restart crushzap
    else
        echo "⚠️ Processo 'crushzap' não encontrado no PM2. Se você configurou via aaPanel, pode ignorar isso ou iniciar manualmente."
        # pm2 start server/index.mjs --name "crushzap"
    fi
else
    echo "ℹ️ PM2 não detectado no PATH. Se estiver usando o painel do aaPanel, reinicie o projeto pela interface."
fi

echo "✅ Deploy finalizado com sucesso!"
echo "🌐 O servidor deve estar rodando na porta definida no .env (Padrão: 3001)"

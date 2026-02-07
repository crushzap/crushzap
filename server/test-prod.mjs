
import https from 'https';

// Configuração
const DOMAIN = 'crushzap.com.br';
const PHONE_NUMBER_ID = '1030646366790575';
const PATH = `/api/whatsapp/webhook/${PHONE_NUMBER_ID}`;

const data = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '123456789',
              phone_number_id: PHONE_NUMBER_ID
            },
            contacts: [{ profile: { name: 'Teste Prod' }, wa_id: '5511999999999' }],
            messages: [
              {
                from: '5511999999999',
                id: 'wamid.TESTE_PROD_' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000),
                text: { body: 'Teste Produção via Script' },
                type: 'text'
              }
            ]
          },
          field: 'messages'
        }
      ]
    }
  ]
});

const options = {
  hostname: DOMAIN,
  port: 443,
  path: PATH,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'FacebookPlatform/WhatsApp', // Simula User-Agent do WhatsApp
    'Content-Length': data.length
  }
};

console.log(`Enviando POST para https://${DOMAIN}${PATH}...`);

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('Fim da resposta.');
  });
});

req.on('error', (e) => {
  console.error(`Erro na requisição: ${e.message}`);
});

req.write(data);
req.end();

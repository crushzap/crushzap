
import https from 'https';

// Configuração
const DOMAIN = 'crushzap.com.br';
const PHONE_NUMBER_ID = '1030646366790575';
const PATH = `/api/whatsapp/webhook/${PHONE_NUMBER_ID}`;

// Payload menor e mais simples para evitar fragmentação
const payloadObj = {
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
            contacts: [{ profile: { name: 'Teste' }, wa_id: '5562981773529' }],
            messages: [
              {
                from: '5562981773529',
                id: 'wamid.TESTE_' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000),
                text: { body: 'Teste Simples' },
                type: 'text'
              }
            ]
          },
          field: 'messages'
        }
      ]
    }
  ]
};

const data = JSON.stringify(payloadObj);
const contentLength = Buffer.byteLength(data, 'utf8');

const options = {
  hostname: DOMAIN,
  port: 443,
  path: PATH,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'FacebookPlatform/WhatsApp',
    'Content-Length': contentLength,
    'Connection': 'close'
  }
};

console.log(`Enviando POST (${contentLength} bytes) para https://${DOMAIN}${PATH}...`);

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  res.setEncoding('utf8');
  let responseBody = '';
  res.on('data', (chunk) => { responseBody += chunk; });
  res.on('end', () => {
    console.log(`BODY: ${responseBody}`);
  });
});

req.on('error', (e) => {
  console.error(`Erro na requisição: ${e.message}`);
});

// Escrever o corpo da requisição de uma só vez para evitar chunked encoding problemático
req.write(data);
req.end();

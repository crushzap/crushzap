
import http from 'http';

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
              phone_number_id: '1030646366790575'
            },
            contacts: [
              {
                profile: {
                  name: 'Teste Local'
                },
                wa_id: '5511999999999'
              }
            ],
            messages: [
              {
                from: '5511999999999',
                id: 'wamid.TESTE_LOCAL_' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000),
                text: {
                  body: 'Teste Local'
                },
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
  hostname: 'localhost',
  port: 3001,
  path: '/api/whatsapp/webhook/1030646366790575',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();

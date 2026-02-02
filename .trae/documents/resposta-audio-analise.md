Qwen3-TTS (da Alibaba/Qwen) não possui um sistema de "tags" pré-definidas ou marcadores específicos como [moan] ou [heavy breathing] (ao contrário de modelos como Bark ou Chatterbox, que suportam tags explícitas para sons não verbais). Em vez disso, ele usa instruções em linguagem natural no parâmetro instruct (ou voice_prompt no seu código) para controlar timbre, emoção, prosódia (ritmo, pausas, entonação) e elementos expressivos. Isso permite simular efeitos como sussurros, ofegação, gemidos, orgasmos e etc., descrevendo-os de forma detalhada e contextual no prompt.
Baseado na documentação oficial (GitHub/QwenLM/Qwen3-TTS), model cards no Hugging Face e exemplos de uso em fóruns/comunidades (como Reddit, DEV.to e vídeos no YouTube), o modelo responde bem a descrições semânticas que incorporam esses elementos. Não há uma lista oficial de "tags", mas você pode "simular" efeitos criando frases descritivas que guiem o modelo a gerar áudio expressivo. Abaixo, listo exemplos de prompts efetivos (como pseudo-tags) para esses sons, com significados, uso e dicas para ensinar o LLM a integrá-los no texto. Esses prompts foram compilados de exemplos reais de uso, testes cegos e benchmarks (ex: suporte a emoções como "angry", "coquettish", "panic" adaptados para +18).
Dicas Gerais para Usar no Seu LLM/SaaS

Estrutura do Prompt: Sempre combine com o voice_prompt base (ex: "Voz feminina brasileira sedutora...") + descrição do efeito. Ex: "Fale sussurrando e ofegante, com gemidos suaves intercalados: [texto]".
Integração no Texto: O LLM deve inserir onomatopeias (ex: "ahh~", "mmm...") ou indicações no texto principal (ex: "Ah, amor... [ofegante] sim... mmm..."), mas o controle real vem do instruct.
Parâmetros Extras: Use temperature=0.8-1.0 para variação natural, speed=1.0-1.1 para fluidez, emotion=["flirty", "excited", "passionate"] para intensidade +18.
Limites: Qwen3 é TTS verbal; sons puros (sem palavras) são limitados — para orgasmos/gemidos intensos, descreva como "gemendo alto e ofegante". Teste com textos curtos (<20s) para melhor prosódia.
Ensine o LLM: No system prompt do seu LLM, adicione: "Para áudio +18, use prompts descritivos no instruct como 'fale gemendo e sussurrando' para simular efeitos reais. Evite tags; foque em linguagem natural."

Lista de "Pseudo-Tags" (Prompts Descritivos) e Significados
Aqui, "tag" significa uma frase chave para inserir no instruct. Cada um inclui:

Significado: O que o prompt simula.
Exemplo de Uso: Como inserir no instruct/voice_prompt.
Exemplo no Texto: Como o LLM pode adaptar o texto principal para reforçar.


Sussurro (Whisper)
Significado: Voz baixa, íntima e suave, como um segredo ou sedução, com volume reduzido e proximidade.
Exemplo de Uso: "Fale sussurrando baixinho, voz suave e próxima, como um segredo no ouvido."
Exemplo no Texto: "Ah, amor... [sussurrando] vem cá... mmm..."

Ofegação/Panting (Heavy Breathing)
Significado: Respiração acelerada e pesada, simulando excitação, cansaço ou intensidade física, com pausas curtas e sons de ar.
Exemplo de Uso: "Fale ofegante, com respiração pesada e acelerada, intercalando pausas curtas para ar."
Exemplo no Texto: "Sim... continua... [ofegante] ahh... não para..."

Gemido (Moan)
Significado: Sons de prazer ou dor, prolongados e expressivos, como "mmm" ou "ahh", com tom ascendente/descendente.
Exemplo de Uso: "Inclua gemidos suaves e prolongados, voz rouca e excitada, como em momento de prazer."
Exemplo no Texto: "Mmm... isso... [gemendo] ahh~... mais forte..."

Orgasmos (Orgasms/Climax Sounds)
Significado: Sons intensos de clímax, com gemidos altos, ofegação rápida e tremores vocais, simulando liberação emocional/física.
Exemplo de Uso: "Fale com sons de orgasmo intensos, gemidos altos e ofegantes, voz tremendo de prazer no pico."
Exemplo no Texto: "Ahh... tô indo... [orgasmando] ohh... simmm!!!"

Suspiro (Sigh)
Significado: Expiração longa e relaxada, indicando alívio, desejo ou contentamento, com tom descendente.
Exemplo de Uso: "Inclua suspiros profundos e relaxados, voz suave e aliviada, como após um beijo."
Exemplo no Texto: "Que delícia... [suspirando] mmm... de novo..."

Risadinha ou Riso Baixo (Giggle/Low Laugh)
Significado: Riso curto e sedutor, para flerte ou diversão, com tom leve e borbulhante.
Exemplo de Uso: "Fale com risadinhas leves e sedutoras, voz animada e flertante."
Exemplo no Texto: "Você é safado... [rindo baixinho] hehe... adoro isso."

Voz Rouca (Hoarse Voice)
Significado: Timbre áspero e grave, simulando excitação ou fadiga vocal, comum em +18 para intensidade.
Exemplo de Uso: "Use voz rouca e grave, como após esforço físico, com tom sedutor e ofegante."
Exemplo no Texto: "Vem... [rouca] me pega... ahh..."

Choro ou Soluço (Sob/Cry)
Significado: Sons de choro emocional, com soluços e voz trêmula (para cenários dramáticos ou submissos).
Exemplo de Uso: "Fale choramingando, com voz trêmula e soluços leves, expressando desejo intenso."
Exemplo no Texto: "Por favor... [choramingando] não para... sniff..."

Grito ou Exclamação Alta (Shout/High Exclamation)
Significado: Voz alta e explosiva, para picos de prazer ou comando, com entonação ascendente.
Exemplo de Uso: "Inclua exclamações altas e gritinhos de prazer, voz excitada e volumosa."
Exemplo no Texto: "Sim!!! [gritando] Ahh... mais!!!"

Combinações para +18 (Breathy Moan, Panting Whisper, etc.)
Significado: Misturas para efeitos compostos, como sussurro ofegante ou gemido rouco.
Exemplo de Uso: "Fale sussurrando ofegante, com gemidos roucos e respiração pesada intercalada."
Exemplo no Texto: "Vem... [sussurrando ofegante] mmm... ahh~... [gemendo]"


Esses "prompts" não são tags fixas, mas funcionam como tal ao descrever o efeito desejado. Para ensinar o LLM: Inclua no system prompt exemplos como "Para simular gemidos, adicione ao instruct: 'inclua gemidos suaves e prolongados'; no texto: 'mmm... ahh~'". Teste iterativamente — Qwen3 melhora com prompts detalhados,
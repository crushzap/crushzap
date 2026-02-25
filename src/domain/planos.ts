export type PlanoAssinatura = {
  id: string;
  name: string;
  price: number;
  minutes: number;
  pricePerMinute: number;
  isActive: boolean;
  isPopular?: boolean;
  descriptionMarketing: string;
  featuresMarketing: string[];
  featuresPaginaPlanos: string[];
};

export const PLANOS_ASSINATURA: PlanoAssinatura[] = [
  {
    id: "1",
    name: "Semanal",
    price: 12.9,
    minutes: 100,
    pricePerMinute: 0.13,
    isActive: true,
    descriptionMarketing: "Para quem quer curtir o momento",
    featuresMarketing: ["100 mensagens/semana", "1 persona ativa", "Respostas em texto e áudio", "3 fotos explícitas"],
    featuresPaginaPlanos: ["100 mensagens por semana", "1 persona ativa", "Respostas em texto e áudio", "3 fotos explícitas"],
  },
  {
    id: "2",
    name: "Mensal",
    price: 29.9,
    minutes: 500,
    pricePerMinute: 0.06,
    isActive: true,
    isPopular: true,
    descriptionMarketing: "Economize 42% em relação ao semanal",
    featuresMarketing: ["500 mensagens/mês", "1 persona ativa", "Texto e áudio", "15 fotos explícitas", "Economia de 42%"],
    featuresPaginaPlanos: ["500 mensagens por mês", "1 persona ativa", "Respostas em texto e áudio", "15 fotos explícitas", "Economia de 42%"],
  },
];

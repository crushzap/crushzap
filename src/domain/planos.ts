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
    name: "Padrão",
    price: 9.9,
    minutes: 30,
    pricePerMinute: 0.33,
    isActive: true,
    descriptionMarketing: "Perfeito para começar",
    featuresMarketing: ["30 mensagens/mês", "1 persona ativa", "Respostas em texto", "Suporte por email"],
    featuresPaginaPlanos: ["30 mensagens por mês", "1 persona ativa", "Respostas em texto", "Suporte por email"],
  },
  {
    id: "2",
    name: "Básico",
    price: 14.9,
    minutes: 60,
    pricePerMinute: 0.25,
    isActive: true,
    isPopular: true,
    descriptionMarketing: "Mais popular",
    featuresMarketing: ["60 mensagens/mês", "3 personas ativas", "Texto e áudio", "Suporte prioritário"],
    featuresPaginaPlanos: ["60 mensagens por mês", "3 personas ativas", "Respostas em texto e áudio", "Suporte prioritário"],
  },
  {
    id: "3",
    name: "Premium",
    price: 24.9,
    minutes: 120,
    pricePerMinute: 0.21,
    isActive: true,
    descriptionMarketing: "Experiência completa",
    featuresMarketing: ["120 mensagens/mês", "Personas ilimitadas", "Áudio HD premium", "Suporte VIP 24/7"],
    featuresPaginaPlanos: [
      "120 mensagens por mês",
      "Personas ilimitadas",
      "Respostas em texto e áudio HD",
      "Suporte VIP 24/7",
      "Personalização avançada",
    ],
  },
];


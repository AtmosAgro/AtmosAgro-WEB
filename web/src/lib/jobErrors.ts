export type ProcessOverrides = {
  cloudCoverMax?: number;
};

export type QuickAction = {
  label: string;
  payload: ProcessOverrides;
};

export type DescribedError = {
  title: string;
  suggestion: string;
  quickAction?: QuickAction;
};

const NO_PRODUCT_30 = /no sentinel-2 product found .* cloud\s*[≤<=]+\s*30/i;
const NO_PRODUCT_60 = /no sentinel-2 product found .* cloud\s*[≤<=]+\s*60/i;

export function describeJobError(raw: string | null | undefined): DescribedError {
  const text = (raw ?? "").trim();

  if (!text) {
    return {
      title: "Falha no processamento",
      suggestion: "Tente novamente em instantes.",
    };
  }

  if (NO_PRODUCT_30.test(text)) {
    return {
      title: "Sem cena Sentinel-2 limpa na janela",
      suggestion:
        "Não encontramos imagens com nuvem ≤ 30% nos 7 dias antes/depois da data escolhida. Você pode tentar com tolerância maior de nuvens.",
      quickAction: {
        label: "Tentar com nuvem ≤ 60%",
        payload: { cloudCoverMax: 60 },
      },
    };
  }

  if (NO_PRODUCT_60.test(text)) {
    return {
      title: "Sem cena Sentinel-2 mesmo com nuvem ≤ 60%",
      suggestion:
        "Nenhuma passagem do satélite na janela atendeu ao critério. Tente uma data mais antiga ou outra propriedade.",
    };
  }

  return {
    title: "Falha no processamento",
    suggestion: text,
  };
}

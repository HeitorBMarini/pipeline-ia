import { STAGE_PROBABILITY, STAGES, daysSince, brl, type Insight, type Lead, type StageId } from "./types";

const POSITIVE = /fechar|assinatura|aprovado|ótimo|gostaram|interesse|dor forte|pediu uma demo|quer|piloto/i;
const NEGATIVE = /sem retorno|sem resposta|concorrente|acima|desconto|apertado|optaram|depende/i;

export function lastContact(lead: Lead) {
  return lead.interactions.reduce((max, i) => (i.date > max ? i.date : max), lead.interactions[0]?.date ?? "");
}

/** Score por regras usado no modo demonstração (e como referência para o modelo). */
export function heuristicInsight(lead: Lead): Insight {
  const reasons: string[] = [];
  const idle = daysSince(lastContact(lead));
  const text = lead.interactions.map((i) => i.text).join(" ");

  if (lead.stage === "ganho") {
    return {
      score: 100,
      temperature: "quente",
      summary: `${lead.company} já é cliente (${brl(lead.value)}).`,
      reasons: ["Negócio ganho"],
      nextAction: "Acompanhar a implantação e pedir uma indicação em 30 dias.",
    };
  }
  if (lead.stage === "perdido") {
    return {
      score: 5,
      temperature: "frio",
      summary: `${lead.company} escolheu outra solução.`,
      reasons: ["Negócio perdido"],
      nextAction: "Agendar retomada de contato para o período que o cliente indicou.",
    };
  }

  let score = Math.round(STAGE_PROBABILITY[lead.stage] * 60) + 20;
  reasons.push(`Etapa: ${STAGES.find((s) => s.id === lead.stage)?.label}`);

  if (idle <= 3) {
    score += 12;
    reasons.push(`Contato recente (${idle} dia${idle === 1 ? "" : "s"})`);
  } else if (idle > 20) {
    score -= 20;
    reasons.push(`Parado há ${idle} dias`);
  } else if (idle > 10) {
    score -= 8;
    reasons.push(`${idle} dias sem contato`);
  }

  if (POSITIVE.test(text)) {
    score += 10;
    reasons.push("Sinais de compra nas conversas");
  }
  if (NEGATIVE.test(text)) {
    score -= 10;
    reasons.push("Objeções ou concorrência citadas");
  }
  if (lead.interactions.length >= 3) {
    score += 5;
    reasons.push(`${lead.interactions.length} interações registradas`);
  }

  score = Math.max(1, Math.min(99, score));
  const temperature = score >= 70 ? "quente" : score >= 40 ? "morno" : "frio";
  const last = lead.interactions[lead.interactions.length - 1];

  return {
    score,
    temperature,
    summary: `${lead.contact} (${lead.role}) · ${brl(lead.value)}. Última interação: ${last?.text ?? "nenhuma"}`,
    reasons,
    nextAction: suggestNextAction(lead.stage, idle),
  };
}

function suggestNextAction(stage: StageId, idle: number) {
  if (idle > 20) return "Retomar o contato por telefone: o lead esfriou.";
  switch (stage) {
    case "novo":
      return "Fazer o primeiro contato e qualificar orçamento, prazo e decisor.";
    case "qualificado":
      return "Agendar uma demo focada na principal dor levantada.";
    case "proposta":
      return "Ligar para tirar dúvidas da proposta e confirmar a data da decisão.";
    case "negociacao":
      return "Destravar a última objeção e enviar o contrato para assinatura.";
    default:
      return "Registrar o próximo passo com data.";
  }
}

const OPENING: Record<StageId, string> = {
  novo: "vi seu interesse e queria entender melhor o momento de vocês para ver se faz sentido conversarmos.",
  qualificado: "pensando no que conversamos, preparei uma demonstração focada no que vocês mais precisam.",
  proposta: "queria saber se você conseguiu avaliar a proposta que enviei e se ficou alguma dúvida.",
  negociacao: "estamos bem perto. Falta algum ponto para seguirmos com a assinatura?",
  ganho: "passando para saber como está a implantação e se posso ajudar em algo.",
  perdido: "faz um tempo que conversamos e queria saber se o cenário de vocês mudou.",
};

export function followUpDraft(lead: Lead) {
  const first = lead.contact.replace(/^(Dra?\.)\s*/, "").split(" ")[0];
  const history = lead.interactions.map((i) => i.text).join(" ");
  const extra = /concorrente|acima|comparativ/i.test(history)
    ? "\n\nSe ajudar, monto uma comparação ponto a ponto mostrando o que já está incluso na nossa proposta."
    : /desconto|parcel/i.test(history)
      ? "\n\nConversei aqui internamente e temos alguma flexibilidade nas condições de pagamento."
      : "";
  return `Olá, ${first}, tudo bem?

${OPENING[lead.stage].charAt(0).toUpperCase()}${OPENING[lead.stage].slice(1)}${extra}

Posso te ligar amanhã ou quinta, 10 minutos, para alinharmos os próximos passos?

Abraço,
${lead.owner}`;
}

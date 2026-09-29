import type Anthropic from "@anthropic-ai/sdk";
import { STAGES, STAGE_IDS, STAGE_PROBABILITY, brl, daysSince, type AgentAction, type Lead, type StageId, type ToolCall } from "./types";
import { followUpDraft, heuristicInsight, lastContact } from "./heuristics";

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

export const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "resumo_pipeline",
    description: "Totais do funil: quantidade e valor por etapa, valor em aberto, previsão ponderada pela probabilidade de cada etapa e taxa de ganho.",
    input_schema: obj({}, []),
    strict: true,
  },
  {
    name: "buscar_leads",
    description:
      "Lista leads com filtros. Use string vazia ou 'todas' para não filtrar, e parados_ha_dias = 0 para ignorar esse filtro. Retorna id, empresa, etapa, valor, responsável e dias desde o último contato.",
    input_schema: obj(
      {
        etapa: { type: "string", enum: ["todas", ...STAGE_IDS] },
        segmento: { type: "string", description: "Trecho do segmento, ou string vazia." },
        responsavel: { type: "string", description: "Nome do vendedor, ou string vazia." },
        parados_ha_dias: { type: "integer", description: "Mínimo de dias sem contato (0 = ignorar)." },
      },
      ["etapa", "segmento", "responsavel", "parados_ha_dias"],
    ),
    strict: true,
  },
  {
    name: "detalhes_lead",
    description: "Dados completos de um lead: contato, histórico de interações e um score por regras como referência.",
    input_schema: obj({ lead_id: { type: "string" } }, ["lead_id"]),
    strict: true,
  },
  {
    name: "mover_lead",
    description: "Move um lead para outra etapa do funil. A mudança aparece no quadro do usuário. Use só quando o usuário pedir ou concordar.",
    input_schema: obj(
      {
        lead_id: { type: "string" },
        etapa: { type: "string", enum: STAGE_IDS },
        motivo: { type: "string", description: "Por que o lead está mudando de etapa." },
      },
      ["lead_id", "etapa", "motivo"],
    ),
    strict: true,
  },
  {
    name: "registrar_nota",
    description: "Adiciona uma nota ao histórico do lead (ex.: próximo passo combinado). Aparece no quadro do usuário.",
    input_schema: obj({ lead_id: { type: "string" }, texto: { type: "string" } }, ["lead_id", "texto"]),
    strict: true,
  },
];

const stageLabel = (id: StageId) => STAGES.find((s) => s.id === id)?.label ?? id;

function summary(leads: Lead[]) {
  const porEtapa = STAGES.map((s) => {
    const items = leads.filter((l) => l.stage === s.id);
    return { etapa: s.label, quantidade: items.length, valor: items.reduce((a, l) => a + l.value, 0) };
  });
  const abertos = leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido");
  const ganhos = leads.filter((l) => l.stage === "ganho").length;
  const perdidos = leads.filter((l) => l.stage === "perdido").length;
  return {
    porEtapa,
    valorEmAberto: abertos.reduce((a, l) => a + l.value, 0),
    previsaoPonderada: Math.round(abertos.reduce((a, l) => a + l.value * STAGE_PROBABILITY[l.stage], 0)),
    taxaDeGanho: ganhos + perdidos ? Math.round((ganhos / (ganhos + perdidos)) * 100) : null,
  };
}

function compact(l: Lead) {
  return {
    id: l.id,
    empresa: l.company,
    etapa: stageLabel(l.stage),
    valor: l.value,
    segmento: l.segment,
    responsavel: l.owner,
    diasSemContato: daysSince(lastContact(l)),
  };
}

export type ToolOutcome = { result: unknown; action?: AgentAction };

export function runTool(name: string, input: Record<string, unknown>, leads: Lead[]): ToolOutcome {
  const find = (id: unknown) => leads.find((l) => l.id.toLowerCase() === String(id).toLowerCase());

  switch (name) {
    case "resumo_pipeline":
      return { result: summary(leads) };

    case "buscar_leads": {
      const etapa = String(input.etapa ?? "todas");
      const seg = String(input.segmento ?? "").toLowerCase();
      const resp = String(input.responsavel ?? "").toLowerCase();
      const parados = Number(input.parados_ha_dias ?? 0);
      const itens = leads
        .filter((l) => etapa === "todas" || l.stage === etapa)
        .filter((l) => !seg || l.segment.toLowerCase().includes(seg))
        .filter((l) => !resp || l.owner.toLowerCase().includes(resp))
        .filter((l) => !parados || daysSince(lastContact(l)) >= parados)
        .map(compact);
      return { result: { quantidade: itens.length, itens } };
    }

    case "detalhes_lead": {
      const lead = find(input.lead_id);
      if (!lead) throw new Error(`Lead ${input.lead_id} não encontrado.`);
      return { result: { ...lead, etapa: stageLabel(lead.stage), scorePorRegras: heuristicInsight(lead) } };
    }

    case "mover_lead": {
      const lead = find(input.lead_id);
      const stage = String(input.etapa) as StageId;
      if (!lead) throw new Error(`Lead ${input.lead_id} não encontrado.`);
      if (!STAGE_IDS.includes(stage)) throw new Error(`Etapa inválida: ${stage}`);
      if (lead.stage === stage) return { result: { ok: false, motivo: `${lead.company} já está em ${stageLabel(stage)}.` } };
      const de = stageLabel(lead.stage);
      lead.stage = stage; // mantém o estado coerente para as próximas ferramentas desta rodada
      return {
        result: { ok: true, empresa: lead.company, de, para: stageLabel(stage) },
        action: { type: "move", leadId: lead.id, stage },
      };
    }

    case "registrar_nota": {
      const lead = find(input.lead_id);
      const text = String(input.texto ?? "").slice(0, 300);
      if (!lead) throw new Error(`Lead ${input.lead_id} não encontrado.`);
      if (!text) throw new Error("Nota vazia.");
      return { result: { ok: true, empresa: lead.company }, action: { type: "note", leadId: lead.id, text } };
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

// ---------- Modo demonstração: regras simples usando as mesmas ferramentas ----------

export function demoAnswer(question: string, leads: Lead[]) {
  const q = question.toLowerCase();
  const toolCalls: ToolCall[] = [];
  const actions: AgentAction[] = [];
  const call = <T>(name: string, input: Record<string, unknown> = {}) => {
    toolCalls.push({ name, input });
    const out = runTool(name, input, leads);
    if (out.action) actions.push(out.action);
    return out.result as T;
  };
  const byName = leads.find((l) => q.includes(l.company.toLowerCase().split(" ")[0]) || q.includes(l.id.toLowerCase()));

  if (/follow|e-?mail|mensagem|escrev|rascunh/.test(q)) {
    const target = byName ?? [...leads].filter((l) => l.stage === "proposta").sort((a, b) => lastContact(a).localeCompare(lastContact(b)))[0];
    call("detalhes_lead", { lead_id: target.id });
    return { reply: `Rascunho de follow-up para **${target.company}**:\n\n${followUpDraft(target)}`, toolCalls, actions };
  }

  if (/mova|mover|passa|avanç|marcar como|coloca/.test(q) && byName) {
    const stage = STAGES.find((s) => q.includes(s.label.toLowerCase()) || q.includes(s.id))?.id;
    if (stage) {
      const r = call<{ ok: boolean; de?: string; para?: string; motivo?: string }>("mover_lead", { lead_id: byName.id, etapa: stage, motivo: "Pedido do usuário" });
      return { reply: r.ok ? `Pronto: movi **${byName.company}** de ${r.de} para ${r.para}.` : r.motivo ?? "Nada a mudar.", toolCalls, actions };
    }
  }

  if (/parad|esfri|sem contato|abandon|esquec/.test(q)) {
    const r = call<{ itens: ReturnType<typeof compact>[] }>("buscar_leads", { etapa: "todas", segmento: "", responsavel: "", parados_ha_dias: 14 });
    const open = r.itens.filter((i) => i.etapa !== "Ganho" && i.etapa !== "Perdido");
    const list = open.map((i) => `• **${i.empresa}** (${i.etapa}, ${brl(i.valor)}): ${i.diasSemContato} dias sem contato`).join("\n");
    return { reply: open.length ? `Estes negócios abertos estão parados há 14 dias ou mais:\n${list}\n\nQuer que eu rascunhe um follow-up para algum?` : "Nenhum negócio aberto está parado há mais de 14 dias.", toolCalls, actions };
  }

  if (/priorid|foco|focar|quente|hoje|mais chance/.test(q)) {
    const open = leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido");
    const ranked = open.map((l) => ({ l, s: heuristicInsight(l) })).sort((a, b) => b.s.score - a.s.score).slice(0, 3);
    ranked.forEach(({ l }) => toolCalls.push({ name: "detalhes_lead", input: { lead_id: l.id } }));
    const list = ranked.map(({ l, s }, i) => `${i + 1}. **${l.company}** (score ${s.score}, ${brl(l.value)}): ${s.nextAction}`).join("\n");
    return { reply: `Onde eu focaria hoje:\n${list}`, toolCalls, actions };
  }

  const r = call<ReturnType<typeof summary>>("resumo_pipeline");
  const etapas = r.porEtapa.filter((e) => e.quantidade).map((e) => `${e.etapa}: ${e.quantidade} (${brl(e.valor)})`).join(" · ");
  return {
    reply: `Há ${brl(r.valorEmAberto)} em aberto no funil, com previsão ponderada de **${brl(r.previsaoPonderada)}**. ${etapas}.${r.taxaDeGanho !== null ? ` Taxa de ganho: ${r.taxaDeGanho}%.` : ""}\n\nPergunte quem priorizar hoje, quais negócios estão parados, peça um follow-up ou para mover um lead.`,
    toolCalls,
    actions,
  };
}

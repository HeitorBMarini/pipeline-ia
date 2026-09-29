export const STAGES = [
  { id: "novo", label: "Novo" },
  { id: "qualificado", label: "Qualificado" },
  { id: "proposta", label: "Proposta" },
  { id: "negociacao", label: "Negociação" },
  { id: "ganho", label: "Ganho" },
  { id: "perdido", label: "Perdido" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];

/** Probabilidade de fechamento usada na previsão ponderada. */
export const STAGE_PROBABILITY: Record<StageId, number> = {
  novo: 0.1,
  qualificado: 0.25,
  proposta: 0.5,
  negociacao: 0.75,
  ganho: 1,
  perdido: 0,
};

export type InteractionType = "email" | "ligacao" | "reuniao" | "whatsapp" | "nota";

export type Interaction = {
  date: string; // AAAA-MM-DD
  type: InteractionType;
  text: string;
};

export type Lead = {
  id: string;
  company: string;
  contact: string;
  role: string;
  segment: string;
  source: string;
  value: number;
  stage: StageId;
  owner: string;
  interactions: Interaction[];
};

export type Insight = {
  score: number;
  temperature: "quente" | "morno" | "frio";
  summary: string;
  reasons: string[];
  nextAction: string;
};

export type AgentAction =
  | { type: "move"; leadId: string; stage: StageId }
  | { type: "note"; leadId: string; text: string };

export type ToolCall = { name: string; input: Record<string, unknown> };

/** "Hoje" fixo para a demo ficar estável. */
export const TODAY = "2026-09-29";

export function daysSince(date: string, today = TODAY) {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

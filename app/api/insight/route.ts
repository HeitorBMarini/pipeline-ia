import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { heuristicInsight } from "@/lib/crm/heuristics";
import { hasApiKey, rateLimited, sanitizeLeads } from "@/lib/crm/server";
import { TODAY } from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InsightSchema = z.object({
  score: z.number().int().min(0).max(100),
  temperature: z.enum(["quente", "morno", "frio"]),
  summary: z.string(),
  reasons: z.array(z.string()),
  nextAction: z.string(),
});

const SYSTEM = `Você analisa leads de um CRM de demonstração (dados fictícios). Hoje é ${TODAY}.
Avalie a chance de fechamento de 0 a 100 considerando etapa, tempo desde o último contato, sinais de compra, objeções e concorrência.
Responda em português do Brasil:
- summary: 1 ou 2 frases sobre a situação do negócio
- reasons: de 2 a 4 motivos curtos que explicam a nota
- nextAction: uma ação concreta e específica para o vendedor, com base no histórico`;

export async function POST(req: Request) {
  let body: { lead?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* corpo inválido */
  }
  const lead = sanitizeLeads(body.lead ? [body.lead] : null)?.[0];
  if (!lead) return Response.json({ error: "Lead inválido." }, { status: 400 });

  const demo = (reason: string) => Response.json({ insight: heuristicInsight(lead), mode: "demo", reason });
  if (!hasApiKey()) return demo("sem-chave");
  if (rateLimited(req, "insight", 30)) return demo("limite");

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(InsightSchema) },
      messages: [{ role: "user", content: `Lead:\n${JSON.stringify(lead, null, 2)}` }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) return demo("sem-saida");
    return Response.json({ insight: response.parsed_output, mode: "ai" });
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`Insight: erro da API ${error.status}`, error.message);
    else console.error("Insight: erro inesperado", error);
    return demo("erro");
  }
}

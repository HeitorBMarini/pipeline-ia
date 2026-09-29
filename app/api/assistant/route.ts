import Anthropic from "@anthropic-ai/sdk";
import { tools, runTool, demoAnswer } from "@/lib/crm/tools";
import { hasApiKey, rateLimited, sanitizeChat, sanitizeLeads } from "@/lib/crm/server";
import { TODAY, type AgentAction, type ToolCall } from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 6;

const SYSTEM = `Você é o assistente de vendas do Pipeline IA, um CRM de demonstração com empresas e pessoas fictícias. Hoje é ${TODAY}.
Responda em português do Brasil, curto e direto, como um coordenador comercial experiente falando com o time.
Consulte as ferramentas antes de afirmar qualquer número ou fato sobre um lead; nunca invente dados.
Ao priorizar, explique em uma linha por lead o porquê e a próxima ação concreta.
Só use mover_lead ou registrar_nota quando o usuário pedir ou confirmar; depois, diga o que mudou no quadro.
Quando pedirem um follow-up, consulte detalhes_lead e escreva uma mensagem curta, personalizada com o histórico real.
Formate valores em reais. Use **negrito** para nomes de empresas. Se o assunto não for o funil de vendas, diga que é um assistente de demonstração do CRM.`;

function demo(question: string, leads: Parameters<typeof demoAnswer>[1], reason: string) {
  return Response.json({ ...demoAnswer(question, leads), mode: "demo", reason });
}

export async function POST(req: Request) {
  let body: { messages?: unknown; leads?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* corpo inválido */
  }
  const turns = sanitizeChat(body.messages);
  const leads = sanitizeLeads(body.leads);
  if (!turns || !leads) return Response.json({ error: "Requisição inválida." }, { status: 400 });

  const question = turns[turns.length - 1].content;
  if (!hasApiKey()) return demo(question, leads, "sem-chave");
  if (rateLimited(req, "assistant", 15)) return demo(question, leads, "limite");

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const toolCalls: ToolCall[] = [];
  const actions: AgentAction[] = [];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: SYSTEM,
        tools,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return Response.json({ reply: "Não consigo ajudar com isso. Posso falar sobre o funil de vendas.", toolCalls, actions, mode: "ai" });
      }

      const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || uses.length === 0 || round === MAX_TOOL_ROUNDS) {
        const reply = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return Response.json({ reply: reply || "Não encontrei uma resposta para isso.", toolCalls, actions, mode: "ai" });
      }

      // Conteúdo completo de volta (inclui thinking) e todos os resultados numa única mensagem.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
        const input = (u.input ?? {}) as Record<string, unknown>;
        toolCalls.push({ name: u.name, input });
        try {
          const out = runTool(u.name, input, leads);
          if (out.action) actions.push(out.action);
          return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out.result) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: u.id, content: String(e), is_error: true };
        }
      });
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return demo(question, leads, "limite-api");
    if (error instanceof Anthropic.AuthenticationError) return demo(question, leads, "chave-invalida");
    if (error instanceof Anthropic.APIError) {
      console.error(`Assistente: erro da API ${error.status}`, error.message);
      return demo(question, leads, "erro-api");
    }
    console.error("Assistente: erro inesperado", error);
    return demo(question, leads, "erro");
  }

  return demo(question, leads, "sem-resposta");
}

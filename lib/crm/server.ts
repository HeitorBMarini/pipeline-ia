import { STAGE_IDS, type Interaction, type Lead, type StageId } from "./types";

const TYPES = ["email", "ligacao", "reuniao", "whatsapp", "nota"] as const;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** O estado do quadro vem do navegador: valida e limita antes de usar. */
export function sanitizeLeads(raw: unknown): Lead[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) return null;
  const leads: Lead[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const l = r as Record<string, unknown>;
    if (!STAGE_IDS.includes(l.stage as StageId) || typeof l.id !== "string") return null;
    const interactions: Interaction[] = (Array.isArray(l.interactions) ? l.interactions : [])
      .slice(-20)
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => ({
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(i.date)) ? String(i.date) : "2026-09-29",
        type: (TYPES as readonly string[]).includes(String(i.type)) ? (i.type as Interaction["type"]) : "nota",
        text: str(i.text, 400),
      }));
    leads.push({
      id: str(l.id, 20),
      company: str(l.company, 80),
      contact: str(l.contact, 80),
      role: str(l.role, 80),
      segment: str(l.segment, 40),
      source: str(l.source, 40),
      value: Math.max(0, Math.min(10_000_000, Number(l.value) || 0)),
      stage: l.stage as StageId,
      owner: str(l.owner, 40),
      interactions,
    });
  }
  return leads;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function sanitizeChat(raw: unknown, maxTurns = 12, maxChars = 1000): ChatTurn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns = raw
    .filter(
      (m): m is ChatTurn =>
        !!m && typeof m === "object" && ((m as ChatTurn).role === "user" || (m as ChatTurn).role === "assistant") &&
        typeof (m as ChatTurn).content === "string" && (m as ChatTurn).content.trim().length > 0,
    )
    .slice(-maxTurns)
    .map((m) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns.length && turns[turns.length - 1].role === "user" ? turns : null;
}

// Limite simples por IP e por instância, para uma demo pública.
const hits = new Map<string, number[]>();

export function rateLimited(req: Request, bucket: string, max: number, windowMs = 10 * 60 * 1000) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

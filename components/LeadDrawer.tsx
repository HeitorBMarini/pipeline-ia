"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle, Phone, StickyNote, Users, X, Sparkles, Loader2, PenLine } from "lucide-react";
import { STAGES, brl, type Insight, type InteractionType, type Lead, type StageId } from "@/lib/crm/types";

const ICONS: Record<InteractionType, typeof Mail> = {
  email: Mail,
  ligacao: Phone,
  reuniao: Users,
  whatsapp: MessageCircle,
  nota: StickyNote,
};

const TEMP_STYLE = {
  quente: "text-hot",
  morno: "text-warm",
  frio: "text-cold",
} as const;

type Props = {
  lead: Lead | null;
  onClose: () => void;
  onMove: (id: string, stage: StageId) => void;
  onNote: (id: string, text: string) => void;
  onAskAssistant: (prompt: string) => void;
};

export function LeadDrawer({ lead, onClose, onMove, onNote, onAskAssistant }: Props) {
  const [insight, setInsight] = useState<{ data: Insight; mode: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setInsight(null);
    setError(false);
    setNote("");
  }, [lead?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!lead) return null;

  const analyze = async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead }),
      });
      const data = await r.json();
      if (!r.ok || !data.insight) throw new Error();
      setInsight({ data: data.insight, mode: data.mode });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const history = [...lead.interactions].reverse();

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${lead.company}`}
        className="rise fixed inset-y-0 right-0 z-40 w-full sm:w-[440px] bg-panel border-l border-line flex flex-col"
      >
        <header className="p-5 border-b border-line">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-faint font-mono">{lead.id}</p>
              <h2 className="text-lg font-semibold leading-tight mt-0.5">{lead.company}</h2>
              <p className="text-sm text-muted mt-1">
                {lead.contact} · {lead.role}
              </p>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 grid place-items-center rounded-lg hover:bg-panel-2 text-muted cursor-pointer">
              <X size={16} />
            </button>
          </div>
          <dl className="grid grid-cols-3 gap-2 mt-4 text-xs">
            <div>
              <dt className="text-faint">Valor</dt>
              <dd className="font-semibold text-sm tabular-nums">{brl(lead.value)}</dd>
            </div>
            <div>
              <dt className="text-faint">Origem</dt>
              <dd className="font-medium text-sm">{lead.source}</dd>
            </div>
            <div>
              <dt className="text-faint">Responsável</dt>
              <dd className="font-medium text-sm">{lead.owner}</dd>
            </div>
          </dl>
          <label className="block mt-4 text-xs text-faint">
            Etapa
            <select
              value={lead.stage}
              onChange={(e) => onMove(lead.id, e.target.value as StageId)}
              className="mt-1 w-full h-9 px-2.5 rounded-lg border border-line bg-panel-2 text-sm text-fg"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin p-5 space-y-6">
          {/* Análise por IA */}
          <section className="rounded-xl border border-line bg-panel-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                <Sparkles size={14} className="text-accent" /> Análise do lead
              </h3>
              <button
                onClick={analyze}
                disabled={loading}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-accent-fg text-xs font-semibold disabled:opacity-60 cursor-pointer"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {insight ? "Analisar de novo" : "Analisar com IA"}
              </button>
            </div>

            {!insight && !loading && !error && (
              <p className="text-xs text-muted mt-2">Nota de 0 a 100, motivos e a próxima ação recomendada, a partir do histórico.</p>
            )}
            {error && <p className="text-xs text-hot mt-2">Não foi possível analisar agora. Tente de novo.</p>}

            {insight && (
              <div className="rise mt-4">
                <div className="flex items-center gap-4">
                  <ScoreRing score={insight.data.score} />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold capitalize ${TEMP_STYLE[insight.data.temperature]}`}>{insight.data.temperature}</p>
                    <p className="text-sm text-muted leading-snug mt-0.5">{insight.data.summary}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1">
                  {insight.data.reasons.map((r) => (
                    <li key={r} className="text-xs text-muted flex gap-2">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-faint shrink-0" /> {r}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-lg bg-accent-soft px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Próxima ação</p>
                  <p className="text-sm mt-0.5">{insight.data.nextAction}</p>
                </div>
                {insight.mode === "demo" && (
                  <p className="text-[11px] text-faint mt-2">Modo demonstração: nota calculada por regras, sem chamar o modelo.</p>
                )}
              </div>
            )}

            <button
              onClick={() => onAskAssistant(`Escreva um follow-up para ${lead.company} (${lead.id}) com base no histórico.`)}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-line text-sm hover:border-accent/60 cursor-pointer"
            >
              <PenLine size={14} /> Rascunhar follow-up com o assistente
            </button>
          </section>

          {/* Nova nota */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              onNote(lead.id, note.trim());
              setNote("");
            }}
            className="flex gap-2"
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Registrar uma nota…"
              aria-label="Nova nota"
              className="flex-1 h-9 px-3 rounded-lg border border-line bg-panel-2 text-sm placeholder:text-faint"
            />
            <button className="h-9 px-3 rounded-lg border border-line text-sm font-medium hover:border-accent/60 cursor-pointer">Salvar</button>
          </form>

          {/* Histórico */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint mb-3">Histórico</h3>
            <ol className="relative border-l border-line ml-2 space-y-4">
              {history.map((i, idx) => {
                const Icon = ICONS[i.type];
                return (
                  <li key={`${i.date}-${idx}`} className="pl-5 relative">
                    <span className="absolute -left-[11px] top-0 w-[22px] h-[22px] rounded-full bg-panel border border-line grid place-items-center text-muted">
                      <Icon size={11} />
                    </span>
                    <p className="text-[11px] text-faint font-mono">{i.date.split("-").reverse().join("/")}</p>
                    <p className="text-sm leading-snug mt-0.5">{i.text}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </aside>
    </>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--hot)" : score >= 40 ? "var(--warm)" : "var(--cold)";
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label={`Score ${score} de 100`} className="shrink-0">
      <circle cx="30" cy="30" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="35" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--fg)">
        {score}
      </text>
    </svg>
  );
}

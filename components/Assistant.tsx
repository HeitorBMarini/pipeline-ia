"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, Wrench, X } from "lucide-react";
import type { AgentAction, Lead, ToolCall } from "@/lib/crm/types";

type Msg = { role: "user" | "assistant"; content: string; toolCalls?: ToolCall[]; actions?: AgentAction[]; mode?: string };

const SUGGESTIONS = [
  "Em quais negócios devo focar hoje?",
  "Quais negócios estão parados?",
  "Qual é a previsão de vendas do funil?",
  "Mova a Distribuidora Norte Sul para Ganho",
];

type Props = {
  open: boolean;
  onClose: () => void;
  leads: Lead[];
  onActions: (actions: AgentAction[]) => void;
  pendingPrompt: string | null;
  onPromptConsumed: () => void;
};

// Negrito simples (**texto**) sem injetar HTML.
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function describe(input: Record<string, unknown>) {
  const parts = Object.entries(input)
    .filter(([, v]) => v !== "" && v !== 0 && v !== "todas")
    .map(([k, v]) => `${k}: ${String(v).length > 24 ? String(v).slice(0, 24) + "…" : v}`);
  return `(${parts.join(", ")})`;
}

export function Assistant({ open, onClose, leads, onActions, pendingPrompt, onPromptConsumed }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...messages, { role: "user" as const, content: q }];
    setMessages(history);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), leads }),
      });
      const data = await r.json();
      if (!r.ok || !data.reply) throw new Error();
      if (data.actions?.length) onActions(data.actions);
      setMessages((m) => [...m, { role: "assistant", content: data.reply, toolCalls: data.toolCalls, actions: data.actions, mode: data.mode }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Não consegui falar com o assistente agora. Tente de novo em instantes." }]);
    } finally {
      setBusy(false);
    }
  };

  // Pedido vindo de fora (ex.: "rascunhar follow-up" na gaveta do lead).
  useEffect(() => {
    if (open && pendingPrompt && !busy) {
      onPromptConsumed();
      ask(pendingPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingPrompt]);

  // Fica montado quando fechado para não perder a conversa.
  return (
    <div hidden={!open}>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Assistente de vendas"
        className="rise fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-panel border-l border-line flex flex-col"
      >
        <header className="h-14 px-4 border-b border-line flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-accent-fg grid place-items-center">
            <Sparkles size={15} />
          </div>
          <div className="leading-tight">
            <p className="font-semibold text-sm">Assistente de vendas</p>
            <p className="text-[11px] text-faint">Consulta e atualiza o funil</p>
          </div>
          <button onClick={onClose} aria-label="Fechar assistente" className="ml-auto w-8 h-8 grid place-items-center rounded-lg hover:bg-panel-2 text-muted cursor-pointer">
            <X size={16} />
          </button>
        </header>

        <div ref={bodyRef} aria-live="polite" className="flex-1 overflow-y-auto scroll-thin p-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">
                Pergunte sobre o funil. O assistente escolhe quais ferramentas usar (buscar leads, ver o histórico, mover
                cards, registrar notas) e as mudanças aparecem no quadro. Tudo aqui é fictício.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="text-left text-xs px-3 py-2 rounded-full border border-line hover:border-accent hover:text-accent transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="rise ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent text-accent-fg px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div key={i} className="rise max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-panel-2 px-3.5 py-3 text-sm">
                {!!m.toolCalls?.length && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {m.toolCalls.map((t, j) => (
                      <span key={j} className="inline-flex items-center gap-1 font-mono text-[10.5px] px-2 py-0.5 rounded-md bg-accent-soft text-accent">
                        <Wrench size={10} />
                        {t.name}
                        {describe(t.input)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed">
                  <Rich text={m.content} />
                </div>
                {!!m.actions?.length && (
                  <p className="text-[11px] text-ok mt-2 font-medium">
                    ✓ {m.actions.length} alteraç{m.actions.length === 1 ? "ão aplicada" : "ões aplicadas"} no quadro
                  </p>
                )}
                {m.mode === "demo" && (
                  <p className="text-[11px] text-faint mt-2">Modo demonstração: resposta por regras, sem chamar o modelo.</p>
                )}
              </div>
            ),
          )}

          {busy && (
            <div className="flex gap-1 px-3.5 py-3 w-fit rounded-2xl border border-line bg-panel-2" aria-label="Assistente pensando">
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-faint animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="p-3 border-t border-line flex gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="Pergunte sobre o funil…"
            aria-label="Mensagem para o assistente"
            className="flex-1 h-10 px-3.5 rounded-xl border border-line bg-panel-2 text-sm placeholder:text-faint"
          />
          <button
            disabled={busy || !input.trim()}
            aria-label="Enviar"
            className="w-10 h-10 grid place-items-center rounded-xl bg-accent text-accent-fg disabled:opacity-50 cursor-pointer"
          >
            <ArrowUp size={16} />
          </button>
        </form>
      </aside>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Moon, RotateCcw, Sparkles, Sun } from "lucide-react";
import { initialLeads } from "@/lib/crm/data";
import { lastContact } from "@/lib/crm/heuristics";
import { STAGE_PROBABILITY, TODAY, brl, daysSince, type AgentAction, type Lead, type StageId } from "@/lib/crm/types";
import { Board } from "./Board";
import { LeadDrawer } from "./LeadDrawer";
import { Assistant } from "./Assistant";

const STORAGE_KEY = "pipeline-ia-leads-v1";

export function CrmApp() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<Record<string, number>>({});
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Carrega o quadro salvo neste navegador, se existir.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Lead[];
        if (Array.isArray(parsed) && parsed.length) setLeads(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    } catch {}
  }, [leads]);

  const flash = useCallback((id: string) => {
    setFlashIds((f) => ({ ...f, [id]: Date.now() }));
  }, []);

  const moveLead = useCallback((id: string, stage: StageId) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
  }, []);

  const addNote = useCallback((id: string, text: string) => {
    setLeads((ls) =>
      ls.map((l) => (l.id === id ? { ...l, interactions: [...l.interactions, { date: TODAY, type: "nota", text }] } : l)),
    );
  }, []);

  const applyActions = useCallback(
    (actions: AgentAction[]) => {
      for (const a of actions) {
        if (a.type === "move") moveLead(a.leadId, a.stage);
        if (a.type === "note") addNote(a.leadId, a.text);
        flash(a.leadId);
      }
    },
    [moveLead, addNote, flash],
  );

  const reset = () => {
    setLeads(initialLeads);
    setSelectedId(null);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pipeline-theme", next);
    } catch {}
    setTheme(next);
  };

  const metrics = useMemo(() => {
    const open = leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido");
    const won = leads.filter((l) => l.stage === "ganho").length;
    const lost = leads.filter((l) => l.stage === "perdido").length;
    return [
      { label: "Em aberto", value: brl(open.reduce((a, l) => a + l.value, 0)), hint: `${open.length} negócios` },
      {
        label: "Previsão ponderada",
        value: brl(Math.round(open.reduce((a, l) => a + l.value * STAGE_PROBABILITY[l.stage], 0))),
        hint: "valor × chance da etapa",
      },
      { label: "Taxa de ganho", value: won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : "–", hint: `${won} ganhos · ${lost} perdidos` },
      {
        label: "Parados +14 dias",
        value: String(open.filter((l) => daysSince(lastContact(l)) >= 14).length),
        hint: "precisam de follow-up",
      },
    ];
  }, [leads]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-panel/90 backdrop-blur border-b border-line">
        <div className="px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-accent-fg grid place-items-center font-bold text-sm">P</div>
          <div className="leading-tight">
            <p className="font-semibold text-[15px]">Pipeline IA</p>
            <p className="text-[11px] text-faint hidden sm:block">CRM de demonstração · dados fictícios</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={reset}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line text-sm text-muted hover:text-fg transition-colors cursor-pointer"
            >
              <RotateCcw size={14} /> Restaurar dados
            </button>
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
              className="w-9 h-9 grid place-items-center rounded-lg border border-line text-muted hover:text-fg transition-colors cursor-pointer"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={() => setAssistantOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-accent text-accent-fg text-sm font-semibold hover:brightness-110 transition cursor-pointer"
            >
              <Sparkles size={15} /> Assistente IA
            </button>
          </div>
        </div>
      </header>

      <section className="px-4 sm:px-6 pt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-line bg-panel px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{m.label}</p>
            <p className="text-xl font-semibold mt-1 tabular-nums">{m.value}</p>
            <p className="text-xs text-muted mt-0.5">{m.hint}</p>
          </div>
        ))}
      </section>

      <Board leads={leads} flashIds={flashIds} onMove={moveLead} onOpen={setSelectedId} />

      <LeadDrawer
        lead={selected}
        onClose={() => setSelectedId(null)}
        onMove={moveLead}
        onNote={addNote}
        onAskAssistant={(prompt) => {
          setPendingPrompt(prompt);
          setAssistantOpen(true);
        }}
      />

      <Assistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        leads={leads}
        onActions={applyActions}
        pendingPrompt={pendingPrompt}
        onPromptConsumed={() => setPendingPrompt(null)}
      />
    </div>
  );
}

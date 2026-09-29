"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { heuristicInsight, lastContact } from "@/lib/crm/heuristics";
import { STAGES, brl, daysSince, type Lead, type StageId } from "@/lib/crm/types";

const TEMP_COLOR = { quente: "bg-hot", morno: "bg-warm", frio: "bg-cold" } as const;

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Props = {
  leads: Lead[];
  flashIds: Record<string, number>;
  onMove: (id: string, stage: StageId) => void;
  onOpen: (id: string) => void;
};

export function Board({ leads, flashIds, onMove, onOpen }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);

  return (
    <main className="flex-1 px-4 sm:px-6 py-5 overflow-x-auto scroll-thin">
      <div className="grid grid-flow-col auto-cols-[minmax(250px,1fr)] xl:auto-cols-[minmax(205px,1fr)] gap-3 min-w-max xl:min-w-0">
        {STAGES.map((stage) => {
          const items = leads.filter((l) => l.stage === stage.id);
          const total = items.reduce((a, l) => a + l.value, 0);
          const isOver = overStage === stage.id;
          return (
            <section
              key={stage.id}
              aria-label={`Etapa ${stage.label}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                if (id) onMove(id, stage.id);
                setDragId(null);
                setOverStage(null);
              }}
              className={`rounded-xl border p-2.5 flex flex-col gap-2 min-h-[320px] transition-colors ${
                isOver ? "border-accent bg-accent-soft/60" : "border-line bg-panel-2"
              }`}
            >
              <header className="flex items-baseline justify-between px-1.5 pt-1 pb-1.5">
                <h2 className="text-sm font-semibold">
                  {stage.label} <span className="text-faint font-normal ml-1">{items.length}</span>
                </h2>
                <span className="text-xs text-muted tabular-nums">{brl(total)}</span>
              </header>

              {items.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  flashKey={flashIds[lead.id]}
                  dragging={dragId === lead.id}
                  onOpen={() => onOpen(lead.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", lead.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(lead.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                />
              ))}

              {items.length === 0 && (
                <p className="text-xs text-faint text-center py-6 border border-dashed border-line rounded-lg">
                  Arraste um card para cá
                </p>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function LeadCard({
  lead,
  flashKey,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  flashKey?: number;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const insight = heuristicInsight(lead);
  const idle = daysSince(lastContact(lead));
  const closed = lead.stage === "ganho" || lead.stage === "perdido";

  return (
    <button
      // A key muda a cada ação do assistente e reinicia a animação de destaque.
      key={flashKey}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`text-left rounded-lg border border-line bg-panel p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-accent/50 transition cursor-grab active:cursor-grabbing ${
        dragging ? "opacity-40" : ""
      } ${flashKey ? "flash" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm leading-snug">{lead.company}</p>
        {!closed && (
          <span
            title={`Score ${insight.score} · ${insight.temperature}`}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-muted"
          >
            <span className={`w-2 h-2 rounded-full ${TEMP_COLOR[insight.temperature]}`} />
            {insight.score}
          </span>
        )}
      </div>
      <p className="text-xs text-muted mt-0.5">
        {lead.contact} · {lead.segment}
      </p>
      <div className="flex items-center justify-between mt-3">
        <span className="text-sm font-semibold tabular-nums">{brl(lead.value)}</span>
        <div className="flex items-center gap-2">
          {!closed && idle >= 14 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-hot">
              <Clock size={11} /> {idle}d
            </span>
          )}
          <span
            title={`Responsável: ${lead.owner}`}
            className="w-6 h-6 rounded-full bg-accent-soft text-accent text-[10px] font-bold grid place-items-center"
          >
            {initials(lead.owner)}
          </span>
        </div>
      </div>
    </button>
  );
}

# Pipeline IA

CRM de vendas com **funil kanban** e **IA aplicada ao processo comercial**. Todas as empresas, pessoas e conversas são fictícias.

**Demo:** https://pipeline-ia-xi.vercel.app (roda em modo demonstração; veja abaixo)

## O que dá para fazer

- **Funil kanban** com 6 etapas: arrastar e soltar cards, métricas de valor em aberto, previsão ponderada, taxa de ganho e negócios parados.
- **Análise do lead com IA**: nota de 0 a 100, temperatura (quente, morno, frio), motivos e a próxima ação recomendada, gerados a partir do histórico. A resposta usa **saída estruturada** (JSON validado com Zod).
- **Assistente de vendas**: um agente que responde perguntas sobre o funil e **age no quadro**. Ele move cards entre etapas e registra notas, e cada mudança aparece destacada no kanban. A interface mostra quais ferramentas o agente chamou.
- **Follow-ups personalizados** escritos a partir do histórico real do lead.

## Ferramentas do agente

| Ferramenta | O que faz |
|---|---|
| `resumo_pipeline` | Quantidade e valor por etapa, previsão ponderada, taxa de ganho |
| `buscar_leads` | Filtra por etapa, segmento, responsável e dias sem contato |
| `detalhes_lead` | Contato, histórico de interações e score de referência |
| `mover_lead` | Move o lead de etapa (aplicado no quadro do usuário) |
| `registrar_nota` | Adiciona uma nota ao histórico (aplicada no quadro) |

O estado do quadro vive no navegador e vai junto em cada pergunta. O servidor valida esses dados, executa as ferramentas e devolve as ações para a interface aplicar.

## Modo demonstração

Sem `ANTHROPIC_API_KEY`, a análise e o assistente funcionam por regras, usando as mesmas ferramentas, e as respostas vêm marcadas como "Modo demonstração". O mesmo acontece se o limite de uso for atingido ou a API falhar.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Claude API (tool use + structured outputs) · Zod

## Rodando

```bash
npm install
npm run dev
```

Acesse http://localhost:3000. Para usar o Claude, copie `.env.example` para `.env.local` e preencha a chave.

## Estrutura

```
app/api/assistant/route.ts   # loop do agente com ferramentas
app/api/insight/route.ts     # análise do lead com saída estruturada
lib/crm/tools.ts             # ferramentas + modo demonstração
lib/crm/heuristics.ts        # score por regras e rascunho de follow-up
lib/crm/server.ts            # validação do estado vindo do navegador e limite de uso
lib/crm/data.ts              # leads fictícios
components/                  # quadro, gaveta do lead e assistente
```

# PSA Farmer Dashboard

Dashboard de acompanhamento da operação dos farmers, alimentado por dados do HubSpot (Funil de Vendas B2B + pipeline de tickets CS).

## Status do projeto

🚧 Em desenvolvimento inicial — estrutura base.

## Métricas planejadas

**Cards do topo (visão geral):**
- Demandas — negócios com Data de Qualificação preenchida e SDR/Farmer atribuído
- Ganhos — negócios nas etapas "Negócio Fechado" ou "Ganho/Contrato Assinado"
- Sem Ganhos — farmers sem nenhum ganho no período
- Em Aberto — qualificados que ainda não estão em estado final (Perdido / Negócio Fechado / Ganho)
- Receita Total — soma do valor dos ganhos (toggle Líquido/Bruto)

**Por farmer:**
- Perdidos
- Taxa de Conversão (ganhos ÷ qualificados)
- Tram CS (tickets do farmer na pipeline CS)
- Receita

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- HubSpot CRM API v3

## Setup local

```bash
# 1. Clone
git clone https://github.com/mattheusdosantosss/psa-farmer.git
cd psa-farmer

# 2. Instale as dependências
npm install

# 3. Configure as variáveis
cp .env.example .env.local
# edite .env.local com os valores reais

# 4. Rode em dev
npm run dev
```

Abra http://localhost:3000

## Variáveis de ambiente

Veja `.env.example` para a lista completa. Os principais são:

- `HUBSPOT_TOKEN` — token da Private App do HubSpot (escopos: `crm.objects.deals.read`, `crm.objects.tickets.read`, `crm.objects.owners.read`)
- `HUBSPOT_STAGE_*` — IDs dos estágios do Funil de Vendas B2B
- `DASHBOARD_ACCESS_KEY` — chave simples de proteção da URL

## Segurança

- ⚠️ **Nunca** commite `.env`, `.env.local` ou qualquer arquivo com token real
- O `.gitignore` já bloqueia esses arquivos, mas confira antes de cada commit
- Em caso de vazamento de token: **rotacione imediatamente** no HubSpot

import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllOwners,
  fetchCsTickets,
  fetchDealsByQualification,
  fetchDealsByClose,
  fetchDealsLifetimeByQualification,
  getCsStages,
} from "@/lib/hubspot";
import { aggregate, RevenueMode } from "@/lib/aggregate";
import { ALL_FARMER_EMAILS, resolveFarmers } from "@/lib/teams";
import { getAllStartDates } from "@/lib/farmer-dates-store";
import { getAllOverrides } from "@/lib/farmer-overrides-store";
import { getAllAssignments, getAllTags } from "@/lib/farmer-tags-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;
const PIPELINE_CS_ATIVO = !!process.env.HUBSPOT_PIPELINE_CS;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  if (ACCESS_KEY) {
    const key = url.searchParams.get("key");
    if (key !== ACCESS_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const modeRaw = url.searchParams.get("mode");
  const revenueMode: RevenueMode = modeRaw === "liquido" ? "liquido" : "bruto";

  try {
    // 1) Owners + overrides — precisamos dos dois pra montar a lista final
    const [owners, overrides] = await Promise.all([
      fetchAllOwners(),
      getAllOverrides(),
    ]);

    // Resolve a lista de farmers do dashboard (base + overrides). Calcula
    // foundEmails ANTES de filtrar ocultos: ocultar é uma decisão da Pri
    // sobre quem aparece no dashboard, não muda o fato de o e-mail existir
    // no HubSpot. Calcular depois do filtro geraria alarme falso de
    // "e-mail não encontrado" pra cada farmer ocultado.
    const resolvedAll = resolveFarmers(owners, overrides);
    const foundEmails = new Set(resolvedAll.map((f) => f.email));
    const missingEmails = Array.from(ALL_FARMER_EMAILS).filter(
      (e) => !foundEmails.has(e)
    );

    // Agora sim filtra ocultos — esses não pesam nas chamadas seguintes
    // nem aparecem em qualquer agregação.
    const resolved = resolvedAll.filter((f) => !f.hidden);
    const allowedOwnerIds = new Set(resolved.map((f) => f.ownerId));

    // Map ownerId → squadId resolvido (vence override sobre teams.ts)
    const squadByOwnerId = new Map(resolved.map((f) => [f.ownerId, f.squadId]));

    // 2) Deals em DOIS recortes temporais:
    //    a) Qualificados no período → alimenta Demandas e Em aberto
    //    b) Fechados no período (ganhos/perdidos) → alimenta Ganhos, Perdidos, Receita
    //    Sequencial pra evitar rate limit 429 quando há muitas páginas.
    const dealsQualificados = await fetchDealsByQualification({
      from,
      to,
      ownerIds: Array.from(allowedOwnerIds),
    });
    const dealsFechados = await fetchDealsByClose({
      from,
      to,
      ownerIds: Array.from(allowedOwnerIds),
    });

    const tickets = PIPELINE_CS_ATIVO
      ? await fetchCsTickets({
          ownerIds: Array.from(allowedOwnerIds),
          from,
          to,
        })
      : [];

    const csStages = PIPELINE_CS_ATIVO
      ? await getCsStages()
      : { abertos: [], concluidos: [], cancelados: [] };

    // Datas de início + tags em paralelo (todos do Vercel KV).
    // Se KV indisponível, cada uma retorna vazio e o dashboard degrada
    // com elegância (sem coluna Tempo, sem chips de tag).
    const [startDates, tagVocabulary, tagAssignments] = await Promise.all([
      getAllStartDates(),
      getAllTags(),
      getAllAssignments(),
    ]);

    // Tx Conversão HISTÓRICA: busca deals desde a startDate mais antiga
    // entre os farmers permitidos. Filtramos cliente-side por farmer
    // depois (no aggregate), aplicando a startDate individual.
    //
    // Se NENHUM farmer tem startDate definida, pulamos a busca: a tx
    // conversão fica em 0 pra todos, conforme pré-requisito.
    //
    // Cache de 5min no fetchDealsLifetimeByQualification evita re-busca
    // quando o usuário troca de filtro de período rapidamente.
    let dealsLifetime: typeof dealsQualificados | undefined;
    const allowedStartDates = Array.from(allowedOwnerIds)
      .map((id) => startDates.get(id))
      .filter((d): d is string => !!d);

    if (allowedStartDates.length > 0) {
      const fromMin = allowedStartDates.sort()[0]; // ISO YYYY-MM-DD ordena lexicograficamente
      dealsLifetime = await fetchDealsLifetimeByQualification({
        fromMin,
        ownerIds: Array.from(allowedOwnerIds),
      });
    }

    const data = aggregate({
      dealsQualificados,
      dealsFechados,
      dealsLifetime,
      tickets,
      owners,
      allowedOwnerIds,
      missingEmails,
      revenueMode,
      pipelineCsAtivo: PIPELINE_CS_ATIVO,
      csStages,
      startDates,
      squadByOwnerId,
      tagAssignments,
      tagVocabulary,
    });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
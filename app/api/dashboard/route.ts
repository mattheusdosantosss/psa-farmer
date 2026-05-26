import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllOwners,
  fetchCsTickets,
  fetchDealsForDashboard,
  getCsStages,
} from "@/lib/hubspot";
import { aggregate, RevenueMode } from "@/lib/aggregate";
import { ALL_FARMER_EMAILS, resolveFarmers } from "@/lib/teams";
import { getAllStartDates } from "@/lib/farmer-dates-store";
import { getAllOverrides } from "@/lib/farmer-overrides-store";

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

    // Resolve a lista de farmers do dashboard (base + overrides),
    // descartando os ocultos pra eles não pesarem nas chamadas seguintes
    // nem aparecerem em qualquer agregação.
    const resolved = resolveFarmers(owners, overrides).filter((f) => !f.hidden);
    const allowedOwnerIds = new Set(resolved.map((f) => f.ownerId));

    // Map ownerId → squadId resolvido (vence override sobre teams.ts)
    const squadByOwnerId = new Map(resolved.map((f) => [f.ownerId, f.squadId]));

    // E-mails da base (teams.ts) que NÃO foram encontrados no HubSpot.
    // Filtra ocultos da contagem pra não soar alarme falso.
    const foundEmails = new Set(resolved.map((f) => f.email));
    const missingEmails = Array.from(ALL_FARMER_EMAILS).filter(
      (e) => !foundEmails.has(e)
    );

    // 2) Deals (sequencial, depois tickets — evita estourar rate limit do
    //    HubSpot quando muitas páginas precisam ser paginadas em paralelo)
    const deals = await fetchDealsForDashboard({
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

    // Datas de início dos farmers (do Vercel KV). Se KV indisponível,
    // getAllStartDates retorna Map vazio e o dashboard segue sem a
    // coluna "Tempo" — degrada com elegância.
    const startDates = await getAllStartDates();

    const data = aggregate({
      deals,
      tickets,
      owners,
      allowedOwnerIds,
      missingEmails,
      revenueMode,
      pipelineCsAtivo: PIPELINE_CS_ATIVO,
      csStages,
      startDates,
      squadByOwnerId,
    });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
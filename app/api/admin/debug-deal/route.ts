// Endpoint de diagnóstico — busca um deal por ID e retorna TODAS as
// propriedades cruas do HubSpot. Pra verificar se o campo
// valor_total_do_contrato__bruto____ganho_ está chegando ou não.
//
// Uso: /api/admin/debug-deal?key=XXX&id=59815002041

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;
const HUBSPOT_API = "https://api.hubapi.com";
const TOKEN = process.env.HUBSPOT_TOKEN;

const PROPS_QUE_QUEREMOS = [
  "dealname",
  "amount",
  "amount_in_home_currency",
  "dealstage",
  "pipeline",
  "createdate",
  "closedate",
  "sdrfarmer_responsavel",
  "pipedrive___data_de_qualificacao",
  "origem_do_lead",
  "valor_total_do_contrato__bruto___ganho_",
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  if (ACCESS_KEY) {
    const key = url.searchParams.get("key");
    if (key !== ACCESS_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const dealId = url.searchParams.get("id");
  if (!dealId) {
    return NextResponse.json({ error: "param 'id' obrigatório" }, { status: 400 });
  }

  try {
    // Busca com propriedades específicas (igual o dashboard faz)
    const propsParam = PROPS_QUE_QUEREMOS.join(",");
    const urlComProps = `${HUBSPOT_API}/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${encodeURIComponent(propsParam)}`;

    const resComProps = await fetch(urlComProps, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!resComProps.ok) {
      const errText = await resComProps.text();
      return NextResponse.json(
        { error: `HubSpot ${resComProps.status}: ${errText}` },
        { status: resComProps.status }
      );
    }

    const dealComProps = await resComProps.json();

    // Busca também SEM filtro de propriedades pra ver TUDO que o HubSpot
    // entrega (pode revelar nome interno diferente)
    const urlSemProps = `${HUBSPOT_API}/crm/v3/objects/deals/${encodeURIComponent(dealId)}`;
    const resSemProps = await fetch(urlSemProps, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const dealSemProps = resSemProps.ok ? await resSemProps.json() : null;

    return NextResponse.json({
      dealId,
      propsSolicitadas: PROPS_QUE_QUEREMOS,
      campoBrutoEsperado: "valor_total_do_contrato__bruto___ganho_",
      valorBrutoRecebido:
        dealComProps.properties?.valor_total_do_contrato__bruto___ganho_ ?? "UNDEFINED",
      respostaComPropsFiltradas: dealComProps,
      respostaSemFiltroPropsCompleta: dealSemProps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

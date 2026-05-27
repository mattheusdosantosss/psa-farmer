// Endpoint de diagnóstico — lista propriedades de deal filtrando por
// substring no name ou label. Pra descobrir o nome interno exato do
// campo "Valor total do contrato (Bruto)" sem chance de erro de leitura.
//
// Uso: /api/admin/debug-props?key=XXX&q=bruto
//      /api/admin/debug-props?key=XXX&q=valor
//      /api/admin/debug-props?key=XXX            (lista todas)

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;
const HUBSPOT_API = "https://api.hubapi.com";
const TOKEN = process.env.HUBSPOT_TOKEN;

type HubSpotProperty = {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName?: string;
  description?: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  if (ACCESS_KEY) {
    const key = url.searchParams.get("key");
    if (key !== ACCESS_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const q = (url.searchParams.get("q") || "").toLowerCase().trim();

  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/properties/deals`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `HubSpot ${res.status}: ${errText}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { results: HubSpotProperty[] };

    const filtered = q
      ? data.results.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q)
        )
      : data.results;

    return NextResponse.json({
      query: q || "(sem filtro)",
      total: filtered.length,
      properties: filtered.map((p) => ({
        name: p.name,
        label: p.label,
        type: p.type,
        fieldType: p.fieldType,
        groupName: p.groupName,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Endpoint de diagnóstico — retorna as demandas do período em CSV
// pra cruzar com o export do HubSpot e identificar quais deals estão
// num lado e não no outro.
//
// Uso: abrir no navegador, salvar como .csv, comparar com export do
// HubSpot pelo Record ID.

import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllOwners,
  fetchDealsByQualification,
} from "@/lib/hubspot";
import { resolveFarmers } from "@/lib/teams";
import { getAllOverrides } from "@/lib/farmer-overrides-store";
import { computePeriod, type PeriodPreset } from "@/lib/periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;

function csvEscape(value: string | undefined | null): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  if (ACCESS_KEY) {
    const key = url.searchParams.get("key");
    if (key !== ACCESS_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const preset = (url.searchParams.get("preset") || "this_month") as PeriodPreset;
  const { from, to } = computePeriod(preset);

  try {
    const [owners, overrides] = await Promise.all([
      fetchAllOwners(),
      getAllOverrides(),
    ]);
    const resolved = resolveFarmers(owners, overrides).filter((f) => !f.hidden);
    const allowedOwnerIds = new Set(resolved.map((f) => f.ownerId));

    const dealsQualificados = await fetchDealsByQualification({
      from,
      to,
      ownerIds: Array.from(allowedOwnerIds),
    });

    const ownerName = (ownerId: string | undefined) => {
      if (!ownerId) return "";
      const o = owners.get(ownerId);
      if (!o) return `Owner ${ownerId}`;
      return `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() || o.email || `Owner ${ownerId}`;
    };

    const header = [
      "id",
      "dealname",
      "pipeline",
      "dealstage",
      "origem_do_lead",
      "sdrfarmer_id",
      "sdrfarmer_nome",
      "data_qualificacao",
      "createdate",
      "amount",
    ].join(",");

    const rows = dealsQualificados.map((d) => {
      const p = d.properties;
      return [
        csvEscape(d.id),
        csvEscape(p.dealname),
        csvEscape(p.pipeline),
        csvEscape(p.dealstage),
        csvEscape(p.origem_do_lead),
        csvEscape(p.sdrfarmer_responsavel),
        csvEscape(ownerName(p.sdrfarmer_responsavel)),
        csvEscape(p.pipedrive___data_de_qualificacao),
        csvEscape(p.createdate),
        csvEscape(p.amount),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="demandas-${preset}-${from}-to-${to}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

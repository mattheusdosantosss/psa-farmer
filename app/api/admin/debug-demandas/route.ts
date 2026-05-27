// Endpoint de diagnóstico — quebra as demandas do período por pipeline.
// Útil pra rastrear divergências entre o dashboard e filtros manuais
// no HubSpot. Pode ser removido depois que a investigação fechar.

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

    // Conta por pipeline + uma lista compacta de exemplos por pipeline
    const byPipeline = new Map<string, {
      total: number;
      examples: Array<{ id: string; name: string; ownerId: string; qualificacao?: string }>;
    }>();

    for (const d of dealsQualificados) {
      const pipe = d.properties.pipeline || "(sem pipeline)";
      const entry = byPipeline.get(pipe) ?? { total: 0, examples: [] };
      entry.total += 1;
      if (entry.examples.length < 5) {
        entry.examples.push({
          id: d.id,
          name: d.properties.dealname || "(sem nome)",
          ownerId: d.properties.sdrfarmer_responsavel || "(sem owner)",
          qualificacao: d.properties.pipedrive___data_de_qualificacao,
        });
      }
      byPipeline.set(pipe, entry);
    }

    return NextResponse.json({
      period: { preset, from, to },
      totalDemandas: dealsQualificados.length,
      farmersAllowed: allowedOwnerIds.size,
      byPipeline: Array.from(byPipeline.entries())
        .map(([pipeline, info]) => ({
          pipeline,
          total: info.total,
          examples: info.examples,
        }))
        .sort((a, b) => b.total - a.total),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

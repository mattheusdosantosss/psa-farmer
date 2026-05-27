// Endpoint de diagnóstico — lista todos os pipelines de deals da conta
// com seus IDs e labels, e mostra a distribuição das demandas do mês
// por pipeline ID + label resolvido.
//
// Foi criado pra resolver o mistério: deals com pipeline: "default" na
// API estavam sendo assumidos como pipeline B2B, mas alguns deals com
// (B2C) no nome aparecem assim. Pode ser que "default" seja um ID
// genérico do HubSpot que agrupa vários pipelines internamente, ou
// pode ser que a propriedade pipeline esteja vindo errada no payload.

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
const HUBSPOT_API = "https://api.hubapi.com";
const TOKEN = process.env.HUBSPOT_TOKEN;

type Pipeline = {
  id: string;
  label: string;
  stages?: Array<{ id: string; label: string }>;
};
type PipelinesResponse = { results: Pipeline[] };

async function fetchAllDealPipelines(): Promise<Pipeline[]> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/pipelines/deals`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Falha ao listar pipelines de deals: ${res.status}`);
  }
  const data = (await res.json()) as PipelinesResponse;
  return data.results;
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
    const [pipelines, owners, overrides] = await Promise.all([
      fetchAllDealPipelines(),
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

    // Mapa de id -> label
    const labelById = new Map<string, string>();
    for (const p of pipelines) {
      labelById.set(p.id, p.label);
    }

    // Distribuição por pipeline ID, com label resolvido
    const byPipeline = new Map<string, {
      total: number;
      examples: Array<{ id: string; name: string; ownerId: string; qualificacao?: string }>;
    }>();

    for (const d of dealsQualificados) {
      const pipeId = d.properties.pipeline || "(sem pipeline)";
      const entry = byPipeline.get(pipeId) ?? { total: 0, examples: [] };
      entry.total += 1;
      if (entry.examples.length < 10) {
        entry.examples.push({
          id: d.id,
          name: d.properties.dealname || "(sem nome)",
          ownerId: d.properties.sdrfarmer_responsavel || "(sem owner)",
          qualificacao: d.properties.pipedrive___data_de_qualificacao,
        });
      }
      byPipeline.set(pipeId, entry);
    }

    return NextResponse.json({
      period: { preset, from, to },
      totalDemandas: dealsQualificados.length,
      farmersAllowed: allowedOwnerIds.size,
      pipelinesDaConta: pipelines.map((p) => ({
        id: p.id,
        label: p.label,
        stageCount: p.stages?.length ?? 0,
      })),
      byPipeline: Array.from(byPipeline.entries())
        .map(([pipelineId, info]) => ({
          pipelineId,
          pipelineLabel: labelById.get(pipelineId) || "(label desconhecido)",
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

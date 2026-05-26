import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllOwners,
  fetchCsTickets,
  fetchDealsForDashboard,
} from "@/lib/hubspot";
import { aggregate, RevenueMode } from "@/lib/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;
const PIPELINE_CS_ATIVO = !!process.env.HUBSPOT_PIPELINE_CS;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // Proteção simples: ?key=... precisa bater com DASHBOARD_ACCESS_KEY
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
    const [deals, tickets, owners] = await Promise.all([
      fetchDealsForDashboard({ from, to }),
      PIPELINE_CS_ATIVO ? fetchCsTickets() : Promise.resolve([]),
      fetchAllOwners(),
    ]);

    const data = aggregate({
      deals,
      tickets,
      owners,
      revenueMode,
      pipelineCsAtivo: PIPELINE_CS_ATIVO,
    });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
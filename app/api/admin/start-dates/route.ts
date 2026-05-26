import { NextRequest, NextResponse } from "next/server";
import { fetchAllOwners } from "@/lib/hubspot";
import {
  getAllStartDates,
  setStartDate,
} from "@/lib/farmer-dates-store";
import { resolveFarmers } from "@/lib/teams";
import { getAllOverrides } from "@/lib/farmer-overrides-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;

function assertAuthorized(req: NextRequest): NextResponse | null {
  if (!ACCESS_KEY) return null; // sem chave configurada → libera (dev)
  const key = new URL(req.url).searchParams.get("key");
  if (key !== ACCESS_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * GET /api/admin/start-dates
 *
 * Retorna a lista dos 19 farmers oficiais com suas datas de início
 * (ou null quando ainda não definida). Inclui ownerId, nome, email,
 * squad — tudo que a UI da Pri precisa pra renderizar a tabela.
 */
export async function GET(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  try {
    const [owners, overrides, startDates] = await Promise.all([
      fetchAllOwners(),
      getAllOverrides(),
      getAllStartDates(),
    ]);

    // Usa o mesmo resolveFarmers do dashboard pra ficar 1-1:
    //  - inclui adicionados pela Pri (override sem base)
    //  - aplica squad do override quando existir (mover de squad)
    //  - FILTRA OS OCULTOS (consistente com o dashboard)
    const farmers = resolveFarmers(owners, overrides)
      .filter((f) => !f.hidden)
      .map((f) => ({
        email: f.email,
        ownerId: f.ownerId,
        nome: f.nome,
        squadId: f.squadId,
        startDate: startDates.get(f.ownerId) ?? null,
      }))
      .sort((a, b) => {
        if (a.squadId !== b.squadId) return a.squadId.localeCompare(b.squadId);
        return a.nome.localeCompare(b.nome);
      });

    return NextResponse.json({ farmers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[admin/start-dates GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/start-dates
 *
 * Body: { ownerId: string, startDate: string | null }
 *   - startDate: "YYYY-MM-DD" para gravar, null/"" para remover
 */
export async function POST(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const ownerId = String(body.ownerId ?? "").trim();
    const startDate =
      body.startDate === null || body.startDate === ""
        ? null
        : String(body.startDate);

    if (!ownerId) {
      return NextResponse.json(
        { error: "ownerId obrigatório" },
        { status: 400 }
      );
    }

    await setStartDate(ownerId, startDate);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[admin/start-dates POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { fetchAllOwners } from "@/lib/hubspot";
import {
  getAllStartDates,
  setStartDate,
} from "@/lib/farmer-dates-store";
import { ALL_FARMER_EMAILS, normalizeEmail, squadOf } from "@/lib/teams";

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
    const [owners, startDates] = await Promise.all([
      fetchAllOwners(),
      getAllStartDates(),
    ]);

    // Mapeia owners por email (normalizado) para casar com a lista oficial
    const ownerByEmail = new Map<string, { id: string; nome: string }>();
    for (const owner of owners.values()) {
      const email = normalizeEmail(owner.email);
      if (!email) continue;
      const nome =
        `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() ||
        owner.email ||
        `Owner ${owner.id}`;
      ownerByEmail.set(email, { id: owner.id, nome });
    }

    const farmers = Array.from(ALL_FARMER_EMAILS)
      .map((email) => {
        const owner = ownerByEmail.get(email);
        return {
          email,
          ownerId: owner?.id ?? null,
          nome: owner?.nome ?? "(não encontrado no HubSpot)",
          squadId: squadOf(email),
          startDate: owner ? startDates.get(owner.id) ?? null : null,
        };
      })
      // Ordena por squad e depois nome — fica organizado pra Pri
      .sort((a, b) => {
        if (a.squadId !== b.squadId) {
          return (a.squadId ?? "z").localeCompare(b.squadId ?? "z");
        }
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
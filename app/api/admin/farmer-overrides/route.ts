import { NextRequest, NextResponse } from "next/server";
import { fetchAllOwners } from "@/lib/hubspot";
import {
  getAllOverrides,
  setOverride,
  removeOverride,
} from "@/lib/farmer-overrides-store";
import {
  ALL_FARMER_EMAILS,
  EMAIL_TO_SQUAD,
  SquadId,
  normalizeEmail,
  resolveFarmers,
} from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;

function assertAuthorized(req: NextRequest): NextResponse | null {
  if (!ACCESS_KEY) return null;
  const key = new URL(req.url).searchParams.get("key");
  if (key !== ACCESS_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function isSquadId(v: unknown): v is SquadId {
  return v === "dani" || v === "katyeli" || v === "leticia";
}

/**
 * GET /api/admin/farmer-overrides
 *
 * Retorna 2 listas:
 * - current: farmers que aparecem hoje no dashboard (base + overrides),
 *            com flag hidden e source ("base"|"override") por linha.
 * - available: owners ativos do HubSpot que ainda NÃO são farmers
 *              (não estão em teams.ts e não têm override).
 *              É a lista que a Pri vê pra "adicionar farmer novo".
 */
export async function GET(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  try {
    const [owners, overrides] = await Promise.all([
      fetchAllOwners(),
      getAllOverrides(),
    ]);

    const resolved = resolveFarmers(owners, overrides);

    // Set com ownerIds que já são farmers (em teams.ts OU com override)
    const knownOwnerIds = new Set(resolved.map((f) => f.ownerId));

    // Available = owners ativos do HubSpot que não estão em knownOwnerIds
    // e cujo email não está em ALL_FARMER_EMAILS (defesa extra contra
    // duplicidade quando o owner em teams.ts ainda não foi resolvido)
    const available: Array<{ ownerId: string; nome: string; email: string }> = [];
    for (const owner of owners.values()) {
      if (knownOwnerIds.has(owner.id)) continue;
      const email = normalizeEmail(owner.email);
      if (ALL_FARMER_EMAILS.has(email)) continue;
      if (owner.archived) continue;
      const nome =
        `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() ||
        owner.email ||
        `Owner ${owner.id}`;
      available.push({ ownerId: owner.id, nome, email });
    }
    available.sort((a, b) => a.nome.localeCompare(b.nome));

    // Pra cada farmer atual, informa também a squad de origem do teams.ts
    // (útil pra UI mostrar "foi movido de X pra Y")
    const current = resolved
      .map((f) => ({
        ownerId: f.ownerId,
        nome: f.nome,
        email: f.email,
        squadId: f.squadId,
        baseSquadId: EMAIL_TO_SQUAD.get(f.email) ?? null,
        source: f.source,
        hidden: f.hidden,
      }))
      .sort((a, b) => {
        if (a.squadId !== b.squadId) return a.squadId.localeCompare(b.squadId);
        return a.nome.localeCompare(b.nome);
      });

    return NextResponse.json({ current, available });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[admin/farmer-overrides GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/farmer-overrides
 *
 * Body: { ownerId: string, squadId: SquadId, hidden?: boolean }
 *
 * Usa-se pra TRÊS operações conforme o contexto:
 *   - Adicionar farmer novo: ownerId existe no HubSpot mas não em teams.ts
 *   - Mover de squad: muda squadId
 *   - Ocultar/mostrar: hidden=true|false
 */
export async function POST(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const ownerId = String(body.ownerId ?? "").trim();
    const squadId = body.squadId;
    const hidden = body.hidden === true;

    if (!ownerId) {
      return NextResponse.json(
        { error: "ownerId obrigatório" },
        { status: 400 }
      );
    }
    if (!isSquadId(squadId)) {
      return NextResponse.json(
        { error: `squadId inválido: ${squadId}` },
        { status: 400 }
      );
    }

    await setOverride(ownerId, { squadId, hidden });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[admin/farmer-overrides POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/farmer-overrides?ownerId=...
 *
 * Remove o override do farmer. Se ele estava SÓ no override (não estava
 * em teams.ts), ele some do dashboard. Se estava em teams.ts, volta a
 * valer a squad original e fica visível.
 */
export async function DELETE(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  try {
    const ownerId = new URL(req.url).searchParams.get("ownerId");
    if (!ownerId) {
      return NextResponse.json(
        { error: "ownerId obrigatório (query param)" },
        { status: 400 }
      );
    }
    await removeOverride(ownerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[admin/farmer-overrides DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

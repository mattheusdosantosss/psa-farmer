// ============================================================
// API de tags de farmers
// ============================================================
//
// GET    /api/admin/farmer-tags
//        → { vocabulary, assignments } — lista global de tags +
//          mapa de ownerId → nome da tag atribuída.
//
// POST   /api/admin/farmer-tags
//        Cria/atualiza tag no vocabulário OU atribui tag a farmer.
//
//        Body para vocabulário: { kind: "vocabulary", name, color }
//        Body para atribuição : { kind: "assignment", ownerId, tagName | null }
//
// DELETE /api/admin/farmer-tags?name=<nome>
//        Remove tag do vocabulário. Não desatribui automaticamente
//        (atribuições "órfãs" continuam apontando pro nome, mas a tag
//        some da UI até ser recriada).

import { NextRequest, NextResponse } from "next/server";
import {
  FarmerTag,
  getAllAssignments,
  getAllTags,
  removeTagFromVocabulary,
  setFarmerTag,
  upsertTag,
} from "@/lib/farmer-tags-store";

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

/** Aceita "#RGB", "#RRGGBB" ou "#RRGGBBAA". Padrão restrito por segurança. */
const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export async function GET(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  try {
    const [vocabulary, assignmentsMap] = await Promise.all([
      getAllTags(),
      getAllAssignments(),
    ]);

    // Map → objeto pra serialização JSON
    const assignments: Record<string, string> = {};
    for (const [ownerId, tagName] of assignmentsMap) {
      assignments[ownerId] = tagName;
    }

    return NextResponse.json({ vocabulary, assignments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PostBody =
  | { kind: "vocabulary"; name: string; color: string }
  | { kind: "assignment"; ownerId: string; tagName: string | null };

export async function POST(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }

  try {
    if (body.kind === "vocabulary") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const color = typeof body.color === "string" ? body.color.trim() : "";

      if (!name) {
        return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
      }
      if (!HEX_COLOR_RE.test(color)) {
        return NextResponse.json(
          { error: "color deve ser hex válido (#RGB, #RRGGBB ou #RRGGBBAA)" },
          { status: 400 }
        );
      }
      const tag: FarmerTag = { name, color };
      await upsertTag(tag);
      return NextResponse.json({ ok: true, tag });
    }

    if (body.kind === "assignment") {
      const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
      if (!ownerId) {
        return NextResponse.json({ error: "ownerId obrigatório" }, { status: 400 });
      }
      const tagName = body.tagName == null ? null : String(body.tagName).trim();
      await setFarmerTag(ownerId, tagName || null);
      return NextResponse.json({ ok: true, ownerId, tagName: tagName || null });
    }

    return NextResponse.json({ error: "kind desconhecido" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = assertAuthorized(req);
  if (guard) return guard;

  const name = new URL(req.url).searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "param 'name' obrigatório" }, { status: 400 });
  }

  try {
    await removeTagFromVocabulary(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// Persistência dos overrides de farmers no Vercel KV
// ============================================================
//
// Override = ajuste feito pela Pri no admin que se sobrepõe ao
// teams.ts hardcoded. Cobre 3 cenários:
//
// 1. Farmer ADICIONADO (não existia em teams.ts)
//    → grava { squadId, hidden: false }
//
// 2. Farmer MOVIDO de squad (existia em teams.ts em outra squad)
//    → grava { squadId: nova_squad, hidden: false }
//
// 3. Farmer OCULTADO do dashboard (existia em teams.ts ou foi adicionado)
//    → grava { squadId: <squad atual>, hidden: true }
//
// Layout das chaves:
//   farmer:override:<ownerId>  →  JSON { squadId, hidden }

import { kv } from "@vercel/kv";
import type { SquadId } from "./teams";

const PREFIX = "farmer:override:";

const buildKey = (ownerId: string) => `${PREFIX}${ownerId}`;

export type FarmerOverride = {
  /** Squad em que esse farmer está no dashboard (sobrescreve a do teams.ts). */
  squadId: SquadId;
  /** Se true, o farmer some do dashboard mas o override fica no KV. */
  hidden: boolean;
};

function isSquadId(v: unknown): v is SquadId {
  return v === "dani" || v === "katyeli" || v === "leticia";
}

function parseOverride(raw: unknown): FarmerOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!isSquadId(obj.squadId)) return null;
  return {
    squadId: obj.squadId,
    hidden: obj.hidden === true,
  };
}

/**
 * Grava o override de um farmer.
 */
export async function setOverride(
  ownerId: string,
  override: FarmerOverride
): Promise<void> {
  if (!ownerId) throw new Error("ownerId obrigatório");
  if (!isSquadId(override.squadId)) {
    throw new Error(`squadId inválido: ${override.squadId}`);
  }
  await kv.set(buildKey(ownerId), {
    squadId: override.squadId,
    hidden: !!override.hidden,
  });
}

/**
 * Remove o override do farmer (volta a valer só o teams.ts).
 * Se o farmer não estava no teams.ts, depois disso ele some do dashboard.
 */
export async function removeOverride(ownerId: string): Promise<void> {
  await kv.del(buildKey(ownerId));
}

/**
 * Retorna TODOS os overrides como Map<ownerId, FarmerOverride>.
 * Se o KV cair, retorna Map vazio — o dashboard segue funcionando
 * com a lista hardcoded do teams.ts (degradação elegante).
 */
export async function getAllOverrides(): Promise<Map<string, FarmerOverride>> {
  const result = new Map<string, FarmerOverride>();

  try {
    let cursor: string | number = 0;
    do {
      const scanResult: [string | number, string[]] = await kv.scan(cursor, {
        match: `${PREFIX}*`,
        count: 100,
      });
      const next = scanResult[0];
      const keys = scanResult[1];
      cursor = next;

      if (keys.length > 0) {
        const values = await kv.mget<unknown[]>(...keys);
        keys.forEach((key, i) => {
          const ownerId = key.slice(PREFIX.length);
          const parsed = parseOverride(values[i]);
          if (parsed) result.set(ownerId, parsed);
        });
      }
    } while (cursor !== 0 && cursor !== "0");
  } catch (err) {
    console.warn(
      "[farmer-overrides-store] KV indisponível, seguindo sem overrides",
      err
    );
  }

  return result;
}

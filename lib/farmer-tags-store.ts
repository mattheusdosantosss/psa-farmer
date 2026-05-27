// ============================================================
// Persistência de tags de farmers no Vercel KV
// ============================================================
//
// Sistema de tags compartilhadas:
// - Vocabulário GLOBAL de tags (nome + cor), criado dinamicamente
//   conforme a Pri vai criando tags pelo admin.
// - Cada farmer pode ter NO MÁXIMO 1 tag atribuída.
// - Tags ficam salvas mesmo se nenhum farmer usar — pra serem reaproveitadas.
//
// Layout das chaves:
//   farmer-tags:vocabulary               → JSON array [{ name, color }]
//   farmer-tags:assignment:<ownerId>     → string (nome da tag) | null

import { kv } from "@vercel/kv";

const VOCAB_KEY = "farmer-tags:vocabulary";
const ASSIGNMENT_PREFIX = "farmer-tags:assignment:";

const buildAssignmentKey = (ownerId: string) => `${ASSIGNMENT_PREFIX}${ownerId}`;

/**
 * Tag = nome único + cor hexadecimal (escolhida pela Pri na criação).
 */
export type FarmerTag = {
  name: string;
  /** Cor hex, ex: "#FF6B35". Frontend usa pra colorir o chip. */
  color: string;
};

function isFarmerTag(v: unknown): v is FarmerTag {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.color === "string";
}

/**
 * Normaliza o nome da tag pra comparação (case-insensitive, trim).
 * Tags são únicas por nome normalizado: "VIP" e "vip" são a mesma.
 */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Lista todas as tags do vocabulário global.
 */
export async function getAllTags(): Promise<FarmerTag[]> {
  try {
    const raw = await kv.get(VOCAB_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isFarmerTag);
  } catch (err) {
    console.warn("[farmer-tags-store] falha ao ler vocabulário", err);
    return [];
  }
}

/**
 * Cria ou atualiza uma tag no vocabulário. Se já existir tag com mesmo
 * nome normalizado, atualiza a cor; senão, adiciona.
 */
export async function upsertTag(tag: FarmerTag): Promise<void> {
  const current = await getAllTags();
  const normalized = normalizeTagName(tag.name);
  const filtered = current.filter((t) => normalizeTagName(t.name) !== normalized);
  filtered.push({ name: tag.name.trim(), color: tag.color });
  await kv.set(VOCAB_KEY, filtered);
}

/**
 * Remove uma tag do vocabulário (por nome normalizado).
 * NÃO desatribui automaticamente — quem chamar é responsável por
 * decidir se desatribui também (ou se mantém órfã).
 */
export async function removeTagFromVocabulary(name: string): Promise<void> {
  const current = await getAllTags();
  const normalized = normalizeTagName(name);
  const filtered = current.filter((t) => normalizeTagName(t.name) !== normalized);
  await kv.set(VOCAB_KEY, filtered);
}

/**
 * Atribui uma tag a um farmer (ou desatribui se name=null).
 * Não valida se a tag existe no vocabulário — quem chamar garante.
 */
export async function setFarmerTag(
  ownerId: string,
  tagName: string | null
): Promise<void> {
  const key = buildAssignmentKey(ownerId);
  if (tagName == null) {
    await kv.del(key);
  } else {
    await kv.set(key, tagName.trim());
  }
}

/**
 * Retorna mapa ownerId → nome da tag atribuída. Apenas farmers com tag
 * atribuída aparecem no mapa.
 *
 * Usa o ranger SCAN do KV pra iterar pelas chaves do prefixo.
 */
export async function getAllAssignments(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    let cursor = 0;
    do {
      const [next, keys] = await kv.scan(cursor, {
        match: `${ASSIGNMENT_PREFIX}*`,
        count: 100,
      });
      cursor = Number(next);
      for (const key of keys) {
        const ownerId = key.slice(ASSIGNMENT_PREFIX.length);
        const tagName = await kv.get(key);
        if (typeof tagName === "string" && tagName.trim()) {
          result.set(ownerId, tagName);
        }
      }
    } while (cursor !== 0);
  } catch (err) {
    console.warn("[farmer-tags-store] falha ao listar atribuições", err);
  }
  return result;
}

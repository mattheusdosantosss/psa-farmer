// ============================================================
// Squads de farmers — fonte da verdade do dashboard
// ============================================================
//
// Mexe AQUI quando entrar/sair farmer. E-mail é case-insensitive,
// mas mantenha em minúsculas pra consistência.
//
// Quem não estiver nesta lista NÃO aparece no dashboard, mesmo que
// tenha deals no HubSpot. Isso é proposital: filtro estrito por time.

export type SquadId = "dani" | "katyeli" | "leticia";

/**
 * Valor de aba do dashboard: "all" (visão geral) ou uma squad específica.
 * Vive aqui porque está intrinsicamente ligado a SquadId.
 */
export type TabValue = "all" | SquadId;

export type Squad = {
  id: SquadId;
  label: string;
  leader: string;
  members: string[]; // e-mails normalizados (lowercase)
};

export const SQUADS: Squad[] = [
  {
    id: "dani",
    label: "Squad Dani",
    leader: "Dani",
    members: [
      "thaina.malta@profissionaissa.com",
      "kennedy.soares@profissionaissa.com",
      "maria.guimaraes@profissionaissa.com",
      "willker.belous@profissionaissa.com",
      "francielle.lenz@profissionaissa.com",
      "maryna.rodrigues@profissionaissa.com",
    ],
  },
  {
    id: "katyeli",
    label: "Squad Katyeli",
    leader: "Katyeli",
    members: [
      "vitoria.schaeffer@profissionaissa.com",
      "thiago.souza@profissionaissa.com",
      "daniela.silva@profissionaissa.com",
      "rafael.alves@profissionaissa.com",
      "leticia.santos@profissionaissa.com",
      "joao.marins@profissionaissa.com",
      "bruna.machado@profissionaissa.com",
    ],
  },
  {
    id: "leticia",
    label: "Squad Leticia",
    leader: "Leticia",
    members: [
      "amanda.duarte@profissionaissa.com",
      "joao.backmann@profissionaissa.com",
      "ana.machado@profissionaissa.com",
      "luiza.rodriguez@profissionaissa.com",
      "gustavo.pacheco@profissionaissa.com",
    ],
  },
];

// Conjunto de TODOS os e-mails permitidos (achatado, em lowercase)
export const ALL_FARMER_EMAILS: Set<string> = new Set(
  SQUADS.flatMap((s) => s.members.map((e) => e.toLowerCase()))
);

// Mapa rápido: email -> squadId (pra agrupar deals)
export const EMAIL_TO_SQUAD: Map<string, SquadId> = new Map(
  SQUADS.flatMap((s) => s.members.map((e) => [e.toLowerCase(), s.id] as const))
);

export function normalizeEmail(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

export function squadOf(email?: string | null): SquadId | null {
  return EMAIL_TO_SQUAD.get(normalizeEmail(email)) ?? null;
}

// ============================================================
// Resolução de farmers — base (teams.ts) + overrides (KV)
// ============================================================

import type { Owner } from "./hubspot";
import type { FarmerOverride } from "./farmer-overrides-store";

export type ResolvedFarmer = {
  ownerId: string;
  email: string;
  nome: string;
  squadId: SquadId;
  /** "base" = vem do teams.ts; "override" = adicionado/movido via admin. */
  source: "base" | "override";
  hidden: boolean;
};

function fullName(owner: Owner): string {
  const nome = `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim();
  return nome || owner.email || `Owner ${owner.id}`;
}

/**
 * Resolve a lista final de farmers do dashboard, combinando a base
 * hardcoded (teams.ts) com os overrides do KV (admin da Pri).
 *
 * Regras:
 * - Owner em teams.ts: entra com a squad do teams.ts
 * - Owner com override: squad do override vence (mover de squad)
 * - Owner SÓ no override: entra como "adicionado pela Pri"
 * - hidden=true: continua no resultado, mas marcado pra ser filtrado
 *
 * Retorna TODOS (inclusive ocultos) — quem chama decide se filtra.
 */
export function resolveFarmers(
  owners: Map<string, Owner>,
  overrides: Map<string, FarmerOverride>
): ResolvedFarmer[] {
  const result: ResolvedFarmer[] = [];
  const seenOwnerIds = new Set<string>();

  // 1) Owners listados em teams.ts (via email)
  for (const owner of owners.values()) {
    const email = normalizeEmail(owner.email);
    const baseSquad = EMAIL_TO_SQUAD.get(email);
    if (!baseSquad) continue;
    const override = overrides.get(owner.id);
    result.push({
      ownerId: owner.id,
      email,
      nome: fullName(owner),
      squadId: override?.squadId ?? baseSquad,
      source: override ? "override" : "base",
      hidden: override?.hidden ?? false,
    });
    seenOwnerIds.add(owner.id);
  }

  // 2) Owners SÓ no override (adicionados pela Pri, não estão no teams.ts)
  for (const [ownerId, override] of overrides) {
    if (seenOwnerIds.has(ownerId)) continue;
    const owner = owners.get(ownerId);
    if (!owner) continue; // owner não existe mais no HubSpot — ignora
    result.push({
      ownerId,
      email: normalizeEmail(owner.email),
      nome: fullName(owner),
      squadId: override.squadId,
      source: "override",
      hidden: override.hidden,
    });
  }

  return result;
}

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
      "francielle.inacio@profissionaissa.com",
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

export function isFarmer(email?: string | null): boolean {
  return ALL_FARMER_EMAILS.has(normalizeEmail(email));
}

export function squadOf(email?: string | null): SquadId | null {
  return EMAIL_TO_SQUAD.get(normalizeEmail(email)) ?? null;
}
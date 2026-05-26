// ============================================================
// Persistência das datas de início dos farmers no Vercel KV
// ============================================================
//
// Por que KV e não banco SQL?
// - São 19 farmers, dado é pequeno e baixíssima frequência de escrita
// - KV é gratuito até 10k commands/dia (mais que suficiente)
// - Zero infra extra; tudo gerenciado pela Vercel
//
// Layout das chaves:
//   farmer:startDate:<ownerId>  →  "YYYY-MM-DD" (ISO date)
//
// Optei por uma chave por farmer (em vez de um objeto único) para:
// - Atualizar farmer A não invalidar nada do farmer B (corridas)
// - Listar tudo com SCAN/KEYS continua barato em volumes pequenos

import { kv } from "@vercel/kv";

const PREFIX = "farmer:startDate:";

const buildKey = (ownerId: string) => `${PREFIX}${ownerId}`;

/**
 * Retorna a data de início (ISO YYYY-MM-DD) do farmer, ou null se nunca
 * foi definida. Falhas no KV são logadas mas não derrubam o dashboard:
 * caímos pra null silenciosamente.
 */
export async function getStartDate(ownerId: string): Promise<string | null> {
  try {
    const value = await kv.get<string>(buildKey(ownerId));
    return value ?? null;
  } catch (err) {
    console.warn("[farmer-dates-store] falha ao ler", ownerId, err);
    return null;
  }
}

/**
 * Define a data de início do farmer. Passar null/string vazia REMOVE
 * a entrada (volta a ser "não definida").
 */
export async function setStartDate(
  ownerId: string,
  isoDate: string | null
): Promise<void> {
  const key = buildKey(ownerId);
  if (!isoDate) {
    await kv.del(key);
    return;
  }
  // Valida YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`Data inválida: ${isoDate}. Esperado YYYY-MM-DD.`);
  }
  await kv.set(key, isoDate);
}

/**
 * Retorna um Map de ownerId → ISO date para TODOS os farmers que têm
 * data salva. Usa SCAN para ser leve mesmo com muitas chaves.
 *
 * Se o KV não estiver configurado (env vars ausentes) ou retornar erro,
 * devolve um Map vazio e o dashboard continua funcionando — só não
 * mostra a coluna "Tempo".
 */
export async function getAllStartDates(): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  try {
    // SCAN paginado — em volumes pequenos (< 100 chaves) uma página resolve
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
        // MGET puxa todos os valores numa request só
        const values = await kv.mget<string[]>(...keys);
        keys.forEach((key, i) => {
          const ownerId = key.slice(PREFIX.length);
          const value = values[i];
          if (typeof value === "string" && value) {
            result.set(ownerId, value);
          }
        });
      }
    } while (cursor !== 0 && cursor !== "0");
  } catch (err) {
    console.warn("[farmer-dates-store] KV indisponível, seguindo sem datas", err);
  }

  return result;
}
import { MAX_KEYS } from "@/lib/types";

export function parseKeyText(raw: string) {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const value = line.trim().replace(/^["']|["']$/g, "");
    if (!value) continue;
    if (/^(key|keys|cdkey|steam.?key)$/i.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    keys.push(value);
    if (keys.length >= MAX_KEYS) break;
  }
  return keys;
}

export function allocateKeys(pool: string[], recipientCount: number, perEmail: number) {
  const count = Math.max(1, Math.min(5, Math.floor(perEmail) || 1));
  const need = recipientCount * count;
  if (pool.length < need) {
    throw new Error(`密钥不够：这批 ${recipientCount} 人、每人 ${count} 份，需要 ${need} 个，池里还有 ${pool.length} 个。`);
  }
  const remaining = [...pool];
  const assigned: string[][] = [];
  for (let i = 0; i < recipientCount; i += 1) {
    assigned.push(remaining.splice(0, count));
  }
  return { assigned, remaining, perEmail: count };
}

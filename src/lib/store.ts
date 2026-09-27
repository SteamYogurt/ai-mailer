import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { mergeRecipients } from "@/lib/csv";
import { emptyGame } from "@/lib/sample";
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  type AiSettings,
  type ChatMessage,
  type GameRecord,
  type InboxMessage,
  type LegacyGameRecord,
  type Recipient,
  type SmtpConfig,
} from "@/lib/types";

export const USERDATA_DIR = path.join(process.cwd(), "userdata");
const gamesDir = path.join(USERDATA_DIR, "games");
const smtpFile = path.join(USERDATA_DIR, "smtp.json");
const settingsFile = path.join(USERDATA_DIR, "settings.json");
const inboxFile = path.join(USERDATA_DIR, "inbox.json");
const chatFile = path.join(USERDATA_DIR, "chat.json");
const workspaceFile = path.join(USERDATA_DIR, "workspace.json");
const recipientsFile = path.join(USERDATA_DIR, "recipients.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

function stripLegacyGame(game: LegacyGameRecord): GameRecord {
  const { recipients: _recipients, recipientCsv: _recipientCsv, ...rest } = game;
  return rest;
}

async function readGameFiles(): Promise<LegacyGameRecord[]> {
  await mkdir(gamesDir, { recursive: true });
  const names = await readdir(gamesDir);
  const games: LegacyGameRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const game = await readJson<LegacyGameRecord | null>(path.join(gamesDir, name), null);
    if (game?.id) games.push(game);
  }
  return games;
}

export async function listGames(): Promise<GameRecord[]> {
  await migrateRecipientsFromGames();
  const games = (await readGameFiles()).map(stripLegacyGame);
  games.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  if (games.length === 0) {
    const created = emptyGame();
    await saveGame(created);
    return [created];
  }
  return games;
}

export async function getGame(id: string) {
  const game = await readJson<LegacyGameRecord | null>(path.join(gamesDir, `${id}.json`), null);
  return game?.id ? stripLegacyGame(game) : null;
}

export async function saveGame(game: GameRecord) {
  const next = stripLegacyGame({ ...game, updatedAt: new Date().toISOString() });
  await writeJson(path.join(gamesDir, `${next.id}.json`), next);
  return next;
}

export async function getRecipients(): Promise<Recipient[]> {
  await migrateRecipientsFromGames();
  const saved = await readJson<Recipient[]>(recipientsFile, []);
  const next = mergeRecipients([], saved).recipients;
  const needsLanguage = saved.some((item) => !item?.language);
  if (needsLanguage && next.length > 0) {
    await writeJson(recipientsFile, next);
  }
  return next;
}

export async function saveRecipients(recipients: Recipient[]) {
  const next = mergeRecipients([], recipients).recipients;
  await writeJson(recipientsFile, next);
  return next;
}

let migratingRecipients: Promise<void> | null = null;

async function migrateRecipientsFromGames() {
  if (migratingRecipients) {
    await migratingRecipients;
    return;
  }
  migratingRecipients = (async () => {
    const games = await readGameFiles();
    const leftover = games.flatMap((game) => game.recipients ?? []);
    const needsStrip = games.some(
      (game) => game.recipients !== undefined || game.recipientCsv !== undefined,
    );
    if (leftover.length === 0 && !needsStrip) return;

    const existing = await readJson<Recipient[]>(recipientsFile, []);
    if (leftover.length > 0) {
      await writeJson(recipientsFile, mergeRecipients(existing, leftover).recipients);
    }
    if (needsStrip) {
      for (const game of games) {
        await writeJson(path.join(gamesDir, `${game.id}.json`), stripLegacyGame(game));
      }
    }
  })();
  try {
    await migratingRecipients;
  } finally {
    migratingRecipients = null;
  }
}

export async function deleteGame(id: string) {
  try {
    await unlink(path.join(gamesDir, `${id}.json`));
  } catch {
    /* already gone */
  }
  const remaining = await listGames();
  return remaining;
}

export async function getActiveGameId() {
  const workspace = await readJson<{ activeGameId?: string }>(workspaceFile, {});
  return workspace.activeGameId ?? null;
}

export async function setActiveGameId(id: string) {
  await writeJson(workspaceFile, { activeGameId: id });
}

export async function getSmtp(): Promise<SmtpConfig> {
  return readJson<SmtpConfig>(smtpFile, {
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    user: "",
    pass: "",
  });
}

export async function saveSmtp(smtp: SmtpConfig) {
  await writeJson(smtpFile, smtp);
  return smtp;
}

const defaultSettings = (): AiSettings => ({
  name: "DeepSeek",
  apiKey: "",
  model: DEFAULT_AI_MODEL,
  baseUrl: DEFAULT_AI_BASE_URL,
});

export async function getAiSettings(): Promise<AiSettings> {
  const saved = await readJson<Partial<AiSettings>>(settingsFile, {});
  return {
    name: saved.name?.trim() || defaultSettings().name,
    apiKey: saved.apiKey?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || "",
    model: saved.model?.trim() || process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_AI_MODEL,
    baseUrl:
      saved.baseUrl?.trim() ||
      process.env.DEEPSEEK_BASE_URL?.trim() ||
      DEFAULT_AI_BASE_URL,
  };
}

export async function saveAiSettings(input: Partial<AiSettings>) {
  const current = await getAiSettings();
  const next: AiSettings = {
    name: input.name?.trim() || current.name,
    apiKey: input.apiKey === undefined ? current.apiKey : input.apiKey.trim(),
    model: input.model?.trim() || current.model,
    baseUrl: input.baseUrl?.trim() || current.baseUrl,
  };
  await writeJson(settingsFile, next);
  return next;
}

export async function listInbox(email?: string): Promise<InboxMessage[]> {
  const items = await readJson<InboxMessage[]>(inboxFile, []);
  const filtered = email
    ? items.filter((item) => item.to.toLowerCase() === email.trim().toLowerCase())
    : items;
  return filtered.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function appendInbox(messages: InboxMessage[]) {
  const current = await readJson<InboxMessage[]>(inboxFile, []);
  await writeJson(inboxFile, [...messages, ...current].slice(0, 2000));
}

export async function deleteInbox(id?: string) {
  if (!id) {
    await writeJson(inboxFile, []);
    return;
  }
  const current = await readJson<InboxMessage[]>(inboxFile, []);
  await writeJson(
    inboxFile,
    current.filter((item) => item.id !== id),
  );
}

export async function getChat(): Promise<ChatMessage[]> {
  return readJson<ChatMessage[]>(chatFile, []);
}

export async function saveChat(messages: ChatMessage[]) {
  await writeJson(chatFile, messages.slice(-80));
  return messages.slice(-80);
}

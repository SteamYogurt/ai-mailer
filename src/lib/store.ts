import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { emptyGame } from "@/lib/sample";
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  type AiSettings,
  type ChatMessage,
  type GameRecord,
  type InboxMessage,
  type SmtpConfig,
} from "@/lib/types";

export const USERDATA_DIR = path.join(process.cwd(), "userdata");
const gamesDir = path.join(USERDATA_DIR, "games");
const smtpFile = path.join(USERDATA_DIR, "smtp.json");
const settingsFile = path.join(USERDATA_DIR, "settings.json");
const inboxFile = path.join(USERDATA_DIR, "inbox.json");
const chatFile = path.join(USERDATA_DIR, "chat.json");
const workspaceFile = path.join(USERDATA_DIR, "workspace.json");

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

export async function listGames(): Promise<GameRecord[]> {
  await mkdir(gamesDir, { recursive: true });
  const names = await readdir(gamesDir);
  const games: GameRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const game = await readJson<GameRecord | null>(path.join(gamesDir, name), null);
    if (game?.id) games.push(game);
  }
  games.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  if (games.length === 0) {
    const created = emptyGame();
    await saveGame(created);
    return [created];
  }
  return games;
}

export async function getGame(id: string) {
  return readJson<GameRecord | null>(path.join(gamesDir, `${id}.json`), null);
}

export async function saveGame(game: GameRecord) {
  const next: GameRecord = { ...game, updatedAt: new Date().toISOString() };
  await writeJson(path.join(gamesDir, `${next.id}.json`), next);
  return next;
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

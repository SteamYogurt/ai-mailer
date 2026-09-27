export type Tone = "warm" | "professional" | "concise";

export type Campaign = {
  brand: string;
  overview: string;
  offer: string;
  ctaLabel: string;
  ctaUrl: string;
  tone: Tone;
  senderName: string;
  senderEmail: string;
  companyName: string;
  extraInstructions: string;
};

export const BLOGGER_LANGUAGES = ["en", "zh-Hant", "ja", "ko"] as const;
export type BloggerLanguage = (typeof BLOGGER_LANGUAGES)[number];
export const DEFAULT_BLOGGER_LANGUAGE: BloggerLanguage = "en";

export const bloggerLanguageLabel: Record<BloggerLanguage, string> = {
  en: "英语",
  "zh-Hant": "繁中",
  ja: "日语",
  ko: "韩语",
};

export function isBloggerLanguage(value: string): value is BloggerLanguage {
  return (BLOGGER_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeBloggerLanguage(value?: string | null): BloggerLanguage {
  const raw = value?.trim();
  if (!raw) return DEFAULT_BLOGGER_LANGUAGE;
  if (isBloggerLanguage(raw)) return raw;
  const key = raw.toLowerCase().replace(/[\s_]+/g, "");
  const aliases: Record<string, BloggerLanguage> = {
    en: "en",
    eng: "en",
    english: "en",
    英语: "en",
    英文: "en",
    zh: "zh-Hant",
    "zh-hant": "zh-Hant",
    "zh-tw": "zh-Hant",
    "zh-hk": "zh-Hant",
    "zh-mo": "zh-Hant",
    traditionalchinese: "zh-Hant",
    繁中: "zh-Hant",
    繁體: "zh-Hant",
    繁体: "zh-Hant",
    繁體中文: "zh-Hant",
    繁体中文: "zh-Hant",
    中文: "zh-Hant",
    ja: "ja",
    jp: "ja",
    japanese: "ja",
    日语: "ja",
    日文: "ja",
    日本語: "ja",
    ko: "ko",
    kr: "ko",
    korean: "ko",
    韩语: "ko",
    韓語: "ko",
    韩文: "ko",
    韓文: "ko",
    한국어: "ko",
  };
  return aliases[key] ?? DEFAULT_BLOGGER_LANGUAGE;
}

export type Recipient = {
  id: string;
  email: string;
  name: string;
  company: string;
  note: string;
  language: BloggerLanguage;
};

export type Draft = {
  recipientId: string;
  email: string;
  name: string;
  subject: string;
  body: string;
  included: boolean;
  keys?: string[];
};

export type GameRecord = Campaign & {
  id: string;
  createdAt: string;
  updatedAt: string;
  keys: string[];
  attachKeys: boolean;
  keysPerEmail: number;
  drafts: Draft[];
};

/** Old game files used to store a per-game list. Migrated into the global roster. */
export type LegacyGameRecord = GameRecord & {
  recipients?: Recipient[];
  recipientCsv?: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

export type AiSettings = {
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
};

export type SendMode = "simulate" | "smtp";

export type InboxMessage = {
  id: string;
  at: string;
  mode: SendMode;
  gameId?: string;
  gameName?: string;
  to: string;
  toName: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  keys?: string[];
  status: "sent" | "failed";
  error?: string;
};

export const MAX_RECIPIENTS = 80;
export const MAX_GLOBAL_RECIPIENTS = 2000;
export const MAX_SMTP_BATCH = 40;
export const MAX_KEYS = 500;
export const DEFAULT_AI_MODEL = "deepseek-v4-pro";
export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";

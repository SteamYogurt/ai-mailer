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

export type Recipient = {
  id: string;
  email: string;
  name: string;
  company: string;
  note: string;
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
  recipients: Recipient[];
  recipientCsv: string;
  keys: string[];
  attachKeys: boolean;
  keysPerEmail: number;
  drafts: Draft[];
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
export const MAX_SMTP_BATCH = 40;
export const MAX_KEYS = 500;
export const DEFAULT_AI_MODEL = "deepseek-v4-pro";
export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";

import type { Campaign, GameRecord, Recipient, Tone } from "@/lib/types";

export const toneLabel: Record<Tone, string> = {
  warm: "像开发者私信",
  professional: "正式邀请",
  concise: "尽量短",
};

export const emptyCampaign = (): Campaign => ({
  brand: "",
  overview: "",
  offer: "",
  ctaLabel: "试玩 / 预告片",
  ctaUrl: "",
  tone: "warm",
  senderName: "",
  senderEmail: "",
  companyName: "",
  extraInstructions: "",
});

export function emptyGame(partial?: Partial<GameRecord>): GameRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...emptyCampaign(),
    keys: [],
    attachKeys: false,
    keysPerEmail: 1,
    drafts: [],
    ...partial,
  };
}

export const sampleRecipients = (): Recipient[] => [
  {
    id: "chi-yan",
    email: "business.chiyan@example.com",
    name: "迟焰",
    company: "B 站「迟焰在玩」",
    note: "最近在玩短篇叙事解谜，评论区常提想看独立游戏",
    language: "zh-Hant",
  },
];

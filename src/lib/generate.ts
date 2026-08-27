import { withFooter } from "@/lib/compliance";
import { deepseekChat } from "@/lib/ai";
import { getAiSettings } from "@/lib/store";
import type { Campaign, Recipient } from "@/lib/types";

export type Generated = {
  recipientId: string;
  email: string;
  name: string;
  subject: string;
  body: string;
  keys?: string[];
  engine: "deepseek";
};

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(raw) as {
    drafts?: { email?: string; subject?: string; body?: string }[];
  };
}

export async function generateDrafts(
  campaign: Campaign,
  recipients: Recipient[],
  keysByEmail: Record<string, string[]> = {},
): Promise<Generated[]> {
  const extra = campaign.extraInstructions?.trim();
  const hasKeys = Object.values(keysByEmail).some((keys) => keys.length > 0);

  const { content } = await deepseekChat(
    [
      {
        role: "system",
        content: [
          "You write short outreach emails from an indie game developer to video creators (Bilibili, YouTube, Douyin, streamers).",
          'Return JSON {"drafts":[{"email","subject","body"}]}. The word json and this exact shape are required.',
          "Rules: subject must clearly say it is a playtest/collaboration invite; mention the creator's channel or recent work when provided; do not invent keys, discounts, or praise; no fake urgency, invoices, or Re:/Fwd:; plain text; default Chinese unless the creator looks English-first.",
          "Do not close with a signature, sender name, studio name, game title, divider, or identity block. The application appends one signature after you return the body.",
          hasKeys
            ? "If steamKeys are provided for a recipient, include those exact keys in the email body. Never invent extra keys."
            : "Do not mention Steam keys unless the developer asked in extra instructions.",
          extra ? `Follow these extra instructions:\n${extra}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          campaign: {
            brand: campaign.brand,
            overview: campaign.overview,
            offer: campaign.offer,
            ctaLabel: campaign.ctaLabel,
            ctaUrl: campaign.ctaUrl,
            tone: campaign.tone,
            senderName: campaign.senderName,
            extraInstructions: extra || undefined,
          },
          recipients: recipients.map((item) => ({
            email: item.email,
            name: item.name,
            channel: item.company,
            whyThem: item.note,
            steamKeys: keysByEmail[item.email] ?? [],
          })),
        }),
      },
    ],
    { json: true, temperature: 0.6, maxTokens: 16000 },
  );

  let parsed: { drafts?: { email?: string; subject?: string; body?: string }[] };
  try {
    parsed = extractJsonObject(content);
  } catch {
    throw new Error("DeepSeek 没有返回可解析的 JSON，请再点一次生成。");
  }

  const byEmail = new Map(
    (parsed.drafts ?? [])
      .filter((draft) => draft.email)
      .map((draft) => [draft.email!.toLowerCase(), draft]),
  );

  if (recipients.every((recipient) => !byEmail.get(recipient.email)?.body?.trim())) {
    throw new Error("DeepSeek 没有为任何收件人写出正文。请缩短名单或改写额外要求后再试。");
  }

  return recipients.map((recipient) => {
    const draft = byEmail.get(recipient.email);
    const subject = draft?.subject?.trim() || `《${campaign.brand}》试玩邀请`;
    const body = draft?.body?.trim();
    if (!body) {
      throw new Error(`DeepSeek 没有写出给 ${recipient.email} 的正文，请重试。`);
    }
    const keys = keysByEmail[recipient.email] ?? [];
    let text = body;
    if (keys.length > 0 && keys.some((key) => !text.includes(key))) {
      text = `${text}\n\n游戏密钥：\n${keys.map((key) => `· ${key}`).join("\n")}`;
    }
    return {
      recipientId: recipient.id,
      email: recipient.email,
      name: recipient.name,
      subject,
      body: withFooter(text, campaign),
      keys,
      engine: "deepseek" as const,
    };
  });
}

export async function aiStatus() {
  const settings = await getAiSettings();
  return {
    configured: Boolean(settings.apiKey),
    name: settings.name,
    model: settings.model,
  };
}

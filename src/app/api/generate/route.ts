import { looksDeceptive } from "@/lib/compliance";
import { mergeDrafts } from "@/lib/drafts";
import { generateDrafts } from "@/lib/generate";
import { allocateKeys } from "@/lib/keys";
import { getGame, saveGame } from "@/lib/store";
import { MAX_RECIPIENTS, type Campaign, type Recipient } from "@/lib/types";

function incompleteCampaign(campaign: Campaign) {
  const required: (keyof Campaign)[] = [
    "brand",
    "overview",
    "offer",
    "ctaLabel",
    "ctaUrl",
    "senderName",
    "companyName",
  ];
  return required.filter((key) => !String(campaign[key] ?? "").trim());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    gameId?: string;
    campaign?: Campaign;
    recipients?: Recipient[];
    attachKeys?: boolean;
    keysPerEmail?: number;
    keys?: string[];
  };

  const recipients = (body.recipients ?? []).slice(0, MAX_RECIPIENTS);
  const campaign = body.campaign;

  if (!campaign) {
    return Response.json({ error: "缺少游戏信息" }, { status: 400 });
  }

  const missing = incompleteCampaign(campaign);
  if (missing.length > 0) {
    return Response.json({ error: `请先补全：${missing.join("、")}` }, { status: 400 });
  }
  if (recipients.length === 0) {
    return Response.json({ error: "请先选择至少一位收件人" }, { status: 400 });
  }

  let pool = body.keys ?? [];
  let remaining = pool;
  const keysByEmail: Record<string, string[]> = {};

  if (body.attachKeys) {
    try {
      const allocated = allocateKeys(pool, recipients.length, body.keysPerEmail ?? 1);
      remaining = allocated.remaining;
      recipients.forEach((recipient, index) => {
        keysByEmail[recipient.email] = allocated.assigned[index] ?? [];
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "密钥分配失败" },
        { status: 400 },
      );
    }
  }

  try {
    const drafts = await generateDrafts(campaign, recipients, keysByEmail);
    const incoming = drafts.map((draft) => ({ ...draft, included: true }));
    if (body.gameId) {
      const game = await getGame(body.gameId);
      if (game) {
        await saveGame({
          ...game,
          ...campaign,
          keys: remaining,
          attachKeys: Boolean(body.attachKeys),
          keysPerEmail: body.keysPerEmail ?? game.keysPerEmail,
          drafts: mergeDrafts(game.drafts, incoming),
        });
      }
    }

    return Response.json({
      drafts: incoming,
      remainingKeys: remaining,
      engine: "deepseek",
      flagged: drafts.filter((draft) => looksDeceptive(draft.subject)).map((draft) => draft.email),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败";
    const status = message.includes("API Key") ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}

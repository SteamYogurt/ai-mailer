import { looksDeceptive, withFooter } from "@/lib/compliance";
import { sendSmtpMail, verifySmtp } from "@/lib/mailer";
import { appendInbox, getGame, getSmtp, saveGame, saveSmtp } from "@/lib/store";
import {
  MAX_RECIPIENTS,
  MAX_SMTP_BATCH,
  type Campaign,
  type Draft,
  type InboxMessage,
  type SendMode,
  type SmtpConfig,
} from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    campaign?: Campaign;
    drafts?: Draft[];
    mode?: SendMode;
    smtp?: SmtpConfig;
    gameId?: string;
    gameName?: string;
  };

  const mode: SendMode = body.mode === "simulate" ? "simulate" : "smtp";
  const drafts = (body.drafts ?? []).filter((draft) => draft.included);

  if (!body.campaign) {
    return Response.json({ error: "缺少游戏信息" }, { status: 400 });
  }
  if (drafts.length === 0) {
    return Response.json({ error: "没有可发送的草稿" }, { status: 400 });
  }
  if (drafts.length > MAX_RECIPIENTS) {
    return Response.json({ error: `单次最多 ${MAX_RECIPIENTS} 封` }, { status: 400 });
  }
  if (mode === "smtp" && drafts.length > MAX_SMTP_BATCH) {
    return Response.json({ error: `真发单次最多 ${MAX_SMTP_BATCH} 封` }, { status: 400 });
  }

  const deceptive = drafts.find((draft) => looksDeceptive(draft.subject));
  if (deceptive) {
    return Response.json({ error: `主题被拦截：${deceptive.subject}` }, { status: 400 });
  }

  const smtp = body.smtp ?? (await getSmtp());
  const fromEmail = smtp.user?.trim() || body.campaign.senderEmail;
  const campaign = { ...body.campaign, senderEmail: fromEmail };

  if (mode === "smtp") {
    if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass) {
      return Response.json({ error: "请填写 SMTP 主机、端口、账号和授权码" }, { status: 400 });
    }
    try {
      await verifySmtp(smtp);
      await saveSmtp(smtp);
    } catch (error) {
      return Response.json(
        { error: `SMTP 校验失败：${error instanceof Error ? error.message : "未知错误"}` },
        { status: 400 },
      );
    }
  }

  const results: InboxMessage[] = [];

  for (const draft of drafts) {
    const email = draft.email.trim().toLowerCase();
    const bodyText = withFooter(draft.body, campaign);
    try {
      if (mode === "smtp") {
        await sendSmtpMail({
          smtp,
          fromName: campaign.senderName,
          fromEmail,
          to: email,
          subject: draft.subject,
          body: bodyText,
        });
      }
      results.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        mode,
        gameId: body.gameId,
        gameName: body.gameName || campaign.brand,
        to: email,
        toName: draft.name,
        from: fromEmail,
        fromName: campaign.senderName,
        subject: draft.subject,
        body: bodyText,
        keys: draft.keys,
        status: "sent",
      });
    } catch (error) {
      results.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        mode,
        gameId: body.gameId,
        gameName: body.gameName || campaign.brand,
        to: email,
        toName: draft.name,
        from: fromEmail,
        fromName: campaign.senderName,
        subject: draft.subject,
        body: bodyText,
        keys: draft.keys,
        status: "failed",
        error: error instanceof Error ? error.message : "发送失败",
      });
    }
  }

  await appendInbox(results);

  if (body.gameId) {
    const game = await getGame(body.gameId);
    if (game) {
      await saveGame({ ...game, drafts: game.drafts });
    }
  }

  return Response.json({
    results,
    sent: results.filter((item) => item.status === "sent").length,
    failed: results.filter((item) => item.status === "failed").length,
  });
}

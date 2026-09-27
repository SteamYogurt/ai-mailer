import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import type { SmtpConfig } from "@/lib/types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function smtpGapMs(host: string) {
  const h = host.trim().toLowerCase();
  if (h.includes("qq.com")) return 2500;
  if (h.includes("163.com") || h.includes("126.com")) return 2000;
  return 1200;
}

export function explainSmtpError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.startsWith("已暂停")) return raw;
  if (/535|login fail|login frequency|Account is abnormal|service is not open/i.test(raw)) {
    return "QQ 拒绝登录（535）。常见原因：授权码不对、未开 SMTP，或连发太快被限频。已成功的不用重发；失败的请等几分钟后再发。";
  }
  return raw;
}

export function isSmtpRateLimit(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return /535|login fail|login frequency|too many/i.test(raw);
}

export function createTransport(smtp: SmtpConfig, pooled = false) {
  const auth = smtp.user
    ? {
        user: smtp.user,
        pass: smtp.pass,
      }
    : undefined;
  const timeouts = {
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  };
  if (pooled) {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth,
      pool: true,
      maxConnections: 1,
      maxMessages: 80,
      ...timeouts,
    });
  }
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth,
    ...timeouts,
  });
}

export async function verifySmtp(smtp: SmtpConfig) {
  const transport = createTransport(smtp);
  await transport.verify();
  transport.close();
}

async function sendWithRetry(
  transport: Transporter,
  options: {
    fromName: string;
    fromEmail: string;
    to: string;
    subject: string;
    body: string;
  },
) {
  const payload = {
    from: `"${options.fromName}" <${options.fromEmail}>`,
    envelope: {
      from: options.fromEmail,
      to: options.to,
    },
    to: options.to,
    subject: options.subject,
    text: options.body,
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await transport.sendMail(payload);
      return;
    } catch (error) {
      lastError = error;
      if (!isSmtpRateLimit(error) || attempt === 2) throw error;
      await sleep(12_000 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function sendSmtpMail(options: {
  smtp: SmtpConfig;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
}) {
  const transport = createTransport(options.smtp);
  try {
    await sendWithRetry(transport, options);
  } finally {
    transport.close();
  }
}

export async function sendSmtpBatch(options: {
  smtp: SmtpConfig;
  fromName: string;
  fromEmail: string;
  messages: { to: string; subject: string; body: string }[];
  onEach?: (index: number, error?: unknown) => void;
}): Promise<{ aborted: boolean; errors: (unknown | null)[] }> {
  const transport = createTransport(options.smtp, true);
  const errors: (unknown | null)[] = options.messages.map(() => null);
  let aborted = false;
  try {
    try {
      await transport.verify();
    } catch (error) {
      return { aborted: true, errors: options.messages.map(() => error) };
    }
    const gap = smtpGapMs(options.smtp.host);
    for (let i = 0; i < options.messages.length; i += 1) {
      if (i > 0) await sleep(gap);
      const message = options.messages[i];
      try {
        await sendWithRetry(transport, {
          fromName: options.fromName,
          fromEmail: options.fromEmail,
          to: message.to,
          subject: message.subject,
          body: message.body,
        });
        options.onEach?.(i);
      } catch (error) {
        errors[i] = error;
        options.onEach?.(i, error);
        if (isSmtpRateLimit(error)) {
          aborted = true;
          for (let j = i + 1; j < options.messages.length; j += 1) {
            errors[j] = new Error("已暂停后续发送：QQ 连发被限频。请等几分钟后只重发剩下的几封。");
          }
          break;
        }
      }
    }
  } finally {
    transport.close();
  }
  return { aborted, errors };
}

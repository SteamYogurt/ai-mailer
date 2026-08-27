import nodemailer from "nodemailer";

import type { SmtpConfig } from "@/lib/types";

export function createTransport(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user
      ? {
          user: smtp.user,
          pass: smtp.pass,
        }
      : undefined,
  });
}

export async function verifySmtp(smtp: SmtpConfig) {
  const transport = createTransport(smtp);
  await transport.verify();
  transport.close();
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
  await transport.sendMail({
    from: `"${options.fromName}" <${options.fromEmail}>`,
    envelope: {
      from: options.fromEmail,
      to: options.to,
    },
    to: options.to,
    subject: options.subject,
    text: options.body,
  });
  transport.close();
}

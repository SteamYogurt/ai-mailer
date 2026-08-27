import { verifySmtp } from "@/lib/mailer";
import { getSmtp, saveSmtp } from "@/lib/store";
import type { SmtpConfig } from "@/lib/types";

export async function GET() {
  return Response.json({ smtp: await getSmtp() });
}

export async function PUT(request: Request) {
  const smtp = (await request.json()) as SmtpConfig;
  const saved = await saveSmtp(smtp);
  return Response.json({ smtp: saved });
}

export async function POST(request: Request) {
  const smtp = (await request.json()) as SmtpConfig;
  if (!smtp.host || !smtp.port) {
    return Response.json({ error: "请填写主机和端口" }, { status: 400 });
  }
  try {
    await verifySmtp(smtp);
    await saveSmtp(smtp);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "连接失败" },
      { status: 400 },
    );
  }
}

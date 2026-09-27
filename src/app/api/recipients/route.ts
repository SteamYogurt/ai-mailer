import { mergeRecipients, parseRecipientText, toCsv } from "@/lib/csv";
import { getRecipients, saveRecipients } from "@/lib/store";
import {
  DEFAULT_BLOGGER_LANGUAGE,
  MAX_GLOBAL_RECIPIENTS,
  normalizeBloggerLanguage,
  type Recipient,
} from "@/lib/types";

export async function GET() {
  const recipients = await getRecipients();
  return Response.json({ recipients, csv: toCsv(recipients) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    csv?: string;
    recipients?: Recipient[];
    replace?: boolean;
    language?: string;
  };

  const language = normalizeBloggerLanguage(body.language ?? DEFAULT_BLOGGER_LANGUAGE);
  const current = body.replace ? [] : await getRecipients();
  const incoming = body.recipients?.length
    ? body.recipients
    : parseRecipientText(body.csv ?? "", language).recipients;

  const parsed = body.csv && !body.recipients?.length ? parseRecipientText(body.csv, language) : null;
  const merged = mergeRecipients(current, incoming);

  const saved = await saveRecipients(merged.recipients);
  return Response.json({
    recipients: saved,
    csv: toCsv(saved),
    added: merged.added,
    filled: merged.filled,
    truncated: merged.truncated || Boolean(parsed?.truncated),
    invalid: parsed?.invalid ?? [],
    limit: MAX_GLOBAL_RECIPIENTS,
  });
}

export async function DELETE(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  const current = await getRecipients();
  const next = email ? current.filter((item) => item.email !== email) : [];
  const saved = await saveRecipients(next);
  return Response.json({ recipients: saved, csv: toCsv(saved) });
}

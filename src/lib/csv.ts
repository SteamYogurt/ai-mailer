import {
  DEFAULT_BLOGGER_LANGUAGE,
  isBloggerLanguage,
  MAX_GLOBAL_RECIPIENTS,
  normalizeBloggerLanguage,
  type BloggerLanguage,
  type Recipient,
} from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

export function recipientKey(email: string) {
  return email.trim().toLowerCase();
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function headerKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export type ParseResult = {
  recipients: Recipient[];
  invalid: string[];
  truncated: boolean;
};

export function parseRecipientText(
  raw: string,
  language: BloggerLanguage = DEFAULT_BLOGGER_LANGUAGE,
  limit = MAX_GLOBAL_RECIPIENTS,
): ParseResult {
  const fallbackLanguage = normalizeBloggerLanguage(language);
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { recipients: [], invalid: [], truncated: false };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const first = splitCsvLine(lines[0] ?? "");
  const looksLikeHeader = first.some((cell) =>
    ["email", "邮箱", "mail", "e-mail"].includes(headerKey(cell)),
  );

  const recipients: Recipient[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  const push = (email: string, name: string, company: string, note: string) => {
    const normalized = recipientKey(email);
    if (!normalized) return;
    if (!isValidEmail(normalized)) {
      invalid.push(email);
      return;
    }
    if (seen.has(normalized)) return;
    seen.add(normalized);
    recipients.push({
      id: normalized,
      email: normalized,
      name: name.trim(),
      company: company.trim(),
      note: note.trim(),
      language: fallbackLanguage,
    });
  };

  if (looksLikeHeader) {
    const headers = first.map(headerKey);
    const emailIdx = headers.findIndex((h) =>
      ["email", "邮箱", "mail", "e-mail"].includes(h),
    );
    const nameIdx = headers.findIndex((h) =>
      ["name", "姓名", "收件人", "博主"].includes(h),
    );
    const companyIdx = headers.findIndex((h) =>
      ["company", "公司", "组织", "organisation", "organization", "channel", "频道", "渠道"].includes(h),
    );
    const noteIdx = headers.findIndex((h) =>
      ["note", "备注", "tags", "标签", "why", "理由"].includes(h),
    );

    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      push(
        cells[emailIdx] ?? "",
        nameIdx >= 0 ? (cells[nameIdx] ?? "") : "",
        companyIdx >= 0 ? (cells[companyIdx] ?? "") : "",
        noteIdx >= 0 ? (cells[noteIdx] ?? "") : "",
      );
    }
  } else {
    for (const line of lines) {
      const cells = splitCsvLine(line);
      const maybeEmail = cells.find((cell) => isValidEmail(cell)) ?? cells[0] ?? "";
      const rest = cells.filter((cell) => cell !== maybeEmail);
      push(maybeEmail, rest[0] ?? "", rest[1] ?? "", rest.slice(2).join(" "));
    }
  }

  return {
    recipients: recipients.slice(0, limit),
    invalid,
    truncated: recipients.length > limit,
  };
}

function fillBlank(current: string, incoming: string) {
  return current.trim() || incoming.trim();
}

function recipientLanguage(item: Partial<Recipient> | Recipient) {
  return normalizeBloggerLanguage(item.language);
}

function fillLanguage(current: BloggerLanguage | string | undefined, incoming?: string) {
  if (current && isBloggerLanguage(current)) return current;
  return normalizeBloggerLanguage(incoming);
}

export function mergeRecipients(existing: Recipient[], incoming: Recipient[], limit = MAX_GLOBAL_RECIPIENTS) {
  const byEmail = new Map<string, Recipient>();
  for (const item of existing) {
    const email = recipientKey(item.email);
    if (!email || !isValidEmail(email)) continue;
    byEmail.set(email, {
      id: item.id || email,
      email,
      name: item.name.trim(),
      company: item.company.trim(),
      note: item.note.trim(),
      language: recipientLanguage(item),
    });
  }

  let added = 0;
  let filled = 0;
  for (const item of incoming) {
    const email = recipientKey(item.email);
    if (!email || !isValidEmail(email)) continue;
    const current = byEmail.get(email);
    if (!current) {
      byEmail.set(email, {
        id: item.id || email,
        email,
        name: item.name.trim(),
        company: item.company.trim(),
        note: item.note.trim(),
        language: recipientLanguage(item),
      });
      added += 1;
      continue;
    }
    const next: Recipient = {
      ...current,
      name: fillBlank(current.name, item.name),
      company: fillBlank(current.company, item.company),
      note: fillBlank(current.note, item.note),
      language: fillLanguage(current.language, item.language),
    };
    if (
      next.name !== current.name ||
      next.company !== current.company ||
      next.note !== current.note ||
      next.language !== current.language
    ) {
      filled += 1;
      byEmail.set(email, next);
    }
  }

  const recipients = [...byEmail.values()];
  return {
    recipients: recipients.slice(0, limit),
    added,
    filled,
    truncated: recipients.length > limit,
  };
}

export function toCsv(recipients: Recipient[]) {
  const header = "email,name,channel,note";
  const rows = recipients.map((item) =>
    [item.email, item.name, item.company, item.note]
      .map((value) => {
        if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
        return value;
      })
      .join(","),
  );
  return [header, ...rows].join("\n");
}

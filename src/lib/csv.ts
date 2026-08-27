import type { Recipient } from "@/lib/types";
import { MAX_RECIPIENTS } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim().toLowerCase());
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

function makeId(email: string, index: number) {
  return `${email.toLowerCase()}-${index}`;
}

export type ParseResult = {
  recipients: Recipient[];
  invalid: string[];
  truncated: boolean;
};

export function parseRecipientText(raw: string): ParseResult {
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
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    if (!isValidEmail(normalized)) {
      invalid.push(email);
      return;
    }
    if (seen.has(normalized)) return;
    seen.add(normalized);
    recipients.push({
      id: makeId(normalized, recipients.length),
      email: normalized,
      name: name.trim(),
      company: company.trim(),
      note: note.trim(),
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
    recipients: recipients.slice(0, MAX_RECIPIENTS),
    invalid,
    truncated: recipients.length > MAX_RECIPIENTS,
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

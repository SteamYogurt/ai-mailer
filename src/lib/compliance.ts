import type { Campaign } from "@/lib/types";

export function requestOrigin(request: Request) {
  const header = request.headers.get("origin") || request.headers.get("x-forwarded-host");
  if (header?.startsWith("http")) return header;
  if (header) {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${header}`;
  }
  return new URL(request.url).origin;
}

function compactIdentity(campaign: Campaign) {
  return [campaign.companyName, campaign.brand ? `《${campaign.brand}》` : ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

function isSignatureLine(line: string, campaign: Campaign) {
  const text = line.trim();
  if (!text) return true;
  if (text.length > 48) return false;
  if (/^[—\-–_]{2,}$/.test(text)) return true;

  const name = campaign.senderName.trim();
  const company = campaign.companyName.trim();
  const brand = campaign.brand.trim();
  const identity = compactIdentity(campaign);
  const candidates = [
    name,
    company,
    brand,
    brand ? `《${brand}》` : "",
    identity,
    [name, company].filter(Boolean).join(" "),
    [name, company].filter(Boolean).join(" · "),
  ].filter(Boolean);

  return candidates.some((item) => text === item);
}

export function stripTrailingSignature(body: string, campaign: Campaign) {
  const lines = body.replace(/\s+$/, "").split(/\r?\n/);
  while (lines.length > 0 && isSignatureLine(lines[lines.length - 1] ?? "", campaign)) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

export function withFooter(body: string, campaign: Campaign) {
  const core = stripTrailingSignature(body, campaign);
  const footer = ["——", campaign.senderName.trim(), compactIdentity(campaign)].filter(Boolean).join("\n");
  if (!core) return footer;
  return `${core}\n\n${footer}`;
}

export function looksDeceptive(subject: string) {
  const lowered = subject.toLowerCase();
  const banned = ["中奖", "紧急汇款", "验证码", "账号异常", "invoice attached", "wire transfer"];
  return banned.some((item) => lowered.includes(item));
}

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

export function withFooter(body: string, campaign: Campaign) {
  const footer = [
    "——",
    campaign.senderName,
    [campaign.companyName, campaign.brand ? `《${campaign.brand}》` : ""]
      .filter(Boolean)
      .join(" · "),
  ]
    .filter(Boolean)
    .join("\n");
  if (body.includes(campaign.senderName) && body.trim().endsWith(campaign.senderName)) {
    return body.trim();
  }
  return `${body.trim()}\n\n${footer}`;
}

export function looksDeceptive(subject: string) {
  const lowered = subject.toLowerCase();
  const banned = ["中奖", "紧急汇款", "验证码", "账号异常", "invoice attached", "wire transfer"];
  return banned.some((item) => lowered.includes(item));
}

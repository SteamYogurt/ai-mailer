import type { Draft } from "@/lib/types";

export function mergeDrafts(existing: Draft[], incoming: Draft[]): Draft[] {
  const incomingByEmail = new Map(incoming.map((draft) => [draft.email.toLowerCase(), draft]));
  const seen = new Set<string>();
  const merged: Draft[] = [];
  for (const draft of existing) {
    const email = draft.email.toLowerCase();
    merged.push(incomingByEmail.get(email) ?? draft);
    seen.add(email);
  }
  for (const draft of incoming) {
    const email = draft.email.toLowerCase();
    if (seen.has(email)) continue;
    merged.push(draft);
    seen.add(email);
  }
  return merged;
}

export function withoutSentDrafts(drafts: Draft[], sentEmails: Iterable<string>) {
  const sent = new Set([...sentEmails].map((email) => email.trim().toLowerCase()));
  if (sent.size === 0) return drafts;
  return drafts.filter((draft) => !sent.has(draft.email.toLowerCase()));
}

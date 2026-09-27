"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  PenLine,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
} from "lucide-react";

import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseRecipientText, toCsv } from "@/lib/csv";
import { mergeDrafts, withoutSentDrafts } from "@/lib/drafts";
import { parseKeyText } from "@/lib/keys";
import { emptyGame, toneLabel } from "@/lib/sample";
import { smtpPresets, type SmtpPresetId } from "@/lib/smtp-presets";
import {
  BLOGGER_LANGUAGES,
  DEFAULT_BLOGGER_LANGUAGE,
  MAX_GLOBAL_RECIPIENTS,
  MAX_RECIPIENTS,
  MAX_SMTP_BATCH,
  bloggerLanguageLabel,
  normalizeBloggerLanguage,
  type BloggerLanguage,
  type Campaign,
  type Draft,
  type GameRecord,
  type InboxMessage,
  type Recipient,
  type SendMode,
  type SmtpConfig,
  type Tone,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const steps = [
  { id: 1, label: "游戏" },
  { id: 2, label: "博主" },
  { id: 3, label: "信件" },
  { id: 4, label: "发出" },
] as const;

type SendCountPreset = "unsent" | "once" | "twice" | "threePlus" | "all" | "custom";

function campaignOf(game: GameRecord): Campaign {
  return {
    brand: game.brand,
    overview: game.overview,
    offer: game.offer,
    ctaLabel: game.ctaLabel,
    ctaUrl: game.ctaUrl,
    tone: game.tone,
    senderName: game.senderName,
    senderEmail: game.senderEmail,
    companyName: game.companyName,
    extraInstructions: game.extraInstructions,
  };
}

function recipientsForDrafts(drafts: Draft[], roster: Recipient[]): Recipient[] {
  const byEmail = new Map(roster.map((item) => [item.email, item]));
  return drafts.map((draft) => {
    const email = draft.email.toLowerCase();
    return (
      byEmail.get(email) ?? {
        id: email,
        email,
        name: draft.name,
        company: "",
        note: "",
        language: DEFAULT_BLOGGER_LANGUAGE,
      }
    );
  });
}

export function Studio() {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [game, setGame] = useState<GameRecord | null>(null);
  const [step, setStep] = useState(1);
  const [parseWarning, setParseWarning] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<SendMode>("smtp");
  const [smtpPreset, setSmtpPreset] = useState<SmtpPresetId>("qq");
  const [smtp, setSmtp] = useState<SmtpConfig>({
    host: smtpPresets.qq.host,
    port: smtpPresets.qq.port,
    secure: smtpPresets.qq.secure,
    user: "",
    pass: "",
  });
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [lastSend, setLastSend] = useState<{
    sent: number;
    failed: number;
    mode: SendMode;
    results: InboxMessage[];
  } | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientCsv, setRecipientCsv] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [bloggersQuery, setBloggersQuery] = useState("");
  const [uploadLanguage, setUploadLanguage] = useState<BloggerLanguage>(DEFAULT_BLOGGER_LANGUAGE);
  const [bloggersLanguage, setBloggersLanguage] = useState<BloggerLanguage | "all">("all");
  const [sendCountMin, setSendCountMin] = useState(0);
  const [sendCountMax, setSendCountMax] = useState<number | null>(0);
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(20);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const saveTimer = useRef<number | null>(null);

  const drafts = game?.drafts ?? [];
  const includedDrafts = drafts.filter((draft) => draft.included);
  const activeDraft = drafts.find((draft) => draft.recipientId === activeDraftId) ?? drafts[0];

  async function refreshGames(preferredId?: string) {
    const response = await fetch("/api/games");
    const data = await response.json();
    const list = (data.games ?? []) as GameRecord[];
    setGames(list);
    const next =
      list.find((item) => item.id === preferredId) ??
      list.find((item) => item.id === data.activeId) ??
      list[0] ??
      emptyGame();
    setGame(next);
    if (next.drafts[0]) setActiveDraftId(next.drafts[0].recipientId);
    return next;
  }

  function persist(next: GameRecord, immediate = false) {
    setGame(next);
    setGames((current) => current.map((item) => (item.id === next.id ? next : item)));
    const run = async () => {
      try {
        const response = await fetch("/api/games", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: next }),
        });
        if (!response.ok) throw new Error("保存失败");
        return true;
      } catch {
        toast.error("游戏数据没存上，请再点一次保存");
        return false;
      }
    };
    if (immediate) return run();
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void run(), 500);
  }

  function patch<K extends keyof GameRecord>(key: K, value: GameRecord[K]) {
    if (!game) return;
    persist({ ...game, [key]: value });
  }

  async function refreshRecipients() {
    const response = await fetch("/api/recipients");
    const data = await response.json();
    const list = (data.recipients ?? []) as Recipient[];
    setRecipients(list);
    setRecipientCsv(typeof data.csv === "string" ? data.csv : toCsv(list));
    return list;
  }

  async function refreshInbox() {
    const response = await fetch("/api/inbox");
    const data = await response.json();
    setInbox((data.messages ?? []) as InboxMessage[]);
  }

  useEffect(() => {
    void Promise.all([
      refreshGames(),
      refreshRecipients(),
      refreshInbox(),
      fetch("/api/smtp").then((response) => response.json()),
      fetch("/api/settings").then((response) => response.json()),
    ]).then(([, , , smtpData, settings]) => {
      if (smtpData.smtp) {
        setSmtp(smtpData.smtp);
        const match = (Object.keys(smtpPresets) as SmtpPresetId[]).find(
          (id) => smtpPresets[id].host === smtpData.smtp.host,
        );
        if (match) setSmtpPreset(match);
      }
      setAiConfigured(Boolean(settings.configured));
    });
  }, []);

  async function applyCsv(raw: string) {
    const preview = parseRecipientText(raw, uploadLanguage);
    const response = await fetch("/api/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: raw, language: uploadLanguage }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || "名单没存上");
      return;
    }
    const list = (data.recipients ?? []) as Recipient[];
    setRecipients(list);
    setRecipientCsv(typeof data.csv === "string" ? data.csv : toCsv(list));
    setParseWarning(
      [
        preview.invalid.length ? `${preview.invalid.length} 条无效邮箱已忽略` : "",
        data.truncated ? `已截断到 ${MAX_GLOBAL_RECIPIENTS} 人` : "",
        data.filled ? `${data.filled} 条用新数据补全了空字段` : "",
      ]
        .filter(Boolean)
        .join("；"),
    );
    if (list.length === 0) {
      toast.error("没有有效联系人");
      return;
    }
    const added = Number(data.added) || 0;
    if (added > 0) toast.success(`名单现有 ${list.length} 人，新增 ${added} 人`);
    else toast.success(`名单现有 ${list.length} 人，已按邮箱去重`);
  }

  async function persistRecipients(next: Recipient[]) {
    setRecipients(next);
    setRecipientCsv(toCsv(next));
    const response = await fetch("/api/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: next, replace: true }),
    });
    if (!response.ok) toast.error("名单没存上，请再试一次");
  }

  function addKeys(raw: string) {
    if (!game) return;
    const incoming = parseKeyText(raw);
    if (incoming.length === 0) {
      toast.error("没有读到密钥");
      return;
    }
    const seen = new Set(game.keys);
    const merged = [...game.keys];
    for (const key of incoming) {
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(key);
      }
    }
    persist({ ...game, keys: merged }, true);
    toast.success(`密钥池现有 ${merged.length} 个`);
  }

  async function generate(targets?: Recipient[]) {
    if (!game) return;
    const chosen = targets ?? selectedRecipients;
    if (chosen.length === 0) {
      toast.error("请先勾选要写信的人");
      return;
    }
    if (chosen.length > MAX_RECIPIENTS) {
      toast.error(`单次最多生成 ${MAX_RECIPIENTS} 封`);
      return;
    }
    setGenerating(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          campaign: campaignOf(game),
          recipients: chosen,
          attachKeys: game.attachKeys,
          keysPerEmail: game.keysPerEmail,
          keys: game.keys,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败");
      const incoming = (data.drafts ?? []) as Draft[];
      const merged = mergeDrafts(game.drafts, incoming);
      persist(
        {
          ...game,
          drafts: merged,
          keys: data.remainingKeys ?? game.keys,
        },
        true,
      );
      setActiveDraftId(incoming[0]?.recipientId ?? merged[0]?.recipientId ?? null);
      setStep(3);
      toast.success(
        game.drafts.length > 0 && merged.length > incoming.length
          ? `已生成 ${incoming.length} 封，本游戏现有 ${merged.length} 封草稿`
          : `已生成 ${incoming.length} 封草稿`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function send(queue?: Draft[]) {
    if (!game) return;
    const outgoing = (queue ?? includedDrafts).filter((draft) => draft.included);
    if (outgoing.length === 0) {
      toast.error("没有可发送的草稿");
      return;
    }
    setLastSend(null);
    setSending(true);
    try {
      const smtpSave = await fetch("/api/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smtp),
      });
      if (!smtpSave.ok) throw new Error("邮箱信息没存上");
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: { ...campaignOf(game), senderEmail: smtp.user },
          drafts: outgoing,
          mode,
          smtp,
          gameId: game.id,
          gameName: game.brand,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发送失败");
      const summary = {
        sent: Number(data.sent) || 0,
        failed: Number(data.failed) || 0,
        mode,
        results: (data.results ?? []) as InboxMessage[],
      };
      setLastSend(summary);
      const sentEmails = summary.results
        .filter((item) => item.status === "sent")
        .map((item) => item.to);
      if (sentEmails.length > 0) {
        const nextDrafts = withoutSentDrafts(drafts, sentEmails);
        await persist({ ...game, drafts: nextDrafts }, true);
        if (activeDraft && sentEmails.some((email) => email.toLowerCase() === activeDraft.email.toLowerCase())) {
          setActiveDraftId(nextDrafts[0]?.recipientId ?? null);
        }
      }
      await refreshInbox();
      if (summary.failed && !summary.sent) {
        toast.error(`发送失败：${summary.results[0]?.error || `${summary.failed} 封都没发出`}`);
      } else if (summary.failed) {
        toast.error(`发出 ${summary.sent} 封，失败 ${summary.failed} 封。成功的草稿已删除，可等几分钟后重发失败的。`);
      } else {
        toast.success(
          mode === "smtp"
            ? `已从邮箱发出 ${summary.sent} 封，对应草稿已删除`
            : `已写入 ${summary.sent} 封记录（未真发），对应草稿已删除`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function retryFailed() {
    if (!game || !lastSend) return;
    const failed = new Set(
      lastSend.results.filter((item) => item.status === "failed").map((item) => item.to.toLowerCase()),
    );
    const nextDrafts = drafts.map((draft) => ({
      ...draft,
      included: failed.has(draft.email.toLowerCase()),
    }));
    await persist({ ...game, drafts: nextDrafts }, true);
    await send(nextDrafts.filter((draft) => draft.included));
  }

  function removeDraft(recipientId: string) {
    if (!game) return;
    const nextDrafts = drafts.filter((draft) => draft.recipientId !== recipientId);
    persist({ ...game, drafts: nextDrafts }, true);
    if (activeDraftId === recipientId) {
      setActiveDraftId(nextDrafts[0]?.recipientId ?? null);
    }
  }

  function clearDrafts() {
    if (!game || drafts.length === 0) return;
    if (!confirm(`清空当前游戏的 ${drafts.length} 封草稿？博主名单和发信记录不会删。`)) return;
    persist({ ...game, drafts: [] }, true);
    setActiveDraftId(null);
    toast.success("已清空草稿");
  }

  const sendCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!game) return counts;
    for (const item of inbox) {
      if (item.gameId !== game.id || item.status !== "sent") continue;
      const email = item.to.toLowerCase();
      counts.set(email, (counts.get(email) ?? 0) + 1);
    }
    return counts;
  }, [inbox, game]);

  const sendCountPreset = useMemo<SendCountPreset>(() => {
    if (sendCountMin === 0 && sendCountMax === 0) return "unsent";
    if (sendCountMin === 1 && sendCountMax === 1) return "once";
    if (sendCountMin === 2 && sendCountMax === 2) return "twice";
    if (sendCountMin === 3 && sendCountMax === null) return "threePlus";
    if (sendCountMin === 0 && sendCountMax === null) return "all";
    return "custom";
  }, [sendCountMin, sendCountMax]);

  function applySendCountPreset(preset: Exclude<SendCountPreset, "custom">) {
    if (preset === "unsent") {
      setSendCountMin(0);
      setSendCountMax(0);
    } else if (preset === "once") {
      setSendCountMin(1);
      setSendCountMax(1);
    } else if (preset === "twice") {
      setSendCountMin(2);
      setSendCountMax(2);
    } else if (preset === "threePlus") {
      setSendCountMin(3);
      setSendCountMax(null);
    } else {
      setSendCountMin(0);
      setSendCountMax(null);
    }
  }

  const languageCounts = useMemo(() => {
    const counts = Object.fromEntries(BLOGGER_LANGUAGES.map((lang) => [lang, 0])) as Record<
      BloggerLanguage,
      number
    >;
    for (const item of recipients) {
      counts[normalizeBloggerLanguage(item.language)] += 1;
    }
    return counts;
  }, [recipients]);

  const filteredRecipients = useMemo(() => {
    const q = bloggersQuery.trim().toLowerCase();
    const min = sendCountMax === null ? sendCountMin : Math.min(sendCountMin, sendCountMax);
    const max = sendCountMax === null ? null : Math.max(sendCountMin, sendCountMax);
    return recipients.filter((item) => {
      const language = normalizeBloggerLanguage(item.language);
      if (bloggersLanguage !== "all" && language !== bloggersLanguage) return false;
      const times = sendCounts.get(item.email) ?? 0;
      if (times < min) return false;
      if (max !== null && times > max) return false;
      if (!q) return true;
      return [item.email, item.name, item.company, item.note, bloggerLanguageLabel[language]].some(
        (value) => value.toLowerCase().includes(q),
      );
    });
  }, [recipients, bloggersQuery, bloggersLanguage, sendCounts, sendCountMin, sendCountMax]);

  const rangedRecipients = useMemo(() => {
    const from = Math.max(1, rangeFrom);
    const to = Math.max(from, rangeTo);
    return filteredRecipients.slice(from - 1, to);
  }, [filteredRecipients, rangeFrom, rangeTo]);

  const selectedRecipients = useMemo(() => {
    const chosen = new Set(selectedEmails);
    return recipients.filter((item) => chosen.has(item.email));
  }, [recipients, selectedEmails]);

  const allVisibleSelected =
    rangedRecipients.length > 0 && rangedRecipients.every((item) => selectedEmails.includes(item.email));

  function toggleSelected(email: string, checked: boolean) {
    setSelectedEmails((current) => {
      if (checked) return current.includes(email) ? current : [...current, email];
      return current.filter((item) => item !== email);
    });
  }

  function selectEmails(emails: string[]) {
    setSelectedEmails(emails);
  }

  const canGenerate = useMemo(() => {
    if (!game) return false;
    return Boolean(
      selectedRecipients.length &&
        game.brand &&
        game.overview &&
        game.offer &&
        game.senderName &&
        game.companyName &&
        game.ctaUrl,
    );
  }, [game, selectedRecipients.length]);

  if (!game) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        读取本地游戏数据…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Select
            value={game.id}
            onValueChange={(id) => {
              if (!id) return;
              const next = games.find((item) => item.id === id);
              if (next) {
                persist(game, true);
                void fetch("/api/games", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id }),
                });
                setGame(next);
                setActiveDraftId(next.drafts[0]?.recipientId ?? null);
                setLastSend(null);
              }
            }}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {games.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.brand || "未命名游戏"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={async () => {
              persist(game, true);
              try {
                const response = await fetch("/api/games", { method: "PUT" });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "新建失败");
                await refreshGames(data.game.id);
                setStep(1);
                setLastSend(null);
                toast.success("已新建游戏");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "新建失败");
              }
            }}
          >
            <Plus />
            新游戏
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!confirm("删除这个游戏的配置、草稿和密钥？全局博主名单和发信记录仍会保留。")) return;
              const response = await fetch(`/api/games?id=${game.id}`, { method: "DELETE" });
              const data = await response.json();
              if (!response.ok) {
                toast.error(data.error || "删除失败");
                return;
              }
              setGames(data.games ?? []);
              await refreshGames(data.activeId);
              setLastSend(null);
              toast.success("已删除这个游戏");
            }}
          >
            <Trash2 />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">数据存在 userdata/，不含发信邮箱；邮箱在第 4 步单独保存。</p>
      </div>

      <nav className="grid grid-cols-4 gap-2">
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStep(item.id)}
            className={cn(
              "rounded-2xl px-3 py-3 text-left ring-1",
              step === item.id
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-card ring-foreground/10 hover:bg-accent",
            )}
          >
            <div className="text-[11px] opacity-70">0{item.id}</div>
            <div className="font-heading">{item.label}</div>
          </button>
        ))}
      </nav>

      {step === 1 ? (
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <h2 className="font-heading text-xl">游戏资料</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="游戏名">
                <Input value={game.brand} onChange={(e) => patch("brand", e.target.value)} />
              </Field>
              <Field label="工作室名">
                <Input value={game.companyName} onChange={(e) => patch("companyName", e.target.value)} />
              </Field>
              <Field label="游戏概览" className="sm:col-span-2">
                <Textarea
                  rows={5}
                  value={game.overview}
                  onChange={(e) => patch("overview", e.target.value)}
                  placeholder="玩法、时长、适合什么样的频道，以及可能打动博主的点。"
                />
              </Field>
              <Field label="希望博主做什么" className="sm:col-span-2">
                <Textarea rows={3} value={game.offer} onChange={(e) => patch("offer", e.target.value)} />
              </Field>
              <Field label="行动说明">
                <Input value={game.ctaLabel} onChange={(e) => patch("ctaLabel", e.target.value)} />
              </Field>
              <Field label="Steam / itch / Demo 链接">
                <Input value={game.ctaUrl} onChange={(e) => patch("ctaUrl", e.target.value)} />
              </Field>
              <Field label="语气">
                <Select value={game.tone} onValueChange={(value) => value && patch("tone", value as Tone)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(toneLabel) as Tone[]).map((tone) => (
                      <SelectItem key={tone} value={tone}>
                        {toneLabel[tone]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="你的名字">
                <Input value={game.senderName} onChange={(e) => patch("senderName", e.target.value)} />
              </Field>
              <Field label="给 AI 的额外要求" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={game.extraInstructions}
                  onChange={(e) => patch("extraInstructions", e.target.value)}
                />
              </Field>
            </div>
            <Button
              className="mt-4"
              variant="outline"
              onClick={async () => {
                const ok = await persist(game, true);
                if (ok) toast.success("已保存");
              }}
            >
              <Save />
              保存这个游戏
            </Button>
          </div>
          <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-lg">游戏密钥</h3>
              <Badge variant="secondary">{game.keys.length} 个未用</Badge>
            </div>
            <p className="text-sm text-muted-foreground">每行一个 Key。生成信件时可让 AI 附上。</p>
            <label className={cn(buttonVariants({ variant: "outline" }), "mt-3 cursor-pointer")}>
              <Upload />
              上传 CSV / TXT
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  addKeys(await file.text());
                  event.target.value = "";
                }}
              />
            </label>
            <Textarea
              className="mt-3 min-h-36 font-mono text-xs"
              placeholder={"XXXXX-XXXXX-XXXXX"}
              onBlur={(event) => {
                if (event.target.value.trim()) addKeys(event.target.value);
              }}
            />
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={game.attachKeys}
                onCheckedChange={(checked) => patch("attachKeys", Boolean(checked))}
              />
              <span className="flex-1">
                生成时让 AI 在每封邮件里附上
                <Input
                  className="mx-2 inline-flex h-7 w-14"
                  type="number"
                  min={1}
                  max={5}
                  value={game.keysPerEmail}
                  onChange={(e) => patch("keysPerEmail", Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
                />
                份密钥
              </span>
            </label>
            {game.keys.length > 0 ? (
              <Button className="mt-3" variant="ghost" onClick={() => persist({ ...game, keys: [] }, true)}>
                清空密钥池
              </Button>
            ) : null}
            <Button className="mt-6 h-11 w-full rounded-full" onClick={() => setStep(2)}>
              下一步：博主
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <h2 className="font-heading text-xl">全局博主名单</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              CSV 不用改，仍是 email,name,channel,note。语言只在网页上选，这批新人会记成该语言。所有游戏共用，按邮箱自动去重；重复导入只补空字段，已有语言不会被覆盖。删人请用右侧表格。
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="这批语言">
                <Select
                  value={uploadLanguage}
                  onValueChange={(value) => {
                    if (!value) return;
                    setUploadLanguage(normalizeBloggerLanguage(value));
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue>{bloggerLanguageLabel[uploadLanguage]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BLOGGER_LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {bloggerLanguageLabel[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
                <Upload />
                上传 CSV
                <input
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    await applyCsv(text);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <Textarea
              className="mt-4 min-h-48 font-mono text-xs"
              value={recipientCsv}
              onChange={(event) => setRecipientCsv(event.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void applyCsv(recipientCsv)}>解析并合并</Button>
              <Button variant="ghost" onClick={() => setStep(1)}>
                返回游戏
              </Button>
              {recipients.length > 0 ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("清空全局博主名单？各游戏的草稿和发信记录不会删。")) return;
                    await persistRecipients([]);
                    setSelectedEmails([]);
                    toast.success("已清空名单");
                  }}
                >
                  清空名单
                </Button>
              ) : null}
            </div>
            {parseWarning ? <p className="mt-3 text-sm text-destructive">{parseWarning}</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">
              全局 {recipients.length} 人，上限 {MAX_GLOBAL_RECIPIENTS}。
            </p>
          </div>
          <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-heading text-lg">这次写信给谁</h3>
              <Badge variant="secondary">已勾选 {selectedRecipients.length}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="relative sm:col-span-2">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="搜索邮箱、姓名、频道"
                  value={bloggersQuery}
                  onChange={(event) => setBloggersQuery(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="最少次数">
                  <Input
                    type="number"
                    min={0}
                    value={sendCountMin}
                    onChange={(event) => setSendCountMin(Math.max(0, Number(event.target.value) || 0))}
                  />
                </Field>
                <Field label="最多次数">
                  <Input
                    type="number"
                    min={0}
                    placeholder="不限"
                    value={sendCountMax ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (raw === "") {
                        setSendCountMax(null);
                        return;
                      }
                      setSendCountMax(Math.max(0, Number(raw) || 0));
                    }}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="从第">
                  <Input
                    type="number"
                    min={1}
                    value={rangeFrom}
                    onChange={(event) => setRangeFrom(Math.max(1, Number(event.target.value) || 1))}
                  />
                </Field>
                <Field label="到第">
                  <Input
                    type="number"
                    min={1}
                    value={rangeTo}
                    onChange={(event) => setRangeTo(Math.max(1, Number(event.target.value) || 1))}
                  />
                </Field>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={bloggersLanguage === "all" ? "default" : "outline"}
                onClick={() => setBloggersLanguage("all")}
              >
                全部 {recipients.length}
              </Button>
              {BLOGGER_LANGUAGES.map((lang) => (
                <Button
                  key={lang}
                  size="sm"
                  variant={bloggersLanguage === lang ? "default" : "outline"}
                  onClick={() => setBloggersLanguage(lang)}
                >
                  {bloggerLanguageLabel[lang]} {languageCounts[lang]}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["unsent", "未发过"],
                  ["once", "1 次"],
                  ["twice", "2 次"],
                  ["threePlus", "≥ 3 次"],
                  ["all", "全部"],
                ] as const
              ).map(([preset, label]) => (
                <Button
                  key={preset}
                  size="sm"
                  variant={sendCountPreset === preset ? "default" : "outline"}
                  onClick={() => applySendCountPreset(preset)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRangeFrom(1);
                  setRangeTo(20);
                  selectEmails(filteredRecipients.slice(0, 20).map((item) => item.email));
                }}
              >
                前 20 个
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectEmails(rangedRecipients.map((item) => item.email))}
              >
                勾选当前范围
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRangeFrom(1);
                  setRangeTo(Math.max(1, filteredRecipients.length));
                  selectEmails(filteredRecipients.map((item) => item.email));
                }}
              >
                勾选全部筛选
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedEmails([])}>
                清空勾选
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              筛选后 {filteredRecipients.length} 人，当前范围 {rangedRecipients.length} 人。次数按当前游戏成功发出的记录统计。单次最多生成{" "}
              {MAX_RECIPIENTS} 封。
            </p>
            {recipients.length === 0 ? (
              <div className="mt-3 flex min-h-40 flex-col items-center justify-center rounded-2xl bg-muted/60 text-sm text-muted-foreground">
                <AlertCircle className="mb-2 size-5" />
                还没有联系人
              </div>
            ) : rangedRecipients.length === 0 ? (
              <div className="mt-3 flex min-h-40 flex-col items-center justify-center rounded-2xl bg-muted/60 text-sm text-muted-foreground">
                当前筛选没有人
              </div>
            ) : (
              <div className="mt-3 max-h-[360px] overflow-auto rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const next = new Set(selectedEmails);
                              for (const item of rangedRecipients) next.add(item.email);
                              setSelectedEmails([...next]);
                            } else {
                              const hide = new Set(rangedRecipients.map((item) => item.email));
                              setSelectedEmails(selectedEmails.filter((email) => !hide.has(email)));
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>博主</TableHead>
                      <TableHead className="w-14">语言</TableHead>
                      <TableHead className="w-16">次数</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rangedRecipients.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEmails.includes(item.email)}
                            onCheckedChange={(checked) => toggleSelected(item.email, Boolean(checked))}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.email}</TableCell>
                        <TableCell>{item.name || item.company || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {bloggerLanguageLabel[normalizeBloggerLanguage(item.language)]}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const times = sendCounts.get(item.email) ?? 0;
                            return times > 0 ? (
                              <Badge variant="secondary">{times} 次</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">未发</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={async () => {
                              const next = recipients.filter((row) => row.email !== item.email);
                              await persistRecipients(next);
                              setSelectedEmails((current) => current.filter((email) => email !== item.email));
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Button
              size="lg"
              className="mt-4 h-11 w-full rounded-full"
              disabled={!canGenerate || generating || aiConfigured === false || selectedRecipients.length > MAX_RECIPIENTS}
              onClick={() => void generate()}
            >
              {generating ? <Loader2 className="animate-spin" /> : <PenLine />}
              {generating ? "正在生成…" : `为已勾选的 ${selectedRecipients.length} 人生成草稿`}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg">草稿</h2>
              {drafts.length > 0 ? (
                <Button size="xs" variant="ghost" onClick={clearDrafts}>
                  清空草稿
                </Button>
              ) : null}
            </div>
            {drafts.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">还没有草稿。</p>
            ) : (
              <div className="mt-2 flex max-h-[540px] flex-col gap-1 overflow-auto">
                {drafts.map((draft) => (
                  <div
                    key={draft.recipientId}
                    className={cn(
                      "flex items-center gap-0.5 rounded-xl",
                      activeDraft?.recipientId === draft.recipientId ? "bg-accent" : "hover:bg-muted",
                      !draft.included && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveDraftId(draft.recipientId)}
                      className="min-w-0 flex-1 rounded-xl px-3 py-2 text-left text-sm"
                    >
                      <div className="truncate font-medium">{draft.name || draft.email}</div>
                      <div className="truncate text-xs text-muted-foreground">{draft.subject}</div>
                    </button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="mr-1"
                      onClick={() => {
                        if (!confirm("删除这封草稿？")) return;
                        removeDraft(draft.recipientId);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {activeDraft ? (
            <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-xl">写给 {activeDraft.name || activeDraft.email}</h3>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={activeDraft.included}
                    onCheckedChange={(checked) =>
                      persist({
                        ...game,
                        drafts: drafts.map((draft) =>
                          draft.recipientId === activeDraft.recipientId
                            ? { ...draft, included: Boolean(checked) }
                            : draft,
                        ),
                      })
                    }
                  />
                  纳入发送
                </label>
              </div>
              {activeDraft.keys?.length ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <KeyRound className="size-3.5" />
                  已附密钥 {activeDraft.keys.length} 份
                </p>
              ) : null}
              <Field label="主题" className="mt-4">
                <Input
                  value={activeDraft.subject}
                  onChange={(event) =>
                    persist({
                      ...game,
                      drafts: drafts.map((draft) =>
                        draft.recipientId === activeDraft.recipientId
                          ? { ...draft, subject: event.target.value }
                          : draft,
                      ),
                    })
                  }
                />
              </Field>
              <Textarea
                className="mt-3 min-h-[320px]"
                value={activeDraft.body}
                onChange={(event) =>
                  persist({
                    ...game,
                    drafts: drafts.map((draft) =>
                      draft.recipientId === activeDraft.recipientId
                        ? { ...draft, body: event.target.value }
                        : draft,
                    ),
                  })
                }
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={generating || drafts.length === 0}
                  onClick={() => void generate(recipientsForDrafts(drafts, recipients))}
                >
                  {generating ? "正在生成…" : "重新生成"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!confirm("删除这封草稿？")) return;
                    removeDraft(activeDraft.recipientId);
                  }}
                >
                  删除这篇
                </Button>
                <Button variant="ghost" onClick={clearDrafts}>
                  清空草稿
                </Button>
                <Button className="rounded-full" disabled={includedDrafts.length === 0} onClick={() => setStep(4)}>
                  去发出（{includedDrafts.length} 封）
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 4 ? (
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <h2 className="font-heading text-xl">发出</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              默认从你的邮箱真发。发件人必须和 SMTP 账号相同。单次最多 {MAX_SMTP_BATCH} 封。QQ
              会复用同一条登录，并在每封之间留几秒间隔，避免 535 限频。
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <Label>模拟写入记录（不经过邮局）</Label>
              <Switch checked={mode === "simulate"} onCheckedChange={(checked) => setMode(checked ? "simulate" : "smtp")} />
            </div>
            {mode === "smtp" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="邮局" className="sm:col-span-2">
                  <Select
                    value={smtpPreset}
                    onValueChange={(value) => {
                      if (!value) return;
                      const id = value as SmtpPresetId;
                      const preset = smtpPresets[id];
                      setSmtpPreset(id);
                      setSmtp((current) => ({
                        ...current,
                        host: preset.host || current.host,
                        port: preset.port,
                        secure: preset.secure,
                      }));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(smtpPresets) as SmtpPresetId[]).map((id) => (
                        <SelectItem key={id} value={id}>
                          {smtpPresets[id].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="SMTP 主机">
                  <Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
                </Field>
                <Field label="端口">
                  <Input
                    type="number"
                    value={smtp.port}
                    onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) || 587 })}
                  />
                </Field>
                <Field label="邮箱账号" className="sm:col-span-2">
                  <Input
                    value={smtp.user}
                    onChange={(e) => {
                      const user = e.target.value;
                      setSmtp({ ...smtp, user });
                      persist({ ...game, senderEmail: user.trim() });
                    }}
                  />
                </Field>
                <Field label="授权码" className="sm:col-span-2">
                  <Input
                    type="password"
                    value={smtp.pass}
                    onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox
                    checked={smtp.secure}
                    onCheckedChange={(checked) => setSmtp({ ...smtp, secure: Boolean(checked) })}
                  />
                  使用 SMTPS（465）
                </label>
                <Button
                  variant="outline"
                  disabled={testingSmtp}
                  onClick={async () => {
                    setTestingSmtp(true);
                    try {
                      const response = await fetch("/api/smtp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(smtp),
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error || "连接失败");
                      toast.success("SMTP 可用，已保存");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "连接失败");
                    } finally {
                      setTestingSmtp(false);
                    }
                  }}
                >
                  {testingSmtp ? <Loader2 className="animate-spin" /> : null}
                  测试并保存邮箱
                </Button>
              </div>
            ) : null}
            {mode === "smtp" ? (
              <p className="mt-3 text-xs text-muted-foreground">{smtpPresets[smtpPreset].hint}</p>
            ) : null}
            <Button
              size="lg"
              className="mt-5 h-11 w-full rounded-full"
              disabled={sending || includedDrafts.length === 0}
              onClick={() => void send()}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {sending ? "正在发送…" : mode === "smtp" ? "从我的邮箱发出" : "只写入记录"}
            </Button>
            {lastSend ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  {lastSend.failed === 0 ? (
                    <span>
                      {lastSend.mode === "smtp"
                        ? `已发出 ${lastSend.sent} 封。`
                        : `已写入 ${lastSend.sent} 封记录（未真发）。`}
                    </span>
                  ) : (
                    <span className="text-destructive">
                      成功 {lastSend.sent} 封，失败 {lastSend.failed} 封
                      {lastSend.results.find((item) => item.status === "failed")?.error
                        ? `：${lastSend.results.find((item) => item.status === "failed")?.error}`
                        : "。"}
                    </span>
                  )}{" "}
                  <Link href="/history" className="text-muted-foreground underline">
                    查看记录
                  </Link>
                </p>
                {lastSend.failed > 0 ? (
                  <Button variant="outline" disabled={sending} onClick={() => void retryFailed()}>
                    重发失败的 {lastSend.failed} 封
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <h3 className="font-heading text-lg">本次队列</h3>
            <ul className="mt-3 max-h-[480px] space-y-2 overflow-auto">
              {includedDrafts.map((draft) => {
                const result = lastSend?.results.find(
                  (item) => item.to.toLowerCase() === draft.email.toLowerCase(),
                );
                return (
                  <li key={draft.recipientId} className="rounded-xl bg-muted/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{draft.name || draft.email}</div>
                      {sending ? (
                        <span className="text-xs text-muted-foreground">发送中</span>
                      ) : result ? (
                        <span
                          className={cn(
                            "text-xs",
                            result.status === "sent" ? "text-muted-foreground" : "text-destructive",
                          )}
                        >
                          {result.status === "sent"
                            ? lastSend?.mode === "smtp"
                              ? "已发"
                              : "已记"
                            : "失败"}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{draft.subject}</div>
                    {result?.error ? (
                      <div className="mt-0.5 truncate text-xs text-destructive">{result.error}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

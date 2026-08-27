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
import { parseKeyText } from "@/lib/keys";
import { emptyGame, toneLabel } from "@/lib/sample";
import { smtpPresets, type SmtpPresetId } from "@/lib/smtp-presets";
import {
  MAX_RECIPIENTS,
  MAX_SMTP_BATCH,
  type Campaign,
  type Draft,
  type GameRecord,
  type InboxMessage,
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

  useEffect(() => {
    void Promise.all([
      refreshGames(),
      fetch("/api/smtp").then((response) => response.json()),
      fetch("/api/settings").then((response) => response.json()),
    ]).then(([, smtpData, settings]) => {
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

  function applyCsv(raw: string) {
    if (!game) return;
    const result = parseRecipientText(raw);
    setParseWarning(
      [
        result.invalid.length ? `${result.invalid.length} 条无效邮箱已忽略` : "",
        result.truncated ? `已截断到 ${MAX_RECIPIENTS} 人` : "",
      ]
        .filter(Boolean)
        .join("；"),
    );
    persist(
      { ...game, recipients: result.recipients, recipientCsv: raw },
      true,
    );
    if (result.recipients.length > 0) toast.success(`已读入 ${result.recipients.length} 人`);
    else toast.error("没有有效联系人");
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

  async function generate() {
    if (!game) return;
    setGenerating(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          campaign: campaignOf(game),
          recipients: game.recipients,
          attachKeys: game.attachKeys,
          keysPerEmail: game.keysPerEmail,
          keys: game.keys,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败");
      const next = {
        ...game,
        drafts: data.drafts as Draft[],
        keys: data.remainingKeys ?? game.keys,
      };
      persist(next, true);
      setActiveDraftId(data.drafts[0]?.recipientId ?? null);
      setStep(3);
      toast.success(`已生成 ${data.drafts.length} 封草稿`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function send() {
    if (!game) return;
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
          drafts: includedDrafts,
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
      if (summary.failed && !summary.sent) {
        toast.error(`发送失败：${summary.results[0]?.error || `${summary.failed} 封都没发出`}`);
      } else if (summary.failed) {
        toast.error(`发出 ${summary.sent} 封，失败 ${summary.failed} 封`);
      } else {
        toast.success(
          mode === "smtp" ? `已从邮箱发出 ${summary.sent} 封` : `已写入 ${summary.sent} 封记录（未真发）`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  const canGenerate = useMemo(() => {
    if (!game) return false;
    return Boolean(
      game.recipients.length &&
        game.brand &&
        game.overview &&
        game.offer &&
        game.senderName &&
        game.companyName &&
        game.ctaUrl,
    );
  }, [game]);

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
              if (!confirm("删除这个游戏的全部配置、名单和密钥？发信记录仍会保留。")) return;
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
            <h2 className="font-heading text-xl">博主名单</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              CSV：email,name,channel,note。属于当前游戏，下次打开还会在。
            </p>
            <label className={cn(buttonVariants({ variant: "outline" }), "mt-3 cursor-pointer")}>
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
                  applyCsv(text);
                  event.target.value = "";
                }}
              />
            </label>
            <Textarea
              className="mt-4 min-h-48 font-mono text-xs"
              value={game.recipientCsv}
              onChange={(event) => patch("recipientCsv", event.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <Button onClick={() => applyCsv(game.recipientCsv)}>解析名单</Button>
              <Button variant="ghost" onClick={() => setStep(1)}>
                返回游戏
              </Button>
            </div>
            {parseWarning ? <p className="mt-3 text-sm text-destructive">{parseWarning}</p> : null}
          </div>
          <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-lg">将收到邀请的人</h3>
              <Badge variant="secondary">{game.recipients.length} 人</Badge>
            </div>
            {game.recipients.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl bg-muted/60 text-sm text-muted-foreground">
                <AlertCircle className="mb-2 size-5" />
                还没有联系人
              </div>
            ) : (
              <div className="max-h-[360px] overflow-auto rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>邮箱</TableHead>
                      <TableHead>博主</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {game.recipients.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.email}</TableCell>
                        <TableCell>{item.name || item.company || "—"}</TableCell>
                        <TableCell>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => {
                              const recipients = game.recipients.filter((row) => row.id !== item.id);
                              persist({ ...game, recipients, recipientCsv: toCsv(recipients) }, true);
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
              disabled={!canGenerate || generating || aiConfigured === false}
              onClick={() => void generate()}
            >
              {generating ? <Loader2 className="animate-spin" /> : <PenLine />}
              {generating ? "正在生成…" : "生成草稿"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="font-heading text-lg">草稿</h2>
            {drafts.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">还没有草稿。</p>
            ) : (
              <div className="mt-2 flex max-h-[540px] flex-col gap-1 overflow-auto">
                {drafts.map((draft) => (
                  <button
                    key={draft.recipientId}
                    type="button"
                    onClick={() => setActiveDraftId(draft.recipientId)}
                    className={cn(
                      "rounded-xl px-3 py-2 text-left text-sm",
                      activeDraft?.recipientId === draft.recipientId ? "bg-accent" : "hover:bg-muted",
                      !draft.included && "opacity-50",
                    )}
                  >
                    <div className="truncate font-medium">{draft.name || draft.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{draft.subject}</div>
                  </button>
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
              <div className="mt-4 flex gap-2">
                <Button variant="outline" disabled={generating} onClick={() => void generate()}>
                  {generating ? "正在生成…" : "重新生成"}
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
              默认从你的邮箱真发。发件人必须和 SMTP 账号相同。单次最多 {MAX_SMTP_BATCH} 封。
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
              <p className="mt-3 text-sm">
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

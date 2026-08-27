"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, type AiSettings, type ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AiDesk() {
  const [settings, setSettings] = useState<AiSettings>({
    name: "DeepSeek",
    apiKey: "",
    model: DEFAULT_AI_MODEL,
    baseUrl: DEFAULT_AI_BASE_URL,
  });
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/settings").then((response) => response.json()),
      fetch("/api/chat").then((response) => response.json()),
    ]).then(([saved, chat]) => {
      setSettings({
        name: saved.name || "DeepSeek",
        apiKey: saved.apiKey || "",
        model: saved.model || DEFAULT_AI_MODEL,
        baseUrl: saved.baseUrl || DEFAULT_AI_BASE_URL,
      });
      setConfigured(Boolean(saved.configured));
      setMessages(chat.messages ?? []);
    });
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setConfigured(Boolean(data.configured));
      toast.success("已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);
    setMessages((current) => [
      ...current,
      { id: "temp", role: "user", content, at: new Date().toISOString() },
    ]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "对话失败");
      setMessages(data.messages ?? []);
    } catch (error) {
      setInput(content);
      setMessages((current) => current.filter((item) => item.id !== "temp"));
      toast.error(error instanceof Error ? error.message : "对话失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="paper-desk min-h-full">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[0.9fr_1.1fr] sm:px-6 sm:py-8">
        <section className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
          <h1 className="font-heading text-xl">AI 配置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            写信和这边的对话都用同一套 DeepSeek。已预填 V4 Pro。
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="显示名称">
              <Input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
            </Field>
            <Field label="模型">
              <Input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} />
            </Field>
            <Field label="API 地址">
              <Input value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} />
            </Field>
            <Field label="API Key">
              <Input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {configured ? "已配置，可以写信和对话。" : "还没有 Key。填好后点保存。"} 保存在 userdata，不会进 git。
            </p>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              保存配置
            </Button>
          </div>
        </section>
        <section className="flex min-h-[520px] flex-col rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-xl">{settings.name}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const response = await fetch("/api/chat", { method: "DELETE" });
                if (!response.ok) {
                  toast.error("清空失败");
                  return;
                }
                setMessages([]);
                toast.success("已清空对话");
              }}
            >
              <Trash2 />
              清空对话
            </Button>
          </div>
          <div className="flex-1 space-y-3 overflow-auto rounded-2xl bg-muted/40 p-3">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">随便问，改文案、想标题都可以。</p>
            ) : (
              messages.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-6",
                    item.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-card ring-1 ring-foreground/10",
                  )}
                >
                  {item.content}
                </div>
              ))
            )}
            <div ref={bottom} />
          </div>
          <div className="mt-3 flex gap-2">
            <Textarea
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="输入后回车发送"
            />
            <Button className="self-end" disabled={sending || !input.trim()} onClick={() => void send()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

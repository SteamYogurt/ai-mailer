"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InboxMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function HistoryDesk() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(email?: string) {
    setLoading(true);
    try {
      const url = email ? `/api/inbox?email=${encodeURIComponent(email)}` : "/api/inbox";
      const response = await fetch(url);
      const data = await response.json();
      const list = (data.messages ?? []) as InboxMessage[];
      setMessages(list);
      setActiveId(list[0]?.id ?? null);
    } catch {
      toast.error("无法读取记录");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const active = messages.find((item) => item.id === activeId) ?? messages[0];
  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of messages) {
      map.set(item.to, (map.get(item.to) ?? 0) + 1);
    }
    return map;
  }, [messages]);

  return (
    <div className="paper-desk min-h-full">
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[320px_1fr] sm:px-6 sm:py-8">
        <div className="rounded-3xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="font-heading text-lg">发信记录</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm("清空全部发信记录？")) return;
                const response = await fetch("/api/inbox", { method: "DELETE" });
                if (!response.ok) {
                  toast.error("清空失败");
                  return;
                }
                await load();
                toast.success("已清空记录");
              }}
            >
              <Trash2 />
              清空
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="按博主邮箱查询"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setApplied(query.trim());
                  void load(query.trim() || undefined);
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                setApplied(query.trim());
                void load(query.trim() || undefined);
              }}
            >
              <Search />
            </Button>
          </div>
          {applied ? (
            <p className="mt-2 text-xs text-muted-foreground">
              正在看 {applied}，共 {grouped.get(applied.toLowerCase()) ?? messages.length} 封
              <Button
                className="ml-2 h-auto p-0"
                variant="link"
                onClick={() => {
                  setQuery("");
                  setApplied("");
                  void load();
                }}
              >
                显示全部
              </Button>
            </p>
          ) : null}
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">没有记录</p>
          ) : (
            <div className="mt-3 flex max-h-[620px] flex-col gap-1 overflow-auto">
              {messages.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-1 rounded-xl px-2 py-2",
                    active?.id === item.id ? "bg-accent" : "hover:bg-muted",
                  )}
                >
                  <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => setActiveId(item.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.toName || item.to}</span>
                      <Badge variant={item.status === "sent" ? "default" : "destructive"}>
                        {item.status === "sent" ? (item.mode === "smtp" ? "已发" : "记录") : "失败"}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{item.subject}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.to} · {new Date(item.at).toLocaleString("zh-CN")}
                    </div>
                  </button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={async () => {
                      const response = await fetch(`/api/inbox?id=${item.id}`, { method: "DELETE" });
                      if (!response.ok) {
                        toast.error("删除失败");
                        return;
                      }
                      await load(applied || undefined);
                      toast.success("已删除");
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        {active ? (
          <article className="rounded-3xl bg-card p-6 ring-1 ring-foreground/10">
            <h2 className="font-heading text-2xl">{active.subject}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {active.fromName} &lt;{active.from}&gt; → {active.toName} &lt;{active.to}&gt;
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(active.at).toLocaleString("zh-CN")}
              {active.gameName ? ` · ${active.gameName}` : ""}
              {active.mode === "simulate" ? " · 未真发" : ""}
            </p>
            {active.error ? <p className="mt-3 text-sm text-destructive">{active.error}</p> : null}
            {active.keys?.length ? (
              <p className="mt-3 text-xs text-muted-foreground">密钥：{active.keys.join("、")}</p>
            ) : null}
            <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-7">{active.body}</pre>
          </article>
        ) : (
          <div className="flex min-h-72 items-center justify-center rounded-3xl bg-card text-sm text-muted-foreground ring-1 ring-foreground/10">
            选择一封查看
          </div>
        )}
      </div>
    </div>
  );
}

import { getAiSettings } from "@/lib/store";

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export async function deepseekChat(
  messages: ChatTurn[],
  options?: { temperature?: number; maxTokens?: number; json?: boolean },
) {
  const settings = await getAiSettings();
  if (!settings.apiKey) {
    throw new Error("还没有 API Key。请到 AI 页填写 DeepSeek Key。");
  }

  const base = settings.baseUrl.replace(/\/$/, "");
  const payload: Record<string, unknown> = {
    model: settings.model,
    temperature: options?.temperature ?? 0.6,
    max_tokens: options?.maxTokens ?? 4000,
    thinking: { type: "disabled" },
    messages,
  };
  if (options?.json) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek 请求失败（${response.status}）：${detail.slice(0, 280)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("DeepSeek 返回了空内容。");
  }
  return { content: content.trim(), settings };
}

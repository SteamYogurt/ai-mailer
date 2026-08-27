import { deepseekChat } from "@/lib/ai";
import { getAiSettings, getChat, saveChat } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

export async function GET() {
  return Response.json({ messages: await getChat() });
}

export async function DELETE() {
  await saveChat([]);
  return Response.json({ messages: [] });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { content?: string };
  const content = body.content?.trim();
  if (!content) {
    return Response.json({ error: "请输入内容" }, { status: 400 });
  }

  const history = await getChat();
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    at: new Date().toISOString(),
  };

  try {
    const ai = await getAiSettings();
    const { content: reply } = await deepseekChat(
      [
        {
          role: "system",
          content: `You are ${ai.name}, a helpful assistant for an indie game developer. Be concise. Reply in the user's language.`,
        },
        ...history.slice(-20).map((item) => ({
          role: item.role,
          content: item.content,
        })),
        { role: "user", content },
      ],
      { temperature: 0.7, maxTokens: 2000 },
    );

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: reply,
      at: new Date().toISOString(),
    };
    const messages = await saveChat([...history, userMessage, assistantMessage]);
    return Response.json({ messages, reply: assistantMessage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "对话失败";
    return Response.json({ error: message }, { status: 502 });
  }
}

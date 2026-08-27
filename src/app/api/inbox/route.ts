import { deleteInbox, listInbox } from "@/lib/store";

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") ?? undefined;
  const messages = await listInbox(email || undefined);
  return Response.json({ messages });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? undefined;
  await deleteInbox(id || undefined);
  const messages = await listInbox();
  return Response.json({ ok: true, messages });
}

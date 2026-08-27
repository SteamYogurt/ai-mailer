import { emptyGame } from "@/lib/sample";
import {
  deleteGame,
  getActiveGameId,
  getGame,
  listGames,
  saveGame,
  setActiveGameId,
} from "@/lib/store";
import type { GameRecord } from "@/lib/types";

export async function GET() {
  const games = await listGames();
  const activeId = (await getActiveGameId()) ?? games[0]?.id ?? null;
  return Response.json({ games, activeId });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { game?: Partial<GameRecord>; activate?: boolean };
  const current = body.game?.id ? await getGame(body.game.id) : null;
  const base = current ?? emptyGame();
  const saved = await saveGame({ ...base, ...body.game, id: base.id });
  if (body.activate !== false) await setActiveGameId(saved.id);
  return Response.json({ game: saved });
}

export async function PUT() {
  const created = await saveGame(emptyGame({ brand: "新游戏" }));
  await setActiveGameId(created.id);
  return Response.json({ game: created });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string };
  if (!body.id) return Response.json({ error: "缺少游戏 id" }, { status: 400 });
  await setActiveGameId(body.id);
  return Response.json({ ok: true, activeId: body.id });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "缺少游戏 id" }, { status: 400 });
  const games = await deleteGame(id);
  const activeId = games[0]?.id ?? null;
  if (activeId) await setActiveGameId(activeId);
  return Response.json({ games, activeId });
}

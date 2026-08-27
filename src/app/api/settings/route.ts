import { getAiSettings, saveAiSettings } from "@/lib/store";
import { aiStatus } from "@/lib/generate";

export async function GET() {
  const settings = await getAiSettings();
  const status = await aiStatus();
  return Response.json({
    ...settings,
    configured: status.configured,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  const settings = await saveAiSettings(body);
  return Response.json({ ...settings, configured: Boolean(settings.apiKey) });
}

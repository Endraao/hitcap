import { liveMarkets } from "@/lib/server/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await liveMarkets();
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { detectSite } from "@/lib/detection";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One site check is a handful of outbound requests, so this can be generous. */
const REQUESTS_PER_MINUTE = 20;

export async function POST(request: Request) {
  const limit = enforceRateLimit(request, "detect", REQUESTS_PER_MINUTE);
  if (limit.blocked) return limit.blocked;

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON" },
      { status: 400, headers: limit.headers },
    );
  }

  if (typeof url !== "string" || url.trim() === "") {
    return NextResponse.json(
      { error: "Provide a `url` string" },
      { status: 400, headers: limit.headers },
    );
  }

  const result = await detectSite(url);
  return NextResponse.json(result, { headers: limit.headers });
}

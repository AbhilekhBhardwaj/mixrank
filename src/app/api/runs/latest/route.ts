import { NextResponse } from "next/server";
import { getLatestRun } from "@/lib/runs";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ run: null, configured: false });
  }
  const run = await getLatestRun();
  return NextResponse.json({ run, configured: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getObservation } from "@/lib/db";
import { runOrchestrator } from "@/lib/orchestrator";

// Track running orchestrators to prevent double-starts.
// NOTE: Module-level state only works within a single server process.
// In serverless or multi-instance deployments, use a DB-backed lock instead.
const running = new Set<string>();

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const observation = getObservation(id);

  if (!observation) {
    return NextResponse.json(
      { error: "Thread not found" },
      { status: 404 }
    );
  }

  if (observation.phase !== "discussion") {
    return NextResponse.json(
      { error: "Thread is not in discussion phase" },
      { status: 400 }
    );
  }

  if (running.has(id)) {
    return NextResponse.json(
      { error: "Orchestrator already running for this thread" },
      { status: 409 }
    );
  }

  // Start orchestrator in the background (fire-and-forget)
  running.add(id);
  runOrchestrator(id)
    .catch((error) => {
      console.error(`[run] Orchestrator error for ${id}:`, error);
    })
    .finally(() => {
      running.delete(id);
    });

  return NextResponse.json({ status: "started" });
}

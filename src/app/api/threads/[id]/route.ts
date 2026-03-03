import { NextRequest, NextResponse } from "next/server";
import {
  getObservation,
  getThreadAgents,
  getComments,
  getVotes,
  getTags,
} from "@/lib/db";
import type { ThreadDetail } from "@/lib/types";

export async function GET(
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

  const agents = getThreadAgents(id);
  const comments = getComments(id);
  const votes = getVotes(id);
  const tags = getTags(id);

  const detail: ThreadDetail = {
    observation,
    agents,
    comments,
    votes,
    tags,
  };

  return NextResponse.json(detail);
}

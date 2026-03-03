import { NextRequest, NextResponse } from "next/server";
import { createObservation, listObservations } from "@/lib/db";

export async function GET() {
  const threads = listObservations();
  return NextResponse.json(threads);
}

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, body: threadBody, agentIds } = body;

  if (!title || !threadBody || !agentIds?.length) {
    return NextResponse.json(
      { error: "title, body, and agentIds are required" },
      { status: 400 }
    );
  }

  if (typeof title !== "string" || typeof threadBody !== "string") {
    return NextResponse.json(
      { error: "title and body must be strings" },
      { status: 400 }
    );
  }

  if (title.length > MAX_TITLE_LENGTH || threadBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `title max ${MAX_TITLE_LENGTH} chars, body max ${MAX_BODY_LENGTH} chars` },
      { status: 400 }
    );
  }

  const observation = createObservation(title, threadBody, agentIds);
  return NextResponse.json(observation, { status: 201 });
}

import { NextResponse } from "next/server";
import { getAllAgents } from "@/lib/db";

export async function GET() {
  const agents = getAllAgents();
  return NextResponse.json(agents);
}

import { generateText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  getObservation,
  getThreadAgents,
  getComments,
  getCommentCount,
  getAgentCommentCount,
  addComment,
  addTag,
  addVote,
  getVotes,
  hasBeenTagged,
  updateObservationPhase,
  updateObservationResult,
  getThreadAgentIds,
} from "./db";
import { renderSystemPrompt, renderUserMessage, renderVotePrompt } from "./prompts";
import { webSearchTool } from "./tools";
import { parseMentions, reorderQueue } from "./tags";
import type { QueueEntry } from "./types";

const MAX_TOTAL_COMMENTS = 10;
const MAX_IDLE_MS = 10 * 60 * 1000; // 10 minutes
const BASE_COMMENT_CAP = 2;
const TAG_BONUS = 1;
const MAX_TOOL_CALLS = 5;

function cachedSystem(text: string) {
  return {
    role: "system" as const,
    content: text,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  };
}

async function invokeAgent(
  systemPrompt: string,
  initialMessages: ModelMessage[],
  tools: Record<string, typeof webSearchTool>,
): Promise<string> {
  let messages = [...initialMessages];
  let toolCallCount = 0;

  for (let step = 0; step < MAX_TOOL_CALLS; step++) {
    const isLastStep = step === MAX_TOOL_CALLS - 1;

    // On penultimate step, inject a nudge if the agent has been using tools
    if (step === MAX_TOOL_CALLS - 2 && toolCallCount > 0) {
      messages.push({
        role: "user",
        content: `You have used ${toolCallCount} of ${MAX_TOOL_CALLS} tool calls. Write your comment now as your final response.`,
      });
    }

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: cachedSystem(systemPrompt),
      messages,
      // Force text-only on the last step by passing empty tools
      tools: isLastStep ? {} : tools,
    });

    // Append response messages for multi-turn continuity
    messages = [...messages, ...result.response.messages];

    if (result.toolCalls.length > 0) {
      toolCallCount += result.toolCalls.length;
      console.log(`[invokeAgent] Tool calls this step: ${result.toolCalls.length}, total: ${toolCallCount}`);
      continue;
    }

    // Model produced text without tool calls — we're done
    return result.text.trim();
  }

  // If we exhausted all steps, return whatever text the last call produced
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === "assistant" && typeof lastMsg.content === "string") {
    return lastMsg.content.trim();
  }
  // Fallback: extract text from content parts
  if (lastMsg && lastMsg.role === "assistant" && Array.isArray(lastMsg.content)) {
    const textParts = lastMsg.content
      .filter((p): p is { type: "text"; text: string } => "type" in p && p.type === "text")
      .map((p) => p.text);
    return textParts.join("").trim();
  }
  return "";
}

export async function runOrchestrator(observationId: string): Promise<void> {
  const observation = getObservation(observationId);
  if (!observation) throw new Error(`Observation ${observationId} not found`);
  if (observation.phase !== "discussion") {
    throw new Error(`Observation ${observationId} is not in discussion phase`);
  }

  const agentIds = getThreadAgentIds(observationId);

  // Initialize queue: all agents in order, none must respond
  let queue: QueueEntry[] = agentIds.map((agentId) => ({
    agentId,
    mustRespond: false,
  }));

  let lastActivityTime = Date.now();

  // Main discussion loop
  while (queue.length > 0) {
    // Check termination: total comment cap
    if (getCommentCount(observationId) >= MAX_TOTAL_COMMENTS) {
      console.log(`[orchestrator] Reached ${MAX_TOTAL_COMMENTS} comments, terminating discussion`);
      break;
    }

    // Check termination: idle timeout
    if (Date.now() - lastActivityTime > MAX_IDLE_MS) {
      console.log("[orchestrator] Idle timeout reached, terminating discussion");
      break;
    }

    // Dequeue next agent
    const entry = queue.shift()!;
    const { agentId, mustRespond } = entry;

    // Check per-agent comment cap
    const agentCommentCount = getAgentCommentCount(observationId, agentId);
    const tagged = hasBeenTagged(observationId, agentId);
    const cap = BASE_COMMENT_CAP + (tagged ? TAG_BONUS : 0);

    if (agentCommentCount >= cap) {
      console.log(`[orchestrator] ${agentId} at comment cap (${agentCommentCount}/${cap}), skipping`);
      continue;
    }

    // Get fresh thread data for this turn
    const agents = getThreadAgents(observationId);
    const comments = getComments(observationId);
    const currentObservation = getObservation(observationId)!;

    // Build prompts
    const agentDef = agents.find((a) => a.id === agentId);
    if (!agentDef) continue;

    const systemPrompt = renderSystemPrompt(
      agentDef.system_prompt,
      agents.map((a) => ({ id: a.id }))
    );

    const userMessage = renderUserMessage(
      { title: currentObservation.title, body: currentObservation.body },
      comments,
      agents.map((a) => ({ id: a.id, name: a.name }))
    );

    const skipInstruction = mustRespond
      ? "\n\nYou have been tagged by another agent. You MUST respond with a substantive comment."
      : "\n\nIf you have nothing new to add to this discussion, respond with exactly: [SKIP]";

    console.log(`[orchestrator] Agent ${agentId} turn (mustRespond: ${mustRespond}, comments: ${agentCommentCount}/${cap})`);

    try {
      const responseText = await invokeAgent(
        systemPrompt,
        [{ role: "user", content: userMessage + skipInstruction }],
        { web_search: webSearchTool },
      );

      // Check if agent chose to skip
      if (responseText === "[SKIP]" && !mustRespond) {
        console.log(`[orchestrator] ${agentId} chose to skip`);
        continue; // Don't re-queue, they had nothing to add
      }

      // Agent produced a comment — save it
      const comment = addComment(observationId, agentId, responseText);
      lastActivityTime = Date.now();
      console.log(`[orchestrator] ${agentId} commented (${responseText.length} chars)`);

      // Parse @mentions and update tags + queue
      const mentionedIds = parseMentions(responseText, agentIds, agentId);
      for (const toAgentId of mentionedIds) {
        addTag(observationId, comment.id, agentId, toAgentId);
      }

      // Reorder queue with mentions
      queue = reorderQueue(queue, mentionedIds, agentId);

      // Re-add commenting agent at back if not at cap
      if (agentCommentCount + 1 < cap) {
        queue.push({ agentId, mustRespond: false });
      }
    } catch (error) {
      console.error(`[orchestrator] Error with agent ${agentId}:`, error);
      // Don't re-queue on error, move to next agent
    }
  }

  // Transition to voting phase
  console.log("[orchestrator] Starting voting phase");
  await runVoting(observationId);
}

async function runVoting(observationId: string): Promise<void> {
  updateObservationPhase(observationId, "voting");

  const agents = getThreadAgents(observationId);
  const comments = getComments(observationId);
  const observation = getObservation(observationId)!;

  for (const agent of agents) {
    const systemPrompt = agent.system_prompt;
    const threadContext = renderUserMessage(
      { title: observation.title, body: observation.body },
      comments,
      agents.map((a) => ({ id: a.id, name: a.name }))
    );
    const votePrompt = renderVotePrompt();

    console.log(`[orchestrator] Requesting vote from ${agent.id}`);

    try {
      const result = await generateText({
        model: anthropic("claude-sonnet-4-20250514"),
        system: cachedSystem(systemPrompt),
        messages: [
          { role: "user", content: threadContext + "\n\n" + votePrompt },
        ],
      });

      const responseText = result.text.trim();

      // Parse JSON vote from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const voteData = JSON.parse(jsonMatch[0]);
        const value = voteData.value === 1 ? 1 : -1;
        const reasoning = voteData.reasoning || "No reasoning provided";
        addVote(observationId, agent.id, value as 1 | -1, reasoning);
        console.log(`[orchestrator] ${agent.id} voted ${value > 0 ? "approve" : "reject"}`);
      } else {
        console.error(`[orchestrator] ${agent.id} returned invalid vote format: ${responseText}`);
        addVote(observationId, agent.id, -1, `Could not parse vote — defaulting to reject. Raw response: ${responseText}`);
      }
    } catch (error) {
      console.error(`[orchestrator] Error getting vote from ${agent.id}:`, error);
    }
  }

  // Tally votes
  const allVotes = getVotes(observationId);
  const totalAgents = agents.length;
  const approvals = allVotes.filter((v) => v.value === 1).length;

  // 51%+ of ALL thread agents must approve
  const approved = approvals > totalAgents / 2;
  updateObservationResult(observationId, approved ? "approved" : "rejected");
  console.log(
    `[orchestrator] Result: ${approved ? "APPROVED" : "REJECTED"} (${approvals}/${totalAgents})`
  );
}

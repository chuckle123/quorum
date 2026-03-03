import { QueueEntry } from "./types";

// Parse @mentions from comment text, returning unique agent IDs mentioned
// Excludes the commenting agent's own ID (no self-tagging)
export function parseMentions(text: string, validAgentIds: string[], excludeAgentId?: string): string[] {
  const mentions = new Set<string>();
  for (const match of text.matchAll(/@([a-z0-9_-]+)/g)) {
    const agentId = match[1];
    if (validAgentIds.includes(agentId) && agentId !== excludeAgentId) {
      mentions.add(agentId);
    }
  }
  return Array.from(mentions);
}

// Prepend tagged entries to front of queue. The commenting agent's entry
// was already shifted off by the orchestrator, so base entries stay intact.
export function reorderQueue(
  queue: QueueEntry[],
  mentionedAgentIds: string[],
  commentingAgentId: string
): QueueEntry[] {
  const tagged: QueueEntry[] = mentionedAgentIds
    .filter((id) => id !== commentingAgentId)
    .map((agentId) => ({ agentId, mustRespond: true }));

  return [...tagged, ...queue];
}

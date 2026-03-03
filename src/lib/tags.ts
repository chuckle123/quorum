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

// Reorder the queue: move mentioned agents to front with mustRespond: true
// Don't re-add agents that aren't in the queue (they may have hit their cap)
export function reorderQueue(
  queue: QueueEntry[],
  mentionedAgentIds: string[],
  commentingAgentId: string
): QueueEntry[] {
  // Remove the commenting agent from wherever they are (they'll be re-added at back if eligible)
  const filtered = queue.filter((e) => e.agentId !== commentingAgentId);

  // Split: mentioned agents that are in the queue, and the rest
  const mentioned: QueueEntry[] = [];
  const rest: QueueEntry[] = [];

  for (const entry of filtered) {
    if (mentionedAgentIds.includes(entry.agentId)) {
      mentioned.push({ ...entry, mustRespond: true });
    } else {
      rest.push(entry);
    }
  }

  // Also add mentioned agents that weren't in the queue yet
  for (const agentId of mentionedAgentIds) {
    if (!mentioned.some((e) => e.agentId === agentId) && agentId !== commentingAgentId) {
      mentioned.push({ agentId, mustRespond: true });
    }
  }

  return [...mentioned, ...rest];
}

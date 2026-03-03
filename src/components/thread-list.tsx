"use client";

import type { ThreadListItem } from "@/lib/types";
import { PhaseBadge } from "./phase-badge";
import { AgentAvatar } from "./agent-avatar";

interface ThreadListProps {
  threads: ThreadListItem[];
}

export function ThreadList({ threads }: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <p className="text-gray-500 text-center py-12">
        No threads yet. Start a new discussion.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((thread) => (
        <a
          key={thread.id}
          href={`/thread/${thread.id}`}
          className="block border border-gray-800 rounded-lg p-4 hover:border-gray-700 hover:bg-gray-900/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-gray-100 truncate">
                {thread.title}
              </h3>
              <div className="flex items-center gap-3 mt-2">
                <PhaseBadge phase={thread.phase} result={thread.result} />
                <span className="text-xs text-gray-500">
                  {thread.commentCount}{" "}
                  {thread.commentCount === 1 ? "comment" : "comments"}
                </span>
              </div>
            </div>
            <div className="flex -space-x-1.5 shrink-0">
              {thread.agents.map((agent) => (
                <AgentAvatar
                  key={agent.id}
                  agentId={agent.id}
                  name={agent.name}
                  size="sm"
                />
              ))}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

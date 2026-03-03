"use client";

import { useState, useEffect, useRef } from "react";
import type { ThreadDetail } from "@/lib/types";
import { PhaseBadge } from "./phase-badge";
import { CommentCard } from "./comment-card";
import { VoteResults } from "./vote-results";

interface ThreadViewProps {
  threadId: string;
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const [data, setData] = useState<ThreadDetail | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function fetchThread() {
      fetch(`/api/threads/${threadId}`)
        .then((res) => res.json())
        .then((d: ThreadDetail) => setData(d));
    }

    fetchThread();
    intervalRef.current = setInterval(fetchThread, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [threadId]);

  // Stop polling once the thread is resolved
  useEffect(() => {
    if (data?.observation.phase === "resolved" && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [data?.observation.phase]);

  if (!data) {
    return <p className="text-gray-500 text-center py-12">Loading...</p>;
  }

  const { observation, agents, comments, votes } = data;

  return (
    <div className="space-y-6">
      {/* Observation header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <PhaseBadge phase={observation.phase} result={observation.result} />
        </div>
        <h1 className="text-xl font-bold text-white mb-3">
          {observation.title}
        </h1>
        <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
          {observation.body}
        </p>
      </div>

      {/* Waiting for agents indicator */}
      {observation.phase === "discussion" && comments.length === 0 && (
        <p className="text-sm text-gray-500 animate-pulse">
          Agents are thinking...
        </p>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-2">
            Discussion ({comments.length})
          </h2>
          <div className="divide-y divide-gray-800">
            {comments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                agents={agents}
              />
            ))}
          </div>
        </div>
      )}

      {/* Votes */}
      {(observation.phase === "voting" || observation.phase === "resolved") &&
        votes.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-400 mb-2">Votes</h2>
            <VoteResults votes={votes} result={observation.result} />
          </div>
        )}
    </div>
  );
}

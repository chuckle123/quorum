import type { CommentWithAgent, Agent } from "@/lib/types";
import { AGENT_COLORS, MENTION_COLORS } from "@/lib/constants";

function renderBody(body: string, agents: Agent[]) {
  const agentIds = agents.map((a) => a.id);
  const pattern = new RegExp(`@(${agentIds.join("|")})`, "g");
  const parts = body.split(pattern);

  return parts.map((part, i) => {
    if (agentIds.includes(part)) {
      const agent = agents.find((a) => a.id === part);
      const color = MENTION_COLORS[part] ?? "bg-gray-700 text-gray-300";
      return (
        <span
          key={i}
          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${color}`}
        >
          @{agent?.name ?? part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface CommentCardProps {
  comment: CommentWithAgent;
  agents: Agent[];
}

export function CommentCard({ comment, agents }: CommentCardProps) {
  const color = AGENT_COLORS[comment.agent_id] ?? "bg-gray-600";
  const initial = comment.agentName.charAt(0).toUpperCase();

  return (
    <div className="flex gap-3 py-3">
      <span
        className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white ${color}`}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-200">
            {comment.agentName}
          </span>
          <span className="text-xs text-gray-500">{comment.timeAgo}</span>
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
          {renderBody(comment.body, agents)}
        </p>
      </div>
    </div>
  );
}

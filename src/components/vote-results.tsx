import type { VoteWithAgent } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/constants";

interface VoteResultsProps {
  votes: VoteWithAgent[];
  result: "approved" | "rejected" | null;
}

export function VoteResults({ votes, result }: VoteResultsProps) {
  if (votes.length === 0) return null;

  const approvals = votes.filter((v) => v.value === 1).length;
  const rejections = votes.filter((v) => v.value === -1).length;

  return (
    <div className="border border-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Votes</h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-400">+{approvals}</span>
          <span className="text-red-400">-{rejections}</span>
          {result && (
            <span
              className={`font-medium ${
                result === "approved" ? "text-green-400" : "text-red-400"
              }`}
            >
              {result === "approved" ? "Approved" : "Rejected"}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {votes.map((vote) => {
          const color = AGENT_COLORS[vote.agent_id] ?? "bg-gray-600";
          const initial = vote.agentName.charAt(0).toUpperCase();
          return (
            <div key={vote.id} className="flex gap-3">
              <span
                className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${color}`}
              >
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-200">
                    {vote.agentName}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      vote.value === 1 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {vote.value === 1 ? "+1" : "-1"}
                  </span>
                </div>
                <p className="text-sm text-gray-400">{vote.reasoning}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PhaseBadgeProps {
  phase: "discussion" | "voting" | "resolved";
  result: "approved" | "rejected" | null;
}

export function PhaseBadge({ phase, result }: PhaseBadgeProps) {
  if (phase === "resolved" && result === "approved") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400 border border-green-800">
        APPROVED
      </span>
    );
  }

  if (phase === "resolved" && result === "rejected") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-400 border border-red-800">
        REJECTED
      </span>
    );
  }

  if (phase === "voting") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-400 border border-blue-800">
        VOTING
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-400 border border-amber-800">
      DISCUSSING
    </span>
  );
}

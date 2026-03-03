import { AGENT_COLORS } from "@/lib/constants";

export function AgentAvatar({
  agentId,
  name,
  size = "md",
}: {
  agentId: string;
  name?: string;
  size?: "sm" | "md";
}) {
  const bg = AGENT_COLORS[agentId] ?? "bg-gray-600";
  const initial = (name ?? agentId)[0].toUpperCase();
  const sizeClass = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";

  return (
    <div
      className={`${bg} ${sizeClass} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      title={name ?? agentId}
    >
      {initial}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/lib/types";

export function CreateThreadForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data: Agent[]) => {
        setAgents(data);
        setSelectedAgentIds(data.map((a) => a.id));
      });
  }, []);

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || selectedAgentIds.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          agentIds: selectedAgentIds,
        }),
      });
      const thread = await res.json();

      // Start the orchestrator
      await fetch(`/api/threads/${thread.id}/run`, { method: "POST" });

      router.push(`/thread/${thread.id}`);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What should the agents discuss?"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500"
          required
        />
      </div>

      <div>
        <label
          htmlFor="body"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Observation
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe the topic in detail..."
          rows={5}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-y"
          required
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-300 mb-2">
          Agents
        </span>
        <div className="flex gap-3">
          {agents.map((agent) => (
            <label
              key={agent.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                selectedAgentIds.includes(agent.id)
                  ? "border-gray-500 bg-gray-800"
                  : "border-gray-700 bg-gray-900 opacity-50"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedAgentIds.includes(agent.id)}
                onChange={() => toggleAgent(agent.id)}
                className="sr-only"
              />
              <span className="text-sm text-gray-200">{agent.name}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={
          submitting || !title.trim() || !body.trim() || selectedAgentIds.length === 0
        }
        className="px-4 py-2 bg-white text-gray-950 font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Creating..." : "Create Thread"}
      </button>
    </form>
  );
}

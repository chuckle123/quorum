export enum AgentTool {
  WEB_SEARCH = "web_search",
}

export interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  tools: string; // comma-separated AgentTool values
  created_at: string;
}

export interface Observation {
  id: string;
  title: string;
  body: string;
  phase: "discussion" | "voting" | "resolved";
  last_activity_at: string;
  result: "approved" | "rejected" | null;
  created_at: string;
}

export interface ThreadAgent {
  observation_id: string;
  agent_id: string;
}

export interface Comment {
  id: string;
  observation_id: string;
  agent_id: string;
  body: string;
  created_at: string;
}

export interface Tag {
  id: string;
  observation_id: string;
  comment_id: string;
  from_agent_id: string;
  to_agent_id: string;
  created_at: string;
}

export interface Vote {
  id: string;
  observation_id: string;
  agent_id: string;
  value: 1 | -1;
  reasoning: string;
  created_at: string;
}

export interface QueueEntry {
  agentId: string;
  mustRespond: boolean;
}

// Extended types for API responses
export interface CommentWithAgent extends Comment {
  agentName: string;
  timeAgo: string;
}

export interface VoteWithAgent extends Vote {
  agentName: string;
}

export interface ThreadDetail {
  observation: Observation;
  agents: Agent[];
  comments: CommentWithAgent[];
  votes: VoteWithAgent[];
  tags: Tag[];
}

export interface ThreadListItem {
  id: string;
  title: string;
  phase: Observation["phase"];
  result: Observation["result"];
  commentCount: number;
  agents: { id: string; name: string }[];
  created_at: string;
}

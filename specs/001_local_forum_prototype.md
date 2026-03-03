# SPEC 001: Local Forum Prototype

Local proof-of-concept. Three agents discuss a Greece trip on a forum with voting.

---

## Stack

| Dep | Version | Purpose |
|-----|---------|---------|
| next | 15 | App Router, API routes, React UI |
| react / react-dom | 19 | UI |
| ai | 6 | `generateText`, tool calling |
| @ai-sdk/anthropic | 1 | Claude provider, prompt caching |
| better-sqlite3 | 11 | Local DB, zero config |
| handlebars | 4 | Prompt templates |
| zod | 3 | Tool param schemas |
| uuid | 11 | Primary keys |
| tailwindcss | 4 | Styling |

---

## Files

```
src/
├── app/
│   ├── layout.tsx                  # html shell, tailwind, global styles
│   ├── page.tsx                    # GET /  → thread list + "new thread" link
│   ├── new/
│   │   └── page.tsx                # GET /new → create thread form
│   ├── thread/
│   │   └── [id]/
│   │       └── page.tsx            # GET /thread/:id → live thread view (polls)
│   └── api/
│       ├── agents/
│       │   └── route.ts            # GET → all agents
│       └── threads/
│           ├── route.ts            # GET → list threads, POST → create thread
│           └── [id]/
│               ├── route.ts        # GET → thread + comments + votes
│               └── run/
│                   └── route.ts    # POST → start orchestrator (async, returns immediately)
├── lib/
│   ├── types.ts
│   ├── db.ts
│   ├── prompts.ts
│   ├── tools.ts
│   ├── agents.ts
│   ├── tags.ts
│   └── orchestrator.ts
├── templates/
│   ├── tag-instructions.hbs
│   ├── thread-context.hbs
│   ├── agent-list.hbs
│   └── vote-prompt.hbs
└── components/
    ├── thread-list.tsx
    ├── thread-view.tsx
    ├── comment-card.tsx
    ├── vote-results.tsx
    ├── create-thread-form.tsx
    └── phase-badge.tsx
```

---

## Database

SQLite via `better-sqlite3`. File: `quorum.db` at project root (gitignored).

### agents

| Column | Type | Constraint |
|--------|------|------------|
| id | TEXT | PK |
| name | TEXT | UNIQUE NOT NULL |
| system_prompt | TEXT | NOT NULL |
| tools | TEXT | NOT NULL, comma-separated enum values |
| created_at | TEXT | DEFAULT current_timestamp |

### observations

| Column | Type | Constraint |
|--------|------|------------|
| id | TEXT | PK |
| title | TEXT | NOT NULL |
| body | TEXT | NOT NULL |
| phase | TEXT | NOT NULL, CHECK IN ('discussion','voting','resolved') |
| last_activity_at | TEXT | NOT NULL |
| result | TEXT | NULL, CHECK IN ('approved','rejected') |
| created_at | TEXT | DEFAULT current_timestamp |

### thread_agents

| Column | Type | Constraint |
|--------|------|------------|
| observation_id | TEXT | FK → observations.id |
| agent_id | TEXT | FK → agents.id |
| | | UNIQUE(observation_id, agent_id) |

### comments

| Column | Type | Constraint |
|--------|------|------------|
| id | TEXT | PK |
| observation_id | TEXT | FK → observations.id |
| agent_id | TEXT | FK → agents.id |
| body | TEXT | NOT NULL, raw text with @agent_id inline |
| created_at | TEXT | DEFAULT current_timestamp |

### tags

| Column | Type | Constraint |
|--------|------|------------|
| id | TEXT | PK |
| observation_id | TEXT | FK → observations.id |
| comment_id | TEXT | FK → comments.id |
| from_agent_id | TEXT | FK → agents.id |
| to_agent_id | TEXT | FK → agents.id |
| created_at | TEXT | DEFAULT current_timestamp |
| | | UNIQUE(observation_id, from_agent_id, to_agent_id) |

### votes

| Column | Type | Constraint |
|--------|------|------------|
| id | TEXT | PK |
| observation_id | TEXT | FK → observations.id |
| agent_id | TEXT | FK → agents.id |
| value | INTEGER | NOT NULL, CHECK IN (-1, 1) |
| reasoning | TEXT | NOT NULL |
| created_at | TEXT | DEFAULT current_timestamp |
| | | UNIQUE(observation_id, agent_id) |

---

## Seed Data

Three agents inserted on first run (upsert by id).

**emma**
```
id: "emma"
name: "Emma"
tools: "web_search"
system_prompt: >
  You are Emma, a passionate food lover and travel planner.
  You prioritize destinations with incredible local cuisine, food markets,
  cooking classes, and authentic dining experiences. You love discovering
  hidden culinary gems. When discussing travel, you research the food
  scene thoroughly before responding.
```

**cameron**
```
id: "cameron"
name: "Cameron"
tools: "web_search"
system_prompt: >
  You are Cameron, an adventure-seeking traveler.
  You prioritize destinations with hiking, water sports, dramatic landscapes,
  and off-the-beaten-path experiences. You love physical challenges and
  natural beauty. When discussing travel, you research outdoor activities
  and adventure opportunities before responding.
```

**wallet**
```
id: "wallet"
name: "Wallet"
tools: "web_search"
system_prompt: >
  You are Wallet, a strict budget manager. Your job is to keep the trip
  under $150 per day per person. You evaluate every destination and activity
  suggestion through a cost lens: accommodation, food, transport, activities.
  You research actual current prices. You flag when suggestions exceed budget
  and propose budget-friendly alternatives. You are firm but constructive.
```

---

## Types

```typescript
interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
  tools: string;       // comma-separated enum: "web_search"
  createdAt: string;
}

interface Observation {
  id: string;
  title: string;
  body: string;
  phase: 'discussion' | 'voting' | 'resolved';
  lastActivityAt: string;
  result: 'approved' | 'rejected' | null;
  createdAt: string;
}

interface Comment {
  id: string;
  observationId: string;
  agentId: string;
  body: string;        // raw text, may contain @agent_id
  createdAt: string;
}

interface Tag {
  id: string;
  observationId: string;
  commentId: string;
  fromAgentId: string;
  toAgentId: string;
  createdAt: string;
}

interface Vote {
  id: string;
  observationId: string;
  agentId: string;
  value: 1 | -1;
  reasoning: string;
  createdAt: string;
}

interface QueueEntry {
  agentId: string;
  mustRespond: boolean;
}
```

---

## Prompt Templates (Handlebars)

### templates/tag-instructions.hbs

Appended to system prompt (cached together).

```handlebars
To mention another agent, write @their_id in your response.
Available agents: {{#each agents}}@{{this.id}}{{#unless @last}}, {{/unless}}{{/each}}
If you tag an agent, they will be prioritized to respond next.
Only tag someone if you have a specific question or point for them.
```

### templates/thread-context.hbs

Rendered as the user message on each turn.

```handlebars
## Thread: {{observation.title}}

{{observation.body}}

{{#if comments.length}}
### Discussion ({{comments.length}} comments)

{{#each comments}}
**{{this.agentName}}** ({{this.timeAgo}}):
{{this.body}}

{{/each}}
{{else}}
No comments yet. You are the first to respond.
{{/if}}
```

### templates/agent-list.hbs

Appended to thread context.

```handlebars
Agents in this thread: {{#each agents}}{{this.name}} (@{{this.id}}){{#unless @last}}, {{/unless}}{{/each}}
```

### templates/vote-prompt.hbs

Replaces thread-context user message during voting phase.

```handlebars
The discussion phase is over. Review the full thread below and cast your vote.

## Thread: {{observation.title}}

{{observation.body}}

### Discussion ({{comments.length}} comments)

{{#each comments}}
**{{this.agentName}}**:
{{this.body}}

{{/each}}

---

Vote +1 (approve) if the group reached a good conclusion.
Vote -1 (reject) if you disagree with the direction.

Respond with ONLY valid JSON:
{"value": 1, "reasoning": "your reasoning"} or {"value": -1, "reasoning": "your reasoning"}
```

### Prompt assembly per turn

```
SYSTEM (cached 5min):
  agent.system_prompt + rendered tag-instructions.hbs

USER MESSAGE:
  rendered thread-context.hbs + rendered agent-list.hbs

(if tool call count >= 4):
  inject USER MESSAGE: "You have used {{count}} of 5 tool calls. Write your comment now."
```

---

## Tools

### Tool enum

```typescript
enum AgentTool {
  WEB_SEARCH = 'web_search',
}
```

Stored in `agents.tools` column. Resolved to AI SDK tool definitions at runtime.

### web_search

```typescript
tool({
  description: 'Search the web for information about a topic',
  parameters: z.object({
    query: z.string().describe('Search query'),
  }),
  execute: async ({ query }) => {
    // Use AI SDK's built-in web search or Tavily
    // Return search results as text
  },
})
```

### What is NOT a tool

- **Commenting**: agent's final text output = the comment. Orchestrator inserts it.
- **Tagging**: agent writes `@agent_id` in comment text. Parsed after insertion.
- **Voting**: orchestrator invokes agent with vote-prompt template, parses JSON response.
- **Reading thread**: injected as first user message, not a tool call.

---

## Orchestrator

### Initialization

```
Input: observation_id
1. Load thread_agents for this observation
2. Build initial queue: thread_agents in creation order, all mustRespond: false
3. Set observation.phase = 'discussion'
4. Set observation.last_activity_at = now()
5. Enter discussion loop
```

### Discussion loop

```
while true:
  if queue is empty → break to voting
  if comment count >= 10 → break to voting
  if now - observation.last_activity_at >= 10 minutes → break to voting

  entry = queue.shift()
  agent = load agent by entry.agentId

  // Check cap
  agentCommentCount = count comments for (observation_id, agent.id)
  wasTagged = exists tag where (observation_id, to_agent_id = agent.id)
  cap = wasTagged ? 3 : 2
  if agentCommentCount >= cap → continue (skip, already at cap)

  // Invoke agent
  commentText = invokeAgent(agent, observation_id, entry.mustRespond)

  if commentText is empty or null:
    if entry.mustRespond:
      // tagged agents must respond — retry or force a generic response
      commentText = "(no response)"
    else:
      // agent chose to skip — remove from future rounds
      continue

  // Insert comment
  commentId = insertComment(observation_id, agent.id, commentText)
  update observation.last_activity_at = now()

  // Parse @mentions
  mentionedAgentIds = parseMentions(commentText, allThreadAgentIds)
  for each mentionedId:
    insertTag(observation_id, commentId, agent.id, mentionedId)  // ignore duplicate
    // Push tagged agent to front of queue with mustRespond: true
    // Only if they haven't hit their cap
    mentionedCount = count comments for (observation_id, mentionedId)
    mentionedWasTagged = true  // they are being tagged now
    mentionedCap = 3
    if mentionedCount < mentionedCap:
      remove mentionedId from queue if present
      queue.unshift({ agentId: mentionedId, mustRespond: true })

  // Re-queue current agent at back (if not at cap after this comment)
  newCount = agentCommentCount + 1
  if newCount < cap:
    queue.push({ agentId: agent.id, mustRespond: false })
```

### invokeAgent

```
Input: agent, observation_id, mustRespond
Output: string (comment text) or null (skip)

1. Build system message:
   - agent.system_prompt + rendered tag-instructions partial
   - Set cacheControl: { type: 'ephemeral' } for Anthropic prompt caching

2. Build user message:
   - Render thread-context template with observation + all comments
   - Append rendered agent-list

3. Resolve agent.tools → AI SDK tool definitions

4. Call generateText({
     model: anthropic('claude-sonnet-4-20250514'),
     system: systemMessage,
     messages: [{ role: 'user', content: userMessage }],
     tools: resolvedTools,
     maxSteps: 5,
     // After 4 steps, inject nudge to write comment
   })

5. Track tool call count across steps:
   - Steps 1-3: tools available normally
   - Step 4: append user message "You have used 4 of 5 tool calls.
     Write your comment now as your final response."
   - Step 5: no tools available (force text response)

6. Extract final text content from response
   - If text is empty and !mustRespond → return null (agent skipped)
   - If text is empty and mustRespond → return "(no response)"
   - Otherwise → return text
```

### Voting phase

```
1. Set observation.phase = 'voting'
2. Load all thread_agents
3. For each agent:
   a. Build system message (same cached system prompt)
   b. Render vote-prompt template as user message
   c. Call generateText with NO tools, expecting JSON
   d. Parse JSON: { value: 1|-1, reasoning: string }
   e. Insert vote record
4. Tally:
   totalAgents = count of thread_agents
   yesVotes = count votes where value = 1
   totalVotes = count all votes
   approved = totalVotes >= 2 AND yesVotes > (totalAgents / 2)
5. Set observation.result = approved ? 'approved' : 'rejected'
6. Set observation.phase = 'resolved'
```

---

## Tag Parsing

### parseMentions

```
Input: commentBody (string), threadAgentIds (string[])
Output: string[] (matched agent IDs)

1. Regex: /@([a-z0-9_-]+)/g
2. For each match, check if captured group is in threadAgentIds
3. Return deduplicated array of matched agent IDs
4. Exclude the commenting agent's own ID (no self-tagging)
```

### Display resolution

In the UI, replace `@agent_id` in comment body with a highlighted span:

```tsx
function renderMentions(body: string, agents: Agent[]): ReactNode {
  const parts = body.split(/(@[a-z0-9_-]+)/g);
  return parts.map((part, i) => {
    const match = part.match(/^@(.+)$/);
    if (match) {
      const agent = agents.find(a => a.id === match[1]);
      if (agent) {
        return <span key={i} className="mention">@{agent.name}</span>;
      }
    }
    return part;
  });
}
```

---

## API Routes

### GET /api/agents

Returns all agents.

```json
[
  { "id": "emma", "name": "Emma", "tools": "web_search", "createdAt": "..." },
  { "id": "cameron", "name": "Cameron", "tools": "web_search", "createdAt": "..." },
  { "id": "wallet", "name": "Wallet", "tools": "web_search", "createdAt": "..." }
]
```

### POST /api/threads

Create a thread and assign agents.

Request:
```json
{
  "title": "Where should we go in Greece?",
  "body": "We're planning a trip to Greece...",
  "agentIds": ["emma", "cameron", "wallet"]
}
```

Response:
```json
{ "id": "abc-123", "phase": "discussion" }
```

Steps:
1. Insert observation with phase='discussion'
2. Insert thread_agents for each agentId
3. Return observation

### GET /api/threads

List all threads.

```json
[
  {
    "id": "abc-123",
    "title": "Where should we go in Greece?",
    "phase": "discussion",
    "result": null,
    "commentCount": 4,
    "agents": [
      { "id": "emma", "name": "Emma" },
      { "id": "cameron", "name": "Cameron" },
      { "id": "wallet", "name": "Wallet" }
    ],
    "createdAt": "..."
  }
]
```

### GET /api/threads/[id]

Full thread state for polling.

```json
{
  "observation": {
    "id": "abc-123",
    "title": "...",
    "body": "...",
    "phase": "discussion",
    "result": null,
    "createdAt": "..."
  },
  "agents": [
    { "id": "emma", "name": "Emma" }
  ],
  "comments": [
    {
      "id": "c-1",
      "agentId": "emma",
      "agentName": "Emma",
      "body": "I've been researching and @cameron Crete has amazing...",
      "createdAt": "..."
    }
  ],
  "votes": [
    {
      "agentId": "emma",
      "agentName": "Emma",
      "value": 1,
      "reasoning": "Crete offers the best balance..."
    }
  ],
  "tags": [
    { "fromAgentId": "emma", "toAgentId": "cameron", "commentId": "c-1" }
  ]
}
```

### POST /api/threads/[id]/run

Start the orchestrator. Runs async (fire-and-forget via unref'd promise or background task). Returns immediately.

Request: empty body

Response:
```json
{ "status": "started" }
```

Behavior:
- If observation.phase is not 'discussion' → return 400
- Kick off orchestrator in background
- Orchestrator writes to DB as it progresses
- UI polls GET /api/threads/[id] to see updates

---

## UI Components

### page.tsx (/)

- Fetch GET /api/threads on load
- Render `<ThreadList>`
- Link to /new

### new/page.tsx (/new)

- Fetch GET /api/agents on load
- Render `<CreateThreadForm>` with agent checkboxes
- On submit: POST /api/threads → redirect to /thread/[id]
- On redirect: auto-trigger POST /api/threads/[id]/run

### thread/[id]/page.tsx (/thread/:id)

- Fetch GET /api/threads/[id] on load
- Poll every 2 seconds (setInterval + fetch)
- Render:
  - `<PhaseBadge phase={phase} result={result} />`
  - Observation title + body
  - `<CommentCard>` for each comment (chronological)
  - `<VoteResults>` when phase = 'resolved'
- Stop polling when phase = 'resolved'

### CommentCard

- Agent avatar: colored circle with first letter of agent name
- Agent name (bold)
- Comment body with @mentions highlighted via `renderMentions()`
- Relative timestamp

### PhaseBadge

- DISCUSSING → yellow badge
- VOTING → blue badge
- APPROVED → green badge
- REJECTED → red badge

### VoteResults

- Table: agent name | vote (+1/-1) | reasoning
- Tally row: X approve / Y reject
- Final result: APPROVED or REJECTED (large, colored)

---

## Implementation Order

1. `npx create-next-app@latest quorum --ts --tailwind --app --src-dir`
2. `npm install ai @ai-sdk/anthropic better-sqlite3 handlebars zod uuid`
3. `npm install -D @types/better-sqlite3`
4. `src/lib/types.ts` — all interfaces
5. `src/lib/db.ts` — schema DDL, seed agents, CRUD functions
6. `src/templates/*.hbs` — all four templates
7. `src/lib/prompts.ts` — load + compile templates, render functions
8. `src/lib/tools.ts` — web_search tool definition
9. `src/lib/agents.ts` — agent config objects (emma, cameron, wallet)
10. `src/lib/tags.ts` — parseMentions function
11. `src/lib/orchestrator.ts` — discussion loop, voting, full lifecycle
12. `src/app/api/agents/route.ts` — GET agents
13. `src/app/api/threads/route.ts` — GET list, POST create
14. `src/app/api/threads/[id]/route.ts` — GET thread detail
15. `src/app/api/threads/[id]/run/route.ts` — POST start orchestrator
16. `src/components/*.tsx` — all UI components
17. `src/app/page.tsx` — home page
18. `src/app/new/page.tsx` — create thread page
19. `src/app/thread/[id]/page.tsx` — thread view page with polling
20. `.env.local` — ANTHROPIC_API_KEY
21. `.gitignore` — add quorum.db

---

## Verification

1. `npm run dev` → `http://localhost:3000`
2. Create thread "Where should we go in Greece?" with all 3 agents
3. Observe agents discussing sequentially in the UI
4. Confirm @mentions highlight and trigger priority responses
5. Confirm wallet pushes back on cost
6. Confirm discussion terminates at 10 comments or 10 min idle
7. Confirm voting produces APPROVED/REJECTED with reasoning
8. `sqlite3 quorum.db "SELECT agent_id, body FROM comments ORDER BY created_at"` for audit

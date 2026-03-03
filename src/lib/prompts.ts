import Handlebars from "handlebars";
import fs from "fs";
import path from "path";

// Lazy-init cache for compiled templates
let tagInstructionsTemplate: Handlebars.TemplateDelegate | null = null;
let threadContextTemplate: Handlebars.TemplateDelegate | null = null;
let agentListTemplate: Handlebars.TemplateDelegate | null = null;
let votePromptTemplate: Handlebars.TemplateDelegate | null = null;
let partialsRegistered = false;

function templatePath(filename: string): string {
  return path.join(process.cwd(), "src/templates", filename);
}

function loadTemplate(filename: string): Handlebars.TemplateDelegate {
  const source = fs.readFileSync(templatePath(filename), "utf-8");
  return Handlebars.compile(source);
}

function ensureTemplates() {
  if (tagInstructionsTemplate) return;

  tagInstructionsTemplate = loadTemplate("tag-instructions.hbs");
  threadContextTemplate = loadTemplate("thread-context.hbs");
  agentListTemplate = loadTemplate("agent-list.hbs");
  votePromptTemplate = loadTemplate("vote-prompt.hbs");

  if (!partialsRegistered) {
    Handlebars.registerPartial(
      "tag-instructions",
      fs.readFileSync(templatePath("tag-instructions.hbs"), "utf-8")
    );
    Handlebars.registerPartial(
      "agent-list",
      fs.readFileSync(templatePath("agent-list.hbs"), "utf-8")
    );
    partialsRegistered = true;
  }
}

export function renderTagInstructions(agents: { id: string }[]): string {
  ensureTemplates();
  return tagInstructionsTemplate!({ agents });
}

export function renderThreadContext(data: {
  observation: { title: string; body: string };
  comments: { agentName: string; timeAgo: string; body: string }[];
}): string {
  ensureTemplates();
  return threadContextTemplate!(data);
}

export function renderAgentList(
  agents: { id: string; name: string }[]
): string {
  ensureTemplates();
  return agentListTemplate!({ agents });
}

export function renderVotePrompt(): string {
  ensureTemplates();
  return votePromptTemplate!({});
}

export function renderSystemPrompt(
  agentSystemPrompt: string,
  agents: { id: string }[]
): string {
  const tagInstructions = renderTagInstructions(agents);
  return `${agentSystemPrompt}\n\n${tagInstructions}`;
}

export function renderUserMessage(
  observation: { title: string; body: string },
  comments: { agentName: string; timeAgo: string; body: string }[],
  agents: { id: string; name: string }[]
): string {
  const threadContext = renderThreadContext({ observation, comments });
  const agentList = renderAgentList(agents);
  return `${threadContext}\n\n${agentList}`;
}

/**
 * GitHub issues for in-app feedback. Each request becomes an issue labelled `feedback`; the
 * claude-feedback workflow implements it, deploys it and moves it through the `claude:*` labels.
 */

import type { Env } from '../lib/context';

export const FEEDBACK_KINDS = ['bug', 'idea', 'change'] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number];

export type FeedbackStatus = 'saved' | 'queued' | 'working' | 'needs_info' | 'failed' | 'live';

export interface IssueInfo {
  number: number;
  url: string;
  status: FeedbackStatus;
  question: string | null; // Claude's last question, when it needs more information
}

const KIND_TITLE: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idea', change: 'Change' };

function repo(env: Env) {
  return env.FEEDBACK_REPO || 'AndrewSkea/cattle-cloudflare';
}

async function gh<T>(env: Env, method: string, path: string, payload?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${repo(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_FEEDBACK_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hooveswho-feedback',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

export const githubConfigured = (env: Env) => !!env.GITHUB_FEEDBACK_TOKEN;

/** Opens the issue. The repository may be public, so it carries the request but never names or emails. */
export async function createFeedbackIssue(env: Env, f: { kind: FeedbackKind; message: string; page: string | null; role: string; feedbackId: number }) {
  const firstLine = f.message.split('\n')[0].trim();
  const title = `[${KIND_TITLE[f.kind]}] ${firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine}`;
  const body = [
    f.message,
    '',
    '---',
    `**Type:** ${KIND_TITLE[f.kind]}  `,
    `**Page:** ${f.page ? `\`${f.page}\`` : 'not given'}  `,
    `**Sent by:** a farm ${f.role} in the app (feedback #${f.feedbackId})`,
    '',
    '<!-- hooveswho-feedback -->',
  ].join('\n');
  const issue = await gh<{ number: number }>(env, 'POST', '/issues', { title, body, labels: ['feedback', f.kind] });
  return issue.number;
}

export async function commentOnIssue(env: Env, issueNumber: number, text: string) {
  await gh(env, 'POST', `/issues/${issueNumber}/comments`, { body: `${text}\n\n<!-- hooveswho-feedback-reply -->` });
}

interface GhIssue { number: number; html_url: string; state: string; labels: { name: string }[] }

function statusOf(issue: GhIssue): FeedbackStatus {
  const labels = new Set(issue.labels.map((l) => l.name));
  if (labels.has('claude:deployed')) return 'live';
  if (issue.state === 'closed') return 'live';
  if (labels.has('claude:working')) return 'working';
  if (labels.has('claude:needs-info')) return 'needs_info';
  if (labels.has('claude:failed')) return 'failed';
  return 'queued';
}

/** Status of the given issues, from their labels. Questions are fetched only for issues waiting on an answer. */
export async function issueStatuses(env: Env, numbers: number[]): Promise<Map<number, IssueInfo>> {
  const out = new Map<number, IssueInfo>();
  if (!numbers.length || !githubConfigured(env)) return out;
  const wanted = new Set(numbers);
  const issues = await gh<GhIssue[]>(env, 'GET', '/issues?labels=feedback&state=all&sort=created&direction=desc&per_page=100');
  for (const i of issues) {
    if (wanted.has(i.number)) out.set(i.number, { number: i.number, url: i.html_url, status: statusOf(i), question: null });
  }
  await Promise.all([...out.values()].filter((i) => i.status === 'needs_info').map(async (i) => {
    const comments = await gh<{ body: string; user: { type: string } }[]>(env, 'GET', `/issues/${i.number}/comments?per_page=100`);
    const q = [...comments].reverse().find((c) => c.user.type === 'Bot' && c.body.includes('<!-- claude-question -->'));
    i.question = q ? q.body.replace(/<!--[\s\S]*?-->/g, '').trim() : null;
  }));
  return out;
}

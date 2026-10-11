/**
 * Feedback: bug reports, ideas and change requests from inside the app. Each one is opened as a
 * GitHub issue; Claude implements and deploys it (.github/workflows/claude-feedback.yml).
 */

import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../db/schema';
import { type AppEnv, HttpError, body, farmSession, idParam, logActivity, notFound } from '../lib/context';
import { FEEDBACK_KINDS, type IssueInfo, commentOnIssue, createFeedbackIssue, githubConfigured, issueStatuses } from '../services/github';

const feedback = new Hono<AppEnv>();

const DAILY_LIMIT = 10; // per farm — each request spends Claude subscription time

feedback.get('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const rows = await db.select({
    id: schema.feedback.id, kind: schema.feedback.kind, message: schema.feedback.message, page: schema.feedback.page,
    issueNumber: schema.feedback.issueNumber, createdAt: schema.feedback.createdAt, userId: schema.feedback.userId,
    userName: schema.users.name, userEmail: schema.users.email,
  }).from(schema.feedback)
    .innerJoin(schema.users, eq(schema.users.id, schema.feedback.userId))
    .where(eq(schema.feedback.farmId, s.farmId)).orderBy(desc(schema.feedback.id)).limit(30).all();

  let statuses = new Map<number, IssueInfo>();
  try {
    statuses = await issueStatuses(c.env, rows.flatMap((r) => (r.issueNumber ? [r.issueNumber] : [])));
  } catch (e) {
    console.error('feedback status lookup failed', e);
  }
  return c.json({ data: rows.map(({ userEmail, ...r }) => {
    const info = r.issueNumber ? statuses.get(r.issueNumber) : undefined;
    return {
      ...r,
      userName: r.userName || userEmail,
      status: info?.status ?? (r.issueNumber ? 'queued' : 'saved'),
      issueUrl: info?.url ?? null,
      question: info?.question ?? null,
    };
  }) });
});

feedback.post('/', async (c) => {
  const s = farmSession(c);
  const db = c.get('db');
  const data = await body(c, z.object({
    kind: z.enum(FEEDBACK_KINDS),
    message: z.string().trim().min(10, 'Please describe it in a little more detail').max(4000),
    page: z.string().max(300).nullish(),
  }));
  const recent = await db.get<{ n: number }>(sql`SELECT COUNT(*) n FROM feedback WHERE farm_id = ${s.farmId} AND created_at > datetime('now', '-1 day')`);
  if ((recent?.n ?? 0) >= DAILY_LIMIT) throw new HttpError(409, `That’s ${DAILY_LIMIT} requests today — please send more tomorrow`);

  const [row] = await db.insert(schema.feedback).values({
    farmId: s.farmId, userId: s.userId, kind: data.kind, message: data.message, page: data.page || null,
  }).returning();

  let issueNumber: number | null = null;
  if (githubConfigured(c.env)) {
    try {
      issueNumber = await createFeedbackIssue(c.env, { ...data, page: data.page || null, role: s.role, feedbackId: row.id });
      await db.update(schema.feedback).set({ issueNumber }).where(eq(schema.feedback.id, row.id));
    } catch (e) {
      console.error('feedback issue creation failed', e);
    }
  }
  await logActivity(c, 'created', 'feedback', row.id, `Sent feedback: ${data.message.slice(0, 80)}`);
  return c.json({ data: { id: row.id, issueNumber } }, 201);
});

/** Answers Claude's question (or adds detail). The comment re-runs the workflow on that issue. */
feedback.post('/:id/reply', async (c) => {
  const s = farmSession(c);
  const id = idParam(c);
  const { message } = await body(c, z.object({ message: z.string().trim().min(2).max(4000) }));
  const row = await c.get('db').select().from(schema.feedback)
    .where(and(eq(schema.feedback.id, id), eq(schema.feedback.farmId, s.farmId))).get();
  if (!row) throw notFound('Feedback');
  if (!row.issueNumber || !githubConfigured(c.env)) throw new HttpError(409, 'This request hasn’t reached Claude yet');
  await commentOnIssue(c.env, row.issueNumber, message);
  return c.json({ data: { ok: true } });
});

export default feedback;

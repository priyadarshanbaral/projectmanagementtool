import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import type {
  AppNotification,
  NotificationType,
  Project,
  ProjectMember,
  ProjectMemberRole,
  Task,
  TaskComment,
  TaskPriority,
  TaskStatus,
  User,
} from '../types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'cadence.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Member',
    avatar_color TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    key_prefix TEXT NOT NULL,
    color TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'medium',
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    creator_id TEXT NOT NULL REFERENCES users(id),
    due_date TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

export const AVATAR_COLORS = [
  '#2563EB',
  '#0D9488',
  '#D97706',
  '#7C3AED',
  '#059669',
  '#E11D48',
];

function nowIso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function dateOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function seedInitialData(): void {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (countRow.count > 0) return;

  const passwordHash = bcrypt.hashSync('password123', 10);

  const users = [
    {
      id: 'usr_elena',
      name: 'Elena Vance',
      email: 'elena@cadence.app',
      role: 'Product Lead',
      avatarColor: '#2563EB',
      createdAt: nowIso(-10000),
    },
    {
      id: 'usr_marcus',
      name: 'Marcus Chen',
      email: 'marcus@cadence.app',
      role: 'Staff Engineer',
      avatarColor: '#0D9488',
      createdAt: nowIso(-9900),
    },
    {
      id: 'usr_priya',
      name: 'Priya Nair',
      email: 'priya@cadence.app',
      role: 'Design Director',
      avatarColor: '#7C3AED',
      createdAt: nowIso(-9800),
    },
    {
      id: 'usr_jordan',
      name: 'Jordan Reyes',
      email: 'jordan@cadence.app',
      role: 'QA & Release Ops',
      avatarColor: '#D97706',
      createdAt: nowIso(-9700),
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, avatar_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of users) {
    insertUser.run(u.id, u.name, u.email, passwordHash, u.role, u.avatarColor, u.createdAt);
  }

  const projects = [
    {
      id: 'prj_core',
      name: 'Q4 Platform Launch',
      description: 'Core workspace synchronization engine, permissions audit, and production rollout.',
      keyPrefix: 'CORE',
      color: '#2563EB',
      ownerId: 'usr_elena',
      createdAt: nowIso(-8000),
    },
    {
      id: 'prj_dsgn',
      name: 'Design System Refresh',
      description: 'Unified component tokens, board card density specs, and accessible keyboard navigation.',
      keyPrefix: 'DSGN',
      color: '#7C3AED',
      ownerId: 'usr_priya',
      createdAt: nowIso(-7500),
    },
    {
      id: 'prj_port',
      name: 'Customer Portal V2',
      description: 'Self-serve client onboarding, billing history ledger, and team invite flows.',
      keyPrefix: 'PORT',
      color: '#0D9488',
      ownerId: 'usr_marcus',
      createdAt: nowIso(-7000),
    },
  ];

  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, description, key_prefix, color, owner_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of projects) {
    insertProject.run(p.id, p.name, p.description, p.keyPrefix, p.color, p.ownerId, p.createdAt);
  }

  const insertMember = db.prepare(`
    INSERT INTO project_members (project_id, user_id, role, joined_at)
    VALUES (?, ?, ?, ?)
  `);

  // Add all 4 to CORE, 3 to DSGN, 3 to PORT
  insertMember.run('prj_core', 'usr_elena', 'owner', nowIso(-8000));
  insertMember.run('prj_core', 'usr_marcus', 'admin', nowIso(-7990));
  insertMember.run('prj_core', 'usr_priya', 'member', nowIso(-7980));
  insertMember.run('prj_core', 'usr_jordan', 'member', nowIso(-7970));

  insertMember.run('prj_dsgn', 'usr_priya', 'owner', nowIso(-7500));
  insertMember.run('prj_dsgn', 'usr_elena', 'member', nowIso(-7490));
  insertMember.run('prj_dsgn', 'usr_marcus', 'member', nowIso(-7480));

  insertMember.run('prj_port', 'usr_marcus', 'owner', nowIso(-7000));
  insertMember.run('prj_port', 'usr_elena', 'admin', nowIso(-6990));
  insertMember.run('prj_port', 'usr_jordan', 'member', nowIso(-6980));

  const tasks: Array<{
    id: string;
    projectId: string;
    taskCode: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeId: string | null;
    creatorId: string;
    dueDate: string | null;
    position: number;
    offsetMin: number;
  }> = [
    {
      id: 'tsk_1',
      projectId: 'prj_core',
      taskCode: 'CORE-101',
      title: 'Implement WebSocket reconnection backoff & state sync',
      description: 'Ensure clients automatically re-subscribe to active project rooms after transient network drops and reconcile missed task updates cleanly.',
      status: 'in_progress',
      priority: 'urgent',
      assigneeId: 'usr_marcus',
      creatorId: 'usr_elena',
      dueDate: dateOffset(2),
      position: 0,
      offsetMin: -1200,
    },
    {
      id: 'tsk_2',
      projectId: 'prj_core',
      taskCode: 'CORE-102',
      title: 'Audit role-based permissions on group project invites',
      description: 'Verify only project owners and admins can remove existing members, while all members can collaborate on tasks and comments.',
      status: 'in_review',
      priority: 'high',
      assigneeId: 'usr_jordan',
      creatorId: 'usr_elena',
      dueDate: dateOffset(3),
      position: 0,
      offsetMin: -1100,
    },
    {
      id: 'tsk_3',
      projectId: 'prj_core',
      taskCode: 'CORE-103',
      title: 'Design notification drawer & unread state transitions',
      description: 'Clicking a notification should mark it read immediately and open the corresponding task detail drawer in one step.',
      status: 'todo',
      priority: 'high',
      assigneeId: 'usr_priya',
      creatorId: 'usr_elena',
      dueDate: dateOffset(4),
      position: 0,
      offsetMin: -950,
    },
    {
      id: 'tsk_4',
      projectId: 'prj_core',
      taskCode: 'CORE-104',
      title: 'Add keyboard shortcut hints to task composer',
      description: 'Support Cmd/Ctrl+Enter inside the comment composer and Escape to close slide-over drawers.',
      status: 'backlog',
      priority: 'low',
      assigneeId: 'usr_priya',
      creatorId: 'usr_marcus',
      dueDate: dateOffset(9),
      position: 0,
      offsetMin: -800,
    },
    {
      id: 'tsk_5',
      projectId: 'prj_core',
      taskCode: 'CORE-105',
      title: 'Finalize Q4 launch readiness checklist with stakeholders',
      description: 'Coordinate sign-off across engineering, design, and release operations ahead of Monday cutover.',
      status: 'todo',
      priority: 'medium',
      assigneeId: 'usr_elena',
      creatorId: 'usr_elena',
      dueDate: dateOffset(5),
      position: 1,
      offsetMin: -700,
    },
    {
      id: 'tsk_6',
      projectId: 'prj_core',
      taskCode: 'CORE-106',
      title: 'Benchmark SQLite WAL throughput under concurrent board moves',
      description: 'Verified sub-5ms write latency for simultaneous drag-and-drop column transitions across 20 active clients.',
      status: 'done',
      priority: 'medium',
      assigneeId: 'usr_marcus',
      creatorId: 'usr_marcus',
      dueDate: dateOffset(-1),
      position: 0,
      offsetMin: -2000,
    },
    {
      id: 'tsk_7',
      projectId: 'prj_dsgn',
      taskCode: 'DSGN-101',
      title: 'Standardize tabular numeral tokens across list views',
      description: 'Apply tabular-nums on all task IDs, column counters, and due dates to prevent vertical column jitter.',
      status: 'in_progress',
      priority: 'high',
      assigneeId: 'usr_priya',
      creatorId: 'usr_priya',
      dueDate: dateOffset(3),
      position: 0,
      offsetMin: -600,
    },
    {
      id: 'tsk_8',
      projectId: 'prj_dsgn',
      taskCode: 'DSGN-102',
      title: 'Verify WCAG AA contrast on priority indicators',
      description: 'Ensure all semantic status and priority labels include explicit text alongside crisp vector icons.',
      status: 'done',
      priority: 'medium',
      assigneeId: 'usr_elena',
      creatorId: 'usr_priya',
      dueDate: dateOffset(-2),
      position: 0,
      offsetMin: -1800,
    },
    {
      id: 'tsk_9',
      projectId: 'prj_port',
      taskCode: 'PORT-101',
      title: 'Build self-serve group project creation modal',
      description: 'Allow workspace members to spin up a new project board, select a prefix key, and invite teammates in one flow.',
      status: 'in_review',
      priority: 'high',
      assigneeId: 'usr_marcus',
      creatorId: 'usr_elena',
      dueDate: dateOffset(1),
      position: 0,
      offsetMin: -500,
    },
    {
      id: 'tsk_10',
      projectId: 'prj_port',
      taskCode: 'PORT-102',
      title: 'Validate email invite edge cases in QA staging',
      description: 'Test duplicate invite prevention and immediate member list updates over WebSocket.',
      status: 'todo',
      priority: 'medium',
      assigneeId: 'usr_jordan',
      creatorId: 'usr_marcus',
      dueDate: dateOffset(6),
      position: 0,
      offsetMin: -400,
    },
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, project_id, task_code, title, description, status, priority, assignee_id, creator_id, due_date, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of tasks) {
    const ts = nowIso(t.offsetMin);
    insertTask.run(
      t.id,
      t.projectId,
      t.taskCode,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.assigneeId,
      t.creatorId,
      t.dueDate,
      t.position,
      ts,
      ts
    );
  }

  const insertComment = db.prepare(`
    INSERT INTO comments (id, task_id, author_id, body, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertComment.run(
    'cmt_1',
    'tsk_1',
    'usr_elena',
    'Let us make sure the client triggers a lightweight room re-sync as soon as the WebSocket reconnects so no card moves are missed.',
    nowIso(-300)
  );
  insertComment.run(
    'cmt_2',
    'tsk_1',
    'usr_marcus',
    'Agreed — exponential backoff caps at 10s and fires an immediate project task fetch + room:join on open.',
    nowIso(-240)
  );
  insertComment.run(
    'cmt_3',
    'tsk_2',
    'usr_jordan',
    'Verified owner vs member guards across all PATCH/DELETE project member endpoints. Ready for final sign-off.',
    nowIso(-180)
  );
  insertComment.run(
    'cmt_4',
    'tsk_3',
    'usr_priya',
    'Drafted the notification popover with direct jump-to-task behavior and a one-click mark all read action.',
    nowIso(-90)
  );

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, actor_id, project_id, task_id, type, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertNotif.run(
    'ntf_1',
    'usr_elena',
    'usr_marcus',
    'prj_core',
    'tsk_1',
    'task_comment',
    'Marcus Chen commented on CORE-101: "Agreed — exponential backoff caps at 10s..."',
    0,
    nowIso(-240)
  );
  insertNotif.run(
    'ntf_2',
    'usr_elena',
    'usr_jordan',
    'prj_core',
    'tsk_2',
    'task_moved',
    'Jordan Reyes moved CORE-102 to In Review',
    0,
    nowIso(-180)
  );
  insertNotif.run(
    'ntf_3',
    'usr_marcus',
    'usr_elena',
    'prj_core',
    'tsk_1',
    'task_assigned',
    'Elena Vance assigned CORE-101 to you',
    0,
    nowIso(-1200)
  );
  insertNotif.run(
    'ntf_4',
    'usr_priya',
    'usr_elena',
    'prj_core',
    'tsk_3',
    'task_assigned',
    'Elena Vance assigned CORE-103 to you',
    0,
    nowIso(-950)
  );
}

// Data mapping helpers
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_color: string;
  created_at: string;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
  };
}

export function getUserById(userId: string): User | null {
  const row = db
    .prepare('SELECT id, name, email, role, avatar_color, created_at FROM users WHERE id = ?')
    .get(userId) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getAllUsers(): User[] {
  const rows = db
    .prepare('SELECT id, name, email, role, avatar_color, created_at FROM users ORDER BY name ASC')
    .all() as unknown as UserRow[];
  return rows.map(mapUser);
}

export function isProjectMember(projectId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId);
  return Boolean(row);
}

export function getProjectMemberRole(projectId: string, userId: string): ProjectMemberRole | null {
  const row = db
    .prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId) as { role: ProjectMemberRole } | undefined;
  return row ? row.role : null;
}

export function getProjectById(projectId: string): Project | null {
  const pRow = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(projectId) as
    | {
        id: string;
        name: string;
        description: string;
        key_prefix: string;
        color: string;
        owner_id: string;
        created_at: string;
      }
    | undefined;

  if (!pRow) return null;

  const memberRows = db
    .prepare(
      `SELECT pm.user_id, pm.role as member_role, pm.joined_at,
              u.id, u.name, u.email, u.role as user_role, u.avatar_color, u.created_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?
       ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name ASC`
    )
    .all(projectId) as Array<{
    user_id: string;
    member_role: ProjectMemberRole;
    joined_at: string;
    id: string;
    name: string;
    email: string;
    user_role: string;
    avatar_color: string;
    created_at: string;
  }>;

  const members: ProjectMember[] = memberRows.map((m) => ({
    userId: m.user_id,
    role: m.member_role,
    joinedAt: m.joined_at,
    user: {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.user_role,
      avatarColor: m.avatar_color,
      createdAt: m.created_at,
    },
  }));

  const countRow = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status IN ('in_progress', 'in_review') THEN 1 ELSE 0 END) as in_progress
       FROM tasks WHERE project_id = ?`
    )
    .get(projectId) as { total: number; done: number | null; in_progress: number | null };

  return {
    id: pRow.id,
    name: pRow.name,
    description: pRow.description,
    keyPrefix: pRow.key_prefix,
    color: pRow.color,
    ownerId: pRow.owner_id,
    createdAt: pRow.created_at,
    members,
    taskCounts: {
      total: countRow.total ?? 0,
      done: countRow.done ?? 0,
      inProgress: countRow.in_progress ?? 0,
    },
  };
}

export function getProjectsForUser(userId: string): Project[] {
  const rows = db
    .prepare(
      `SELECT p.id
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = ?
       ORDER BY p.created_at ASC`
    )
    .all(userId) as Array<{ id: string }>;

  return rows.map((r) => getProjectById(r.id)).filter((p): p is Project => p !== null);
}

export function getTaskById(taskId: string): Task | null {
  const row = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) as comment_count
       FROM tasks t
       WHERE t.id = ?`
    )
    .get(taskId) as
    | {
        id: string;
        project_id: string;
        task_code: string;
        title: string;
        description: string;
        status: TaskStatus;
        priority: TaskPriority;
        assignee_id: string | null;
        creator_id: string;
        due_date: string | null;
        position: number;
        comment_count: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    taskCode: row.task_code,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    assignee: row.assignee_id ? getUserById(row.assignee_id) : null,
    creatorId: row.creator_id,
    creator: getUserById(row.creator_id),
    dueDate: row.due_date,
    position: row.position,
    commentCount: row.comment_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTasksForProject(projectId: string): Task[] {
  const rows = db
    .prepare(
      `SELECT id FROM tasks WHERE project_id = ? ORDER BY position ASC, created_at DESC`
    )
    .all(projectId) as Array<{ id: string }>;

  return rows.map((r) => getTaskById(r.id)).filter((t): t is Task => t !== null);
}

export function getTasksAssignedToUser(userId: string): Task[] {
  const rows = db
    .prepare(
      `SELECT t.id
       FROM tasks t
       JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
       WHERE t.assignee_id = ?
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.updated_at DESC`
    )
    .all(userId, userId) as Array<{ id: string }>;

  return rows.map((r) => getTaskById(r.id)).filter((t): t is Task => t !== null);
}

export function getCommentsForTask(taskId: string): TaskComment[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.task_id, c.author_id, c.body, c.created_at,
              u.name, u.email, u.role, u.avatar_color, u.created_at as user_created_at
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.task_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(taskId) as Array<{
    id: string;
    task_id: string;
    author_id: string;
    body: string;
    created_at: string;
    name: string;
    email: string;
    role: string;
    avatar_color: string;
    user_created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    authorId: r.author_id,
    author: {
      id: r.author_id,
      name: r.name,
      email: r.email,
      role: r.role,
      avatarColor: r.avatar_color,
      createdAt: r.user_created_at,
    },
    body: r.body,
    createdAt: r.created_at,
  }));
}

export function createNotificationRecord(params: {
  userId: string;
  actorId: string | null;
  projectId: string | null;
  taskId: string | null;
  type: NotificationType;
  message: string;
}): AppNotification {
  const id = `ntf_${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (id, user_id, actor_id, project_id, task_id, type, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    params.userId,
    params.actorId,
    params.projectId,
    params.taskId,
    params.type,
    params.message,
    createdAt
  );

  return {
    id,
    userId: params.userId,
    actorId: params.actorId,
    actor: params.actorId ? getUserById(params.actorId) : null,
    projectId: params.projectId,
    taskId: params.taskId,
    type: params.type,
    message: params.message,
    isRead: false,
    createdAt,
  };
}

export function getNotificationsForUser(userId: string): AppNotification[] {
  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(userId) as Array<{
    id: string;
    user_id: string;
    actor_id: string | null;
    project_id: string | null;
    task_id: string | null;
    type: NotificationType;
    message: string;
    is_read: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    actorId: r.actor_id,
    actor: r.actor_id ? getUserById(r.actor_id) : null,
    projectId: r.project_id,
    taskId: r.task_id,
    type: r.type,
    message: r.message,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at,
  }));
}

export function nextTaskCode(projectId: string, keyPrefix: string): string {
  const rows = db
    .prepare('SELECT task_code FROM tasks WHERE project_id = ?')
    .all(projectId) as Array<{ task_code: string }>;

  let maxNum = 100;
  for (const r of rows) {
    const parts = r.task_code.split('-');
    const num = Number.parseInt(parts[parts.length - 1] ?? '', 10);
    if (!Number.isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }
  return `${keyPrefix}-${maxNum + 1}`;
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 86_400_000);
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  ).run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}

export function getUserByToken(token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_color, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as (UserRow & { expires_at: string }) | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return mapUser(row);
}

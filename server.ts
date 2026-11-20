import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import bcrypt from 'bcryptjs';
import {
  AVATAR_COLORS,
  createNotificationRecord,
  createSession,
  db,
  getAllUsers,
  getCommentsForTask,
  getNotificationsForUser,
  getProjectById,
  getProjectMemberRole,
  getProjectsForUser,
  getTaskById,
  getTasksAssignedToUser,
  getTasksForProject,
  getUserById,
  getUserByToken,
  isProjectMember,
  nextTaskCode,
  seedInitialData,
} from './src/server/db.ts';
import type { TaskPriority, TaskStatus, User, WSEvent } from './src/types.ts';

seedInitialData();

interface AuthedRequest extends Request {
  user?: User;
  authToken?: string;
}

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '1mb' }));

// WebSocket Client Registry
interface ClientSocket {
  ws: WebSocket;
  userId: string;
  userName: string;
  roomId: string | null;
}

const clients = new Set<ClientSocket>();

function sendWs(ws: WebSocket, event: WSEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function sendToUser(userId: string, event: WSEvent): void {
  for (const client of clients) {
    if (client.userId === userId) {
      sendWs(client.ws, event);
    }
  }
}

function broadcastToProjectMembers(projectId: string, event: WSEvent): void {
  const project = getProjectById(projectId);
  if (!project) return;
  const memberIds = new Set(project.members.map((m) => m.userId));
  for (const client of clients) {
    if (memberIds.has(client.userId)) {
      sendWs(client.ws, event);
    }
  }
}

function broadcastPresence(projectId: string): void {
  const onlineUserIds = Array.from(
    new Set(
      Array.from(clients)
        .filter((c) => c.roomId === projectId && c.ws.readyState === WebSocket.OPEN)
        .map((c) => c.userId)
    )
  );
  broadcastToProjectMembers(projectId, {
    type: 'presence:update',
    projectId,
    onlineUserIds,
  });
}

// Auth Middleware
function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  req.user = user;
  req.authToken = token;
  next();
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Auth endpoints
app.get('/api/auth/demo-users', (_req, res) => {
  const demoEmails = [
    'elena@cadence.app',
    'marcus@cadence.app',
    'priya@cadence.app',
    'jordan@cadence.app',
  ];
  const users = getAllUsers().filter((u) => demoEmails.includes(u.email));
  res.json({ users });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  };

  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    res.status(400).json({ error: 'Name, valid email, and password (min 6 chars) are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const id = `usr_${crypto.randomUUID().slice(0, 8)}`;
  const passwordHash = bcrypt.hashSync(password, 10);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const createdAt = new Date().toISOString();
  const userRole = role?.trim() || 'Product Collaborator';

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, avatar_color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), normalizedEmail, passwordHash, userRole, avatarColor, createdAt);

  // Add new user to default collaborative project so they can start collaborating right away
  const defaultProject = db.prepare('SELECT id, name FROM projects ORDER BY created_at ASC LIMIT 1').get() as
    | { id: string; name: string }
    | undefined;
  if (defaultProject) {
    db.prepare(
      `INSERT OR IGNORE INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
    ).run(defaultProject.id, id, createdAt);
    createNotificationRecord({
      userId: id,
      actorId: null,
      projectId: defaultProject.id,
      taskId: null,
      type: 'project_invite',
      message: `Welcome to Cadence! You joined the ${defaultProject.name} workspace.`,
    });
    const updatedProject = getProjectById(defaultProject.id);
    if (updatedProject) {
      broadcastToProjectMembers(defaultProject.id, {
        type: 'project:updated',
        project: updatedProject,
      });
    }
  }

  const user = getUserById(id)!;
  const token = createSession(id);
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email?.trim() || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db
    .prepare('SELECT id, password_hash FROM users WHERE LOWER(email) = ?')
    .get(email.trim().toLowerCase()) as { id: string; password_hash: string } | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const user = getUserById(row.id)!;
  const token = createSession(row.id);
  res.json({ token, user });
});

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  if (req.authToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.authToken);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

// Users directory
app.get('/api/users', requireAuth, (_req, res) => {
  res.json({ users: getAllUsers() });
});

// Projects CRUD & Members
app.get('/api/projects', requireAuth, (req: AuthedRequest, res) => {
  const projects = getProjectsForUser(req.user!.id);
  res.json({ projects });
});

app.post('/api/projects', requireAuth, (req: AuthedRequest, res) => {
  const { name, description, keyPrefix, color, memberIds } = req.body as {
    name?: string;
    description?: string;
    keyPrefix?: string;
    color?: string;
    memberIds?: string[];
  };

  if (!name?.trim()) {
    res.status(400).json({ error: 'Project name is required.' });
    return;
  }

  const cleanPrefix = (keyPrefix?.trim() || name.trim().slice(0, 4))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5) || 'PROJ';

  const id = `prj_${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const projectColor = color || '#2563EB';

  db.prepare(
    `INSERT INTO projects (id, name, description, key_prefix, color, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), (description ?? '').trim(), cleanPrefix, projectColor, req.user!.id, createdAt);

  const insertMember = db.prepare(
    `INSERT OR IGNORE INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`
  );
  insertMember.run(id, req.user!.id, 'owner', createdAt);

  const uniqueMemberIds = Array.from(new Set(memberIds ?? [])).filter(
    (uid) => uid !== req.user!.id && Boolean(getUserById(uid))
  );

  for (const uid of uniqueMemberIds) {
    insertMember.run(id, uid, 'member', createdAt);
    const notif = createNotificationRecord({
      userId: uid,
      actorId: req.user!.id,
      projectId: id,
      taskId: null,
      type: 'project_invite',
      message: `${req.user!.name} added you to group project "${name.trim()}"`,
    });
    sendToUser(uid, { type: 'notification:new', notification: notif });
  }

  const project = getProjectById(id)!;
  broadcastToProjectMembers(id, { type: 'project:created', project });
  res.status(201).json({ project });
});

app.patch('/api/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  const projectId = String(req.params.id);
  const role = getProjectMemberRole(projectId, req.user!.id);
  if (!role || (role !== 'owner' && role !== 'admin')) {
    res.status(403).json({ error: 'Only project owners or admins can update project settings.' });
    return;
  }

  const existing = getProjectById(projectId);
  if (!existing) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const { name, description, color } = req.body as {
    name?: string;
    description?: string;
    color?: string;
  };

  db.prepare(`UPDATE projects SET name = ?, description = ?, color = ? WHERE id = ?`).run(
    name?.trim() || existing.name,
    description !== undefined ? description.trim() : existing.description,
    color || existing.color,
    projectId
  );

  const updated = getProjectById(projectId)!;
  broadcastToProjectMembers(projectId, { type: 'project:updated', project: updated });
  res.json({ project: updated });
});

app.delete('/api/projects/:id', requireAuth, (req: AuthedRequest, res) => {
  const projectId = String(req.params.id);
  const role = getProjectMemberRole(projectId, req.user!.id);
  if (role !== 'owner') {
    res.status(403).json({ error: 'Only the project owner can delete this project.' });
    return;
  }

  const project = getProjectById(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const memberIds = project.members.map((m) => m.userId);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

  for (const uid of memberIds) {
    sendToUser(uid, { type: 'project:deleted', projectId });
  }
  res.json({ ok: true });
});

app.post('/api/projects/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const projectId = String(req.params.id);
  if (!isProjectMember(projectId, req.user!.id)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const { userId, role } = req.body as { userId?: string; role?: 'admin' | 'member' };
  if (!userId || !getUserById(userId)) {
    res.status(400).json({ error: 'Valid user is required.' });
    return;
  }

  if (isProjectMember(projectId, userId)) {
    res.status(409).json({ error: 'User is already a member of this project.' });
    return;
  }

  const project = getProjectById(projectId)!;
  db.prepare(
    `INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`
  ).run(projectId, userId, role === 'admin' ? 'admin' : 'member', new Date().toISOString());

  const notif = createNotificationRecord({
    userId,
    actorId: req.user!.id,
    projectId,
    taskId: null,
    type: 'project_invite',
    message: `${req.user!.name} added you to "${project.name}"`,
  });
  sendToUser(userId, { type: 'notification:new', notification: notif });

  const updated = getProjectById(projectId)!;
  broadcastToProjectMembers(projectId, { type: 'project:updated', project: updated });
  sendToUser(userId, { type: 'project:created', project: updated });
  res.status(201).json({ project: updated });
});

app.delete('/api/projects/:id/members/:userId', requireAuth, (req: AuthedRequest, res) => {
  const projectId = String(req.params.id);
  const targetUserId = String(req.params.userId);

  const actorRole = getProjectMemberRole(projectId, req.user!.id);
  if (!actorRole) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const targetRole = getProjectMemberRole(projectId, targetUserId);
  if (!targetRole) {
    res.status(404).json({ error: 'Member not found in project.' });
    return;
  }

  if (targetRole === 'owner') {
    res.status(400).json({ error: 'Project owner cannot be removed.' });
    return;
  }

  if (req.user!.id !== targetUserId && actorRole !== 'owner' && actorRole !== 'admin') {
    res.status(403).json({ error: 'Only project owners or admins can remove other members.' });
    return;
  }

  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(
    projectId,
    targetUserId
  );

  // Unassign any tasks in this project assigned to the removed user
  db.prepare('UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?').run(
    projectId,
    targetUserId
  );

  const updated = getProjectById(projectId)!;
  broadcastToProjectMembers(projectId, { type: 'project:updated', project: updated });
  sendToUser(targetUserId, { type: 'project:deleted', projectId });
  res.json({ project: updated });
});

// Tasks CRUD
app.get('/api/tasks/mine', requireAuth, (req: AuthedRequest, res) => {
  const tasks = getTasksAssignedToUser(req.user!.id);
  res.json({ tasks });
});

app.get('/api/projects/:id/tasks', requireAuth, (req: AuthedRequest, res) => {
  const projectId = String(req.params.id);
  if (!isProjectMember(projectId, req.user!.id)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  const tasks = getTasksForProject(projectId);
  res.json({ tasks });
});

app.post('/api/projects/:id/tasks', requireAuth, (req: AuthedRequest, res) => {
  const projectId = String(req.params.id);
  if (!isProjectMember(projectId, req.user!.id)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const project = getProjectById(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const { title, description, status, priority, assigneeId, dueDate } = req.body as {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string | null;
    dueDate?: string | null;
  };

  if (!title?.trim()) {
    res.status(400).json({ error: 'Task title is required.' });
    return;
  }

  const validStatuses: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
  const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

  const taskStatus: TaskStatus = status && validStatuses.includes(status) ? status : 'todo';
  const taskPriority: TaskPriority =
    priority && validPriorities.includes(priority) ? priority : 'medium';

  const cleanAssignee =
    assigneeId && isProjectMember(projectId, assigneeId) ? assigneeId : null;

  const taskId = `tsk_${crypto.randomUUID().slice(0, 8)}`;
  const taskCode = nextTaskCode(projectId, project.keyPrefix);
  const now = new Date().toISOString();

  const maxPosRow = db
    .prepare('SELECT COALESCE(MAX(position), -1) as max_pos FROM tasks WHERE project_id = ? AND status = ?')
    .get(projectId, taskStatus) as { max_pos: number };

  db.prepare(
    `INSERT INTO tasks (id, project_id, task_code, title, description, status, priority, assignee_id, creator_id, due_date, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taskId,
    projectId,
    taskCode,
    title.trim(),
    (description ?? '').trim(),
    taskStatus,
    taskPriority,
    cleanAssignee,
    req.user!.id,
    dueDate || null,
    (maxPosRow.max_pos ?? -1) + 1,
    now,
    now
  );

  const task = getTaskById(taskId)!;
  const updatedProject = getProjectById(projectId)!;

  if (cleanAssignee && cleanAssignee !== req.user!.id) {
    const notif = createNotificationRecord({
      userId: cleanAssignee,
      actorId: req.user!.id,
      projectId,
      taskId,
      type: 'task_assigned',
      message: `${req.user!.name} assigned ${task.taskCode} ("${task.title}") to you`,
    });
    sendToUser(cleanAssignee, { type: 'notification:new', notification: notif });
  }

  broadcastToProjectMembers(projectId, { type: 'task:created', task });
  broadcastToProjectMembers(projectId, { type: 'project:updated', project: updatedProject });
  res.status(201).json({ task });
});

app.patch('/api/tasks/:id', requireAuth, (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const existing = getTaskById(taskId);
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  if (!isProjectMember(existing.projectId, req.user!.id)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const { title, description, status, priority, assigneeId, dueDate, position } = req.body as {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string | null;
    dueDate?: string | null;
    position?: number;
  };

  const nextTitle = title !== undefined ? title.trim() || existing.title : existing.title;
  const nextDescription =
    description !== undefined ? description.trim() : existing.description;
  const nextStatus = status ?? existing.status;
  const nextPriority = priority ?? existing.priority;
  const nextAssignee =
    assigneeId !== undefined
      ? assigneeId && isProjectMember(existing.projectId, assigneeId)
        ? assigneeId
        : null
      : existing.assigneeId;
  const nextDueDate = dueDate !== undefined ? dueDate || null : existing.dueDate;
  const nextPosition = position !== undefined ? position : existing.position;
  const updatedAt = new Date().toISOString();

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, status = ?, priority = ?, assignee_id = ?, due_date = ?, position = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    nextTitle,
    nextDescription,
    nextStatus,
    nextPriority,
    nextAssignee,
    nextDueDate,
    nextPosition,
    updatedAt,
    taskId
  );

  const updated = getTaskById(taskId)!;
  const updatedProject = getProjectById(existing.projectId)!;

  // Trigger real-time notifications on assignment or status move
  if (nextAssignee && nextAssignee !== existing.assigneeId && nextAssignee !== req.user!.id) {
    const notif = createNotificationRecord({
      userId: nextAssignee,
      actorId: req.user!.id,
      projectId: existing.projectId,
      taskId,
      type: 'task_assigned',
      message: `${req.user!.name} assigned ${updated.taskCode} ("${updated.title}") to you`,
    });
    sendToUser(nextAssignee, { type: 'notification:new', notification: notif });
  } else if (nextStatus !== existing.status) {
    const statusLabels: Record<TaskStatus, string> = {
      backlog: 'Backlog',
      todo: 'To Do',
      in_progress: 'In Progress',
      in_review: 'In Review',
      done: 'Done',
    };
    const notifyTargets = new Set<string>();
    if (updated.assigneeId && updated.assigneeId !== req.user!.id) {
      notifyTargets.add(updated.assigneeId);
    }
    if (updated.creatorId !== req.user!.id) {
      notifyTargets.add(updated.creatorId);
    }
    for (const targetUid of notifyTargets) {
      const notif = createNotificationRecord({
        userId: targetUid,
        actorId: req.user!.id,
        projectId: existing.projectId,
        taskId,
        type: 'task_moved',
        message: `${req.user!.name} moved ${updated.taskCode} to ${statusLabels[nextStatus]}`,
      });
      sendToUser(targetUid, { type: 'notification:new', notification: notif });
    }
  }

  broadcastToProjectMembers(existing.projectId, { type: 'task:updated', task: updated });
  broadcastToProjectMembers(existing.projectId, {
    type: 'project:updated',
    project: updatedProject,
  });

  res.json({ task: updated });
});

app.delete('/api/tasks/:id', requireAuth, (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const existing = getTaskById(taskId);
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  if (!isProjectMember(existing.projectId, req.user!.id)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  const updatedProject = getProjectById(existing.projectId)!;

  broadcastToProjectMembers(existing.projectId, {
    type: 'task:deleted',
    taskId,
    projectId: existing.projectId,
  });
  broadcastToProjectMembers(existing.projectId, {
    type: 'project:updated',
    project: updatedProject,
  });

  res.json({ ok: true });
});

// Comments
app.get('/api/tasks/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const task = getTaskById(taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  if (!isProjectMember(task.projectId, req.user!.id)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const comments = getCommentsForTask(taskId);
  res.json({ comments });
});

app.post('/api/tasks/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const task = getTaskById(taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  if (!isProjectMember(task.projectId, req.user!.id)) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const { body } = req.body as { body?: string };
  if (!body?.trim()) {
    res.status(400).json({ error: 'Comment text cannot be empty.' });
    return;
  }

  const commentId = `cmt_${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(commentId, taskId, req.user!.id, body.trim(), createdAt);

  db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(createdAt, taskId);

  const comment = getCommentsForTask(taskId).find((c) => c.id === commentId)!;
  const updatedTask = getTaskById(taskId)!;

  // Notify task assignee, creator, and previous commenters (except author)
  const previousCommenters = db
    .prepare('SELECT DISTINCT author_id FROM comments WHERE task_id = ?')
    .all(taskId) as Array<{ author_id: string }>;

  const targets = new Set<string>();
  if (task.assigneeId) targets.add(task.assigneeId);
  targets.add(task.creatorId);
  for (const row of previousCommenters) {
    targets.add(row.author_id);
  }
  targets.delete(req.user!.id);

  const snippet = body.trim().length > 60 ? `${body.trim().slice(0, 57)}...` : body.trim();
  for (const targetUid of targets) {
    if (isProjectMember(task.projectId, targetUid)) {
      const notif = createNotificationRecord({
        userId: targetUid,
        actorId: req.user!.id,
        projectId: task.projectId,
        taskId,
        type: 'task_comment',
        message: `${req.user!.name} commented on ${task.taskCode}: "${snippet}"`,
      });
      sendToUser(targetUid, { type: 'notification:new', notification: notif });
    }
  }

  broadcastToProjectMembers(task.projectId, {
    type: 'comment:created',
    comment,
    projectId: task.projectId,
  });
  broadcastToProjectMembers(task.projectId, {
    type: 'task:updated',
    task: updatedTask,
  });

  res.status(201).json({ comment });
});

app.delete('/api/comments/:id', requireAuth, (req: AuthedRequest, res) => {
  const commentId = String(req.params.id);
  const row = db
    .prepare('SELECT id, task_id, author_id FROM comments WHERE id = ?')
    .get(commentId) as { id: string; task_id: string; author_id: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Comment not found.' });
    return;
  }

  const task = getTaskById(row.task_id);
  if (!task) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  if (row.author_id !== req.user!.id) {
    res.status(403).json({ error: 'You can only delete your own comments.' });
    return;
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  const updatedTask = getTaskById(row.task_id)!;

  broadcastToProjectMembers(task.projectId, {
    type: 'comment:deleted',
    commentId,
    taskId: row.task_id,
    projectId: task.projectId,
  });
  broadcastToProjectMembers(task.projectId, {
    type: 'task:updated',
    task: updatedTask,
  });

  res.json({ ok: true });
});

// Notifications
app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const notifications = getNotificationsForUser(req.user!.id);
  res.json({ notifications });
});

app.patch('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
  const notifId = String(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
    notifId,
    req.user!.id
  );
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

async function startServer(): Promise<void> {
  const httpServer = http.createServer(app);

  // Attach WebSocket server to same HTTP server on /ws
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (reqUrl.pathname !== '/ws') {
      return;
    }

    const token = reqUrl.searchParams.get('token');
    const user = token ? getUserByToken(token) : null;
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, user);
    });
  });

  wss.on('connection', (ws: WebSocket, user: User) => {
    const client: ClientSocket = {
      ws,
      userId: user.id,
      userName: user.name,
      roomId: null,
    };
    clients.add(client);

    sendWs(ws, { type: 'connected', userId: user.id });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          projectId?: string;
          taskId?: string;
        };

        if (msg.type === 'room:join' && msg.projectId) {
          if (!isProjectMember(msg.projectId, client.userId)) return;
          const prevRoom = client.roomId;
          client.roomId = msg.projectId;
          if (prevRoom && prevRoom !== msg.projectId) {
            broadcastPresence(prevRoom);
          }
          broadcastPresence(msg.projectId);
        } else if (msg.type === 'task:typing' && msg.taskId && msg.projectId) {
          if (!isProjectMember(msg.projectId, client.userId)) return;
          broadcastToProjectMembers(msg.projectId, {
            type: 'task:typing',
            taskId: msg.taskId,
            projectId: msg.projectId,
            userId: client.userId,
            userName: client.userName,
          });
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      const prevRoom = client.roomId;
      clients.delete(client);
      if (prevRoom) {
        broadcastPresence(prevRoom);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

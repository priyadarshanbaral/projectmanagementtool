export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectMemberRole = 'owner' | 'admin' | 'member';
export type NotificationType = 'task_assigned' | 'task_comment' | 'task_moved' | 'project_invite';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  createdAt: string;
}

export interface ProjectMember {
  userId: string;
  role: ProjectMemberRole;
  joinedAt: string;
  user: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  keyPrefix: string;
  color: string;
  ownerId: string;
  createdAt: string;
  members: ProjectMember[];
  taskCounts: {
    total: number;
    done: number;
    inProgress: number;
  };
}

export interface Task {
  id: string;
  projectId: string;
  taskCode: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assignee: User | null;
  creatorId: string;
  creator: User | null;
  dueDate: string | null;
  position: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  author: User;
  body: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  actorId: string | null;
  actor: User | null;
  projectId: string | null;
  taskId: string | null;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export type WSEvent =
  | { type: 'connected'; userId: string }
  | { type: 'presence:update'; projectId: string; onlineUserIds: string[] }
  | { type: 'project:created'; project: Project }
  | { type: 'project:updated'; project: Project }
  | { type: 'project:deleted'; projectId: string }
  | { type: 'task:created'; task: Task }
  | { type: 'task:updated'; task: Task }
  | { type: 'task:deleted'; taskId: string; projectId: string }
  | { type: 'comment:created'; comment: TaskComment; projectId: string }
  | { type: 'comment:deleted'; commentId: string; taskId: string; projectId: string }
  | { type: 'notification:new'; notification: AppNotification }
  | { type: 'task:typing'; taskId: string; projectId: string; userId: string; userName: string };

export const TASK_COLUMNS: { id: TaskStatus; label: string; description: string }[] = [
  { id: 'backlog', label: 'Backlog', description: 'Scoped & queued' },
  { id: 'todo', label: 'To Do', description: 'Ready to pick up' },
  { id: 'in_progress', label: 'In Progress', description: 'Active work' },
  { id: 'in_review', label: 'In Review', description: 'QA & peer check' },
  { id: 'done', label: 'Done', description: 'Completed' },
];

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; textClass: string; dotColor: string; rank: number }
> = {
  urgent: { label: 'Urgent', textClass: 'text-red-600', dotColor: '#DC2626', rank: 4 },
  high: { label: 'High', textClass: 'text-amber-600', dotColor: '#D97706', rank: 3 },
  medium: { label: 'Medium', textClass: 'text-blue-600', dotColor: '#2563EB', rank: 2 },
  low: { label: 'Low', textClass: 'text-slate-500', dotColor: '#64748B', rank: 1 },
};

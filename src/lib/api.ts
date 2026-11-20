import type {
  AppNotification,
  Project,
  Task,
  TaskComment,
  TaskPriority,
  TaskStatus,
  User,
} from '../types';

const TOKEN_KEY = 'cadence_auth_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export const api = {
  auth: {
    demoUsers: () => request<{ users: User[] }>('/api/auth/demo-users'),
    login: (email: string, password: string) =>
      request<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (payload: { name: string; email: string; password: string; role?: string }) =>
      request<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    me: () => request<{ user: User }>('/api/auth/me'),
    logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  },
  users: {
    list: () => request<{ users: User[] }>('/api/users'),
  },
  projects: {
    list: () => request<{ projects: Project[] }>('/api/projects'),
    create: (payload: {
      name: string;
      description: string;
      keyPrefix: string;
      color: string;
      memberIds: string[];
    }) =>
      request<{ project: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: { name?: string; description?: string; color?: string }) =>
      request<{ project: Project }>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
    addMember: (projectId: string, userId: string, role: 'admin' | 'member' = 'member') =>
      request<{ project: Project }>(`/api/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
      }),
    removeMember: (projectId: string, userId: string) =>
      request<{ project: Project }>(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      }),
  },
  tasks: {
    listMine: () => request<{ tasks: Task[] }>('/api/tasks/mine'),
    listByProject: (projectId: string) =>
      request<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`),
    create: (
      projectId: string,
      payload: {
        title: string;
        description?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
        assigneeId?: string | null;
        dueDate?: string | null;
      }
    ) =>
      request<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (
      taskId: string,
      payload: Partial<{
        title: string;
        description: string;
        status: TaskStatus;
        priority: TaskPriority;
        assigneeId: string | null;
        dueDate: string | null;
        position: number;
      }>
    ) =>
      request<{ task: Task }>(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    delete: (taskId: string) =>
      request<{ ok: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  },
  comments: {
    list: (taskId: string) => request<{ comments: TaskComment[] }>(`/api/tasks/${taskId}/comments`),
    create: (taskId: string, body: string) =>
      request<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    delete: (commentId: string) =>
      request<{ ok: boolean }>(`/api/comments/${commentId}`, { method: 'DELETE' }),
  },
  notifications: {
    list: () => request<{ notifications: AppNotification[] }>('/api/notifications'),
    markRead: (id: string) =>
      request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () =>
      request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),
  },
};

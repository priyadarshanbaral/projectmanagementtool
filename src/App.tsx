import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Columns3,
  FolderPlus,
  LayoutList,
  LogOut,
  Menu,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { api, getAuthToken, setAuthToken } from './lib/api';
import {
  TASK_COLUMNS,
  type AppNotification,
  type Project,
  type Task,
  type TaskComment,
  type TaskPriority,
  type TaskStatus,
  type User,
  type WSEvent,
} from './types';
import { AuthScreen } from './components/AuthScreen';
import { Avatar, formatDueDate, PriorityIndicator, StatusIcon } from './components/Avatar';
import { CreateProjectModal } from './components/CreateProjectModal';
import { CreateTaskModal } from './components/CreateTaskModal';
import { KanbanBoard } from './components/KanbanBoard';
import { NotificationsPopover } from './components/NotificationsPopover';
import { ProjectMembersModal } from './components/ProjectMembersModal';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import { TaskListView } from './components/TaskListView';

type NavSection = 'project' | 'my-tasks' | 'team';
type ViewMode = 'board' | 'list';

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());

  // Core workspace state
  const [projects, setProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeSection, setActiveSection] = useState<NavSection>('project');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('board');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Task detail & comments
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [typingInfo, setTypingInfo] = useState<{ taskId: string; userName: string } | null>(null);

  // Notifications & Real-time WebSocket state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<AppNotification | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineByProject, setOnlineByProject] = useState<Record<string, string[]>>({});

  // Filters & Modals
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [createTaskStatus, setCreateTaskStatus] = useState<TaskStatus | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  const selectedTaskIdRef = useRef<string | null>(null);
  const currentUserRef = useRef<User | null>(null);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const selectedTask = useMemo(
    () =>
      tasks.find((t) => t.id === selectedTaskId) ??
      myTasks.find((t) => t.id === selectedTaskId) ??
      null,
    [tasks, myTasks, selectedTaskId]
  );

  const selectedTaskProject = useMemo(() => {
    if (!selectedTask) return activeProject;
    return projects.find((p) => p.id === selectedTask.projectId) ?? activeProject;
  }, [selectedTask, projects, activeProject]);

  // Verify existing token on mount
  useEffect(() => {
    const existing = getAuthToken();
    if (!existing) {
      setAuthChecking(false);
      return;
    }

    api.auth
      .me()
      .then((res) => {
        setCurrentUser(res.user);
        setToken(existing);
      })
      .catch(() => {
        setAuthToken(null);
        setToken(null);
        setCurrentUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [projRes, usersRes, notifRes, mineRes] = await Promise.all([
        api.projects.list(),
        api.users.list(),
        api.notifications.list(),
        api.tasks.listMine(),
      ]);
      setProjects(projRes.projects);
      setAllUsers(usersRes.users);
      setNotifications(notifRes.notifications);
      setMyTasks(mineRes.tasks);

      setActiveProjectId((prev) => {
        if (prev && projRes.projects.some((p) => p.id === prev)) return prev;
        return projRes.projects[0]?.id ?? null;
      });
    } catch {
      // Ignore transient errors during logout
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      void loadWorkspaceData();
    }
  }, [currentUser, loadWorkspaceData]);

  // Load tasks when active project changes
  const loadProjectTasks = useCallback(async (projectId: string) => {
    setLoadingTasks(true);
    try {
      const res = await api.tasks.listByProject(projectId);
      setTasks(res.tasks);
    } catch {
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && activeProjectId) {
      void loadProjectTasks(activeProjectId);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'room:join', projectId: activeProjectId }));
      }
    } else {
      setTasks([]);
    }
  }, [currentUser, activeProjectId, loadProjectTasks]);

  // Load comments when a task drawer opens
  useEffect(() => {
    if (!selectedTaskId) {
      setComments([]);
      return;
    }
    setLoadingComments(true);
    api.comments
      .list(selectedTaskId)
      .then((res) => setComments(res.comments))
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [selectedTaskId]);

  // Real-Time WebSocket Connection with exponential backoff & state re-sync
  useEffect(() => {
    if (!currentUser || !token) return;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    function connect() {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token!)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setWsConnected(true);
        if (activeProjectIdRef.current) {
          ws.send(JSON.stringify({ type: 'room:join', projectId: activeProjectIdRef.current }));
          void loadProjectTasks(activeProjectIdRef.current);
        }
        void loadWorkspaceData();
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(event.data as string) as WSEvent;

          switch (payload.type) {
            case 'presence:update':
              setOnlineByProject((prev) => ({
                ...prev,
                [payload.projectId]: payload.onlineUserIds,
              }));
              break;

            case 'project:created':
              setProjects((prev) =>
                prev.some((p) => p.id === payload.project.id) ? prev : [...prev, payload.project]
              );
              break;

            case 'project:updated':
              setProjects((prev) =>
                prev.map((p) => (p.id === payload.project.id ? payload.project : p))
              );
              break;

            case 'project:deleted':
              setProjects((prev) => {
                const next = prev.filter((p) => p.id !== payload.projectId);
                if (activeProjectIdRef.current === payload.projectId) {
                  setActiveProjectId(next[0]?.id ?? null);
                }
                return next;
              });
              break;

            case 'task:created':
              if (payload.task.projectId === activeProjectIdRef.current) {
                setTasks((prev) =>
                  prev.some((t) => t.id === payload.task.id) ? prev : [payload.task, ...prev]
                );
              }
              if (payload.task.assigneeId === currentUserRef.current?.id) {
                setMyTasks((prev) =>
                  prev.some((t) => t.id === payload.task.id) ? prev : [payload.task, ...prev]
                );
              }
              break;

            case 'task:updated':
              setTasks((prev) =>
                prev.map((t) => (t.id === payload.task.id ? payload.task : t))
              );
              setMyTasks((prev) => {
                const isMine = payload.task.assigneeId === currentUserRef.current?.id;
                const exists = prev.some((t) => t.id === payload.task.id);
                if (isMine && exists) {
                  return prev.map((t) => (t.id === payload.task.id ? payload.task : t));
                }
                if (isMine && !exists) {
                  return [payload.task, ...prev];
                }
                if (!isMine && exists) {
                  return prev.filter((t) => t.id !== payload.task.id);
                }
                return prev;
              });
              break;

            case 'task:deleted':
              setTasks((prev) => prev.filter((t) => t.id !== payload.taskId));
              setMyTasks((prev) => prev.filter((t) => t.id !== payload.taskId));
              if (selectedTaskIdRef.current === payload.taskId) {
                setSelectedTaskId(null);
              }
              break;

            case 'comment:created':
              if (payload.comment.taskId === selectedTaskIdRef.current) {
                setComments((prev) =>
                  prev.some((c) => c.id === payload.comment.id)
                    ? prev
                    : [...prev, payload.comment]
                );
              }
              break;

            case 'comment:deleted':
              if (payload.taskId === selectedTaskIdRef.current) {
                setComments((prev) => prev.filter((c) => c.id !== payload.commentId));
              }
              break;

            case 'notification:new':
              setNotifications((prev) =>
                prev.some((n) => n.id === payload.notification.id)
                  ? prev
                  : [payload.notification, ...prev]
              );
              setToastNotification(payload.notification);
              window.setTimeout(() => {
                setToastNotification((curr) =>
                  curr?.id === payload.notification.id ? null : curr
                );
              }, 5000);
              break;

            case 'task:typing':
              if (
                payload.taskId === selectedTaskIdRef.current &&
                payload.userId !== currentUserRef.current?.id
              ) {
                setTypingInfo({ taskId: payload.taskId, userName: payload.userName });
                window.setTimeout(() => {
                  setTypingInfo((curr) =>
                    curr?.taskId === payload.taskId && curr.userName === payload.userName
                      ? null
                      : curr
                  );
                }, 2600);
              }
              break;
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setWsConnected(false);
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [currentUser, token, loadProjectTasks, loadWorkspaceData]);

  function handleAuthenticated(newToken: string, user: User) {
    setAuthToken(newToken);
    setToken(newToken);
    setCurrentUser(user);
  }

  async function handleLogout() {
    try {
      await api.auth.logout();
    } catch {
      // Ignore
    }
    wsRef.current?.close();
    setAuthToken(null);
    setToken(null);
    setCurrentUser(null);
    setProjects([]);
    setTasks([]);
    setMyTasks([]);
    setSelectedTaskId(null);
    setNotifications([]);
  }

  // Task Mutations
  async function handleUpdateTask(
    taskId: string,
    patch: Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      priority: TaskPriority;
      assigneeId: string | null;
      dueDate: string | null;
    }>
  ) {
    // Optimistic update for snappy drag & drop and inline selects
    const previousTasks = tasks;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const nextAssignee =
          patch.assigneeId !== undefined
            ? patch.assigneeId
              ? allUsers.find((u) => u.id === patch.assigneeId) ?? t.assignee
              : null
            : t.assignee;
        return {
          ...t,
          ...patch,
          assignee: nextAssignee,
        };
      })
    );

    try {
      const res = await api.tasks.update(taskId, patch);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
      setMyTasks((prev) => {
        const isMine = res.task.assigneeId === currentUser?.id;
        const exists = prev.some((t) => t.id === taskId);
        if (isMine && exists) return prev.map((t) => (t.id === taskId ? res.task : t));
        if (isMine && !exists) return [res.task, ...prev];
        if (!isMine && exists) return prev.filter((t) => t.id !== taskId);
        return prev;
      });
    } catch {
      setTasks(previousTasks);
    }
  }

  async function handleQuickCreateTask(title: string, status: TaskStatus) {
    if (!activeProjectId) return;
    const res = await api.tasks.create(activeProjectId, { title, status, priority: 'medium' });
    setTasks((prev) => (prev.some((t) => t.id === res.task.id) ? prev : [res.task, ...prev]));
  }

  async function handleDeleteTask(taskId: string) {
    await api.tasks.delete(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setMyTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTaskId(null);
  }

  async function handleAddComment(taskId: string, body: string) {
    const res = await api.comments.create(taskId, body);
    setComments((prev) =>
      prev.some((c) => c.id === res.comment.id) ? prev : [...prev, res.comment]
    );
  }

  async function handleDeleteComment(commentId: string) {
    await api.comments.delete(commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  function handleNotifyTyping(taskId: string, projectId: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'task:typing', taskId, projectId }));
    }
  }

  async function handleMarkNotificationRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await api.notifications.markRead(id).catch(() => {});
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await api.notifications.markAllRead().catch(() => {});
  }

  function handleSelectNotification(n: AppNotification) {
    if (n.projectId) {
      setActiveSection('project');
      setActiveProjectId(n.projectId);
    }
    if (n.taskId) {
      setSelectedTaskId(n.taskId);
    }
  }

  // Filtered project tasks
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q) && !t.taskCode.toLowerCase().includes(q)) {
        return false;
      }
      if (assigneeFilter === 'unassigned' && t.assigneeId !== null) return false;
      if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && t.assigneeId !== assigneeFilter) {
        return false;
      }
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, searchQuery, assigneeFilter, priorityFilter]);

  const activeOnlineUserIds = activeProjectId ? onlineByProject[activeProjectId] ?? [] : [];

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500">Loading workspace...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar (256px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Row */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-blue-600 text-white font-display font-bold text-xs flex items-center justify-center">
              C
            </span>
            <span className="font-display text-base font-semibold text-slate-900 tracking-tight">
              Cadence
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-700 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Workspace Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setActiveSection('my-tasks');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                activeSection === 'my-tasks'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CheckSquare className="w-4 h-4 text-slate-500" />
                <span>My Tasks</span>
              </span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {myTasks.filter((t) => t.status !== 'done').length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('team');
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                activeSection === 'team'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-500" />
                <span>Team Directory</span>
              </span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {allUsers.length}
              </span>
            </button>
          </nav>

          {/* Group Projects Section */}
          <div>
            <div className="px-2.5 mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Group Projects</span>
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                title="Create new group project"
                aria-label="Create new group project"
                className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              {projects.map((p) => {
                const isActive = activeSection === 'project' && activeProjectId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActiveSection('project');
                      setActiveProjectId(p.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0 ml-2">
                      {p.taskCounts.total}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Group Project</span>
              </button>
            </div>
          </div>
        </div>

        {/* User Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar user={currentUser} size="md" online={wsConnected} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {currentUser.name}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{currentUser.role}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="p-1.5 text-slate-500 hover:text-slate-900 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {activeSection === 'project' && activeProject ? (
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-slate-400 hidden sm:inline whitespace-nowrap">Projects</span>
                <span className="text-slate-300 hidden sm:inline">/</span>
                <h1 className="font-display font-semibold text-slate-900 truncate">
                  {activeProject.name}
                </h1>
              </div>
            ) : activeSection === 'my-tasks' ? (
              <h1 className="font-display font-semibold text-slate-900 text-sm whitespace-nowrap">
                My Assigned Tasks
              </h1>
            ) : (
              <h1 className="font-display font-semibold text-slate-900 text-sm whitespace-nowrap">
                Team Directory
              </h1>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Real-time WebSocket Connection & Room Presence */}
            {activeSection === 'project' && activeProject && (
              <div className="hidden md:flex items-center gap-2 mr-1">
                <div className="flex -space-x-1.5">
                  {activeProject.members.slice(0, 4).map((m) => (
                    <Avatar
                      key={m.userId}
                      user={m.user}
                      size="sm"
                      online={activeOnlineUserIds.includes(m.userId)}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  {wsConnected ? 'Live sync' : 'Reconnecting'}
                </span>
              </div>
            )}

            <NotificationsPopover
              notifications={notifications}
              open={notificationsOpen}
              onToggle={() => setNotificationsOpen((v) => !v)}
              onClose={() => setNotificationsOpen(false)}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllRead}
              onSelectNotification={handleSelectNotification}
            />

            {activeSection === 'project' && activeProject && (
              <button
                type="button"
                onClick={() => setCreateTaskStatus('todo')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Task</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Project Workspace */}
        {activeSection === 'project' && activeProject && (
          <>
            {/* Workspace Toolbar */}
            <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Board vs List Segmented Switch */}
                <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setViewMode('board')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      viewMode === 'board'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                    <span>Board</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span>List</span>
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter tasks..."
                    className="pl-8 pr-3 py-1.5 w-44 sm:w-56 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                {/* Assignee Filter */}
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  aria-label="Filter by assignee"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {activeProject.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name}
                    </option>
                  ))}
                </select>

                {/* Priority Filter */}
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  aria-label="Filter by priority"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden xl:inline text-xs text-slate-500 max-w-xs truncate">
                  {activeProject.description}
                </span>
                <button
                  type="button"
                  onClick={() => setMembersModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>Members ({activeProject.members.length})</span>
                </button>
              </div>
            </div>

            {loadingTasks ? (
              <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {TASK_COLUMNS.map((c) => (
                  <div
                    key={c.id}
                    className="h-64 bg-slate-100 border border-slate-200 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : viewMode === 'board' ? (
              <KanbanBoard
                tasks={filteredTasks}
                onSelectTask={(t) => setSelectedTaskId(t.id)}
                onMoveTask={(taskId, newStatus) =>
                  handleUpdateTask(taskId, { status: newStatus })
                }
                onQuickCreateTask={handleQuickCreateTask}
                onOpenCreateModal={(status) => setCreateTaskStatus(status)}
              />
            ) : (
              <TaskListView
                tasks={filteredTasks}
                members={activeProject.members}
                onSelectTask={(t) => setSelectedTaskId(t.id)}
                onUpdateTask={handleUpdateTask}
                onOpenCreateModal={() => setCreateTaskStatus('todo')}
              />
            )}
          </>
        )}

        {/* Empty State if user has no projects */}
        {activeSection === 'project' && !activeProject && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Create your first group project
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Spin up a shared board, invite teammates, and start tracking tasks in real time.
              </p>
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>New Group Project</span>
              </button>
            </div>
          </div>
        )}

        {/* My Tasks Cross-Project View */}
        {activeSection === 'my-tasks' && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Assigned to {currentUser.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {myTasks.length} total tasks across {projects.length} group projects
                  </p>
                </div>
              </div>

              {myTasks.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                  <p className="text-sm text-slate-500">
                    No tasks are currently assigned to you. Pick up a task from any project board.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                        <th className="py-2.5 pl-4 pr-3 w-28">ID</th>
                        <th className="py-2.5 px-3">Task</th>
                        <th className="py-2.5 px-3 w-44">Project</th>
                        <th className="py-2.5 px-3 w-36">Status</th>
                        <th className="py-2.5 px-3 w-28">Priority</th>
                        <th className="py-2.5 pl-3 pr-4 w-28 text-right">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {myTasks.map((t) => {
                        const proj = projects.find((p) => p.id === t.projectId);
                        const due = formatDueDate(t.dueDate);
                        const colLabel =
                          TASK_COLUMNS.find((c) => c.id === t.status)?.label ?? t.status;
                        return (
                          <tr
                            key={t.id}
                            onClick={() => {
                              setActiveSection('project');
                              setActiveProjectId(t.projectId);
                              setSelectedTaskId(t.id);
                            }}
                            className="h-11 hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="pl-4 pr-3 font-mono text-xs text-slate-400 tabular-nums">
                              {t.taskCode}
                            </td>
                            <td className="px-3 font-medium text-slate-900">{t.title}</td>
                            <td className="px-3 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-2">
                                {proj && (
                                  <span
                                    className="w-2 h-2 rounded-xs shrink-0"
                                    style={{ backgroundColor: proj.color }}
                                  />
                                )}
                                <span className="truncate">{proj?.name ?? 'Project'}</span>
                              </span>
                            </td>
                            <td className="px-3">
                              <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                                <StatusIcon status={t.status} />
                                <span>{colLabel}</span>
                              </span>
                            </td>
                            <td className="px-3">
                              <PriorityIndicator priority={t.priority} />
                            </td>
                            <td className="pl-3 pr-4 text-right font-mono text-xs text-slate-500 tabular-nums">
                              {due ? due.text : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Directory View */}
        {activeSection === 'team' && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto">
              <div className="mb-5">
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Workspace Members
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All registered teammates available to collaborate on group projects and task cards.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allUsers.map((u) => {
                  const sharedProjects = projects.filter((p) =>
                    p.members.some((m) => m.userId === u.id)
                  );
                  return (
                    <div
                      key={u.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar user={u} size="lg" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {u.name}
                            {u.id === currentUser.id && (
                              <span className="ml-1.5 text-xs font-normal text-slate-400">
                                (You)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 truncate">{u.role}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400 truncate">
                            {u.email}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                        {sharedProjects.length === 0 ? (
                          <span>Not yet in your projects</span>
                        ) : (
                          <span>
                            Shared projects:{' '}
                            <span className="text-slate-800 font-medium">
                              {sharedProjects.map((p) => p.name).join(' · ')}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Notification Toast */}
      {toastNotification && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white border border-slate-800 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3">
          {toastNotification.actor && <Avatar user={toastNotification.actor} size="sm" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs leading-relaxed text-slate-100">{toastNotification.message}</p>
            <div className="mt-1.5 flex items-center gap-3">
              {toastNotification.taskId && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectNotification(toastNotification);
                    void handleMarkNotificationRead(toastNotification.id);
                    setToastNotification(null);
                  }}
                  className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  Open task
                </button>
              )}
              <button
                type="button"
                onClick={() => setToastNotification(null)}
                className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Task Detail & Threaded Comments */}
      {selectedTask && selectedTaskProject && (
        <TaskDetailDrawer
          task={selectedTask}
          project={selectedTaskProject}
          currentUser={currentUser}
          comments={comments}
          loadingComments={loadingComments}
          typingUserName={
            typingInfo && typingInfo.taskId === selectedTask.id ? typingInfo.userName : null
          }
          onClose={() => setSelectedTaskId(null)}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onNotifyTyping={handleNotifyTyping}
        />
      )}

      {/* Modals */}
      {createProjectOpen && (
        <CreateProjectModal
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setCreateProjectOpen(false)}
          onCreated={(proj) => {
            setProjects((prev) =>
              prev.some((p) => p.id === proj.id) ? prev : [...prev, proj]
            );
            setActiveSection('project');
            setActiveProjectId(proj.id);
          }}
        />
      )}

      {membersModalOpen && activeProject && (
        <ProjectMembersModal
          project={activeProject}
          currentUser={currentUser}
          allUsers={allUsers}
          onlineUserIds={activeOnlineUserIds}
          onClose={() => setMembersModalOpen(false)}
          onUpdated={(updated) => {
            setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          }}
          onDeleted={(deletedId) => {
            setProjects((prev) => {
              const next = prev.filter((p) => p.id !== deletedId);
              setActiveProjectId(next[0]?.id ?? null);
              return next;
            });
          }}
        />
      )}

      {createTaskStatus && activeProject && (
        <CreateTaskModal
          project={activeProject}
          initialStatus={createTaskStatus}
          onClose={() => setCreateTaskStatus(null)}
          onCreated={(task) => {
            setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [task, ...prev]));
          }}
        />
      )}
    </div>
  );
}

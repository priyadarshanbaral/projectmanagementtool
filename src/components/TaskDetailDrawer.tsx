import { useEffect, useRef, useState } from 'react';
import { Send, Trash2, X } from 'lucide-react';
import {
  TASK_COLUMNS,
  type Project,
  type Task,
  type TaskComment,
  type TaskPriority,
  type TaskStatus,
  type User,
} from '../types';
import { Avatar, formatRelativeTime, StatusIcon } from './Avatar';

interface TaskDetailDrawerProps {
  task: Task;
  project: Project;
  currentUser: User;
  comments: TaskComment[];
  loadingComments: boolean;
  typingUserName: string | null;
  onClose: () => void;
  onUpdateTask: (
    taskId: string,
    patch: Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      priority: TaskPriority;
      assigneeId: string | null;
      dueDate: string | null;
    }>
  ) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddComment: (taskId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onNotifyTyping: (taskId: string, projectId: string) => void;
}

export function TaskDetailDrawer({
  task,
  project,
  currentUser,
  comments,
  loadingComments,
  typingUserName,
  onClose,
  onUpdateTask,
  onDeleteTask,
  onAddComment,
  onDeleteComment,
  onNotifyTyping,
}: TaskDetailDrawerProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [commentBody, setCommentBody] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const lastTypingPingRef = useRef(0);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setConfirmDelete(false);
  }, [task.id, task.title, task.description]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function saveTitleIfChanged() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(task.title);
      return;
    }
    if (trimmed !== task.title) {
      setSavingMeta(true);
      try {
        await onUpdateTask(task.id, { title: trimmed });
      } finally {
        setSavingMeta(false);
      }
    }
  }

  async function saveDescriptionIfChanged() {
    if (description.trim() !== task.description) {
      setSavingMeta(true);
      try {
        await onUpdateTask(task.id, { description: description.trim() });
      } finally {
        setSavingMeta(false);
      }
    }
  }

  async function handleCommentSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!commentBody.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      await onAddComment(task.id, commentBody.trim());
      setCommentBody('');
    } finally {
      setSendingComment(false);
    }
  }

  function handleCommentChange(val: string) {
    setCommentBody(val);
    const now = Date.now();
    if (val.trim() && now - lastTypingPingRef.current > 2000) {
      lastTypingPingRef.current = now;
      onNotifyTyping(task.id, task.projectId);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Task ${task.taskCode} details`}
    >
      <aside
        className="w-full max-w-2xl bg-white h-full border-l border-slate-200 shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drawer Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <span className="text-xs font-medium text-slate-500 truncate">{project.name}</span>
            <span className="text-slate-300">/</span>
            <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
              {task.taskCode}
            </span>
            {savingMeta && (
              <span className="text-[11px] text-slate-400">Saving...</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                title="Delete task"
                aria-label="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 mr-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Title & Description */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitleIfChanged}
              className="w-full font-display text-xl font-semibold text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-600 focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:outline-none"
            />
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span>Created by {task.creator?.name ?? 'Team member'}</span>
              <span aria-hidden="true">·</span>
              <span>Updated {formatRelativeTime(task.updatedAt)}</span>
            </div>
          </div>

          {/* Metadata Controls Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-y border-slate-200">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Status
              </label>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50/70">
                <StatusIcon status={task.status} />
                <select
                  value={task.status}
                  onChange={(e) =>
                    onUpdateTask(task.id, { status: e.target.value as TaskStatus })
                  }
                  className="w-full text-xs font-medium text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                >
                  {TASK_COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Priority
              </label>
              <select
                value={task.priority}
                onChange={(e) =>
                  onUpdateTask(task.id, { priority: e.target.value as TaskPriority })
                }
                className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-900 border border-slate-200 rounded-lg bg-slate-50/70 focus:outline-none focus:border-blue-600 cursor-pointer"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Assignee
              </label>
              <select
                value={task.assigneeId ?? ''}
                onChange={(e) =>
                  onUpdateTask(task.id, { assigneeId: e.target.value || null })
                }
                className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-900 border border-slate-200 rounded-lg bg-slate-50/70 focus:outline-none focus:border-blue-600 cursor-pointer"
              >
                <option value="">Unassigned</option>
                {project.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={task.dueDate ?? ''}
                onChange={(e) =>
                  onUpdateTask(task.id, { dueDate: e.target.value || null })
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono text-slate-900 border border-slate-200 rounded-lg bg-slate-50/70 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescriptionIfChanged}
              placeholder="Add task details, technical notes, or acceptance criteria..."
              className="w-full px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 leading-relaxed"
            />
          </div>

          {/* Comments Discussion */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Discussion ({comments.length})
              </h3>
              {typingUserName && (
                <span className="text-xs text-blue-600 font-medium">
                  {typingUserName} is typing...
                </span>
              )}
            </div>

            {loadingComments ? (
              <div className="space-y-3 py-2">
                <div className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            ) : comments.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                No comments yet. Start a discussion with your teammates below.
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3">
                    <Avatar user={comment.author} size="md" />
                    <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200/80 rounded-lg px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs min-w-0">
                          <span className="font-semibold text-slate-900 truncate">
                            {comment.author.name}
                          </span>
                          <span className="text-slate-400 truncate">{comment.author.role}</span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-slate-400 whitespace-nowrap">
                            {formatRelativeTime(comment.createdAt)}
                          </span>
                        </div>
                        {comment.authorId === currentUser.id && (
                          <button
                            type="button"
                            onClick={() => onDeleteComment(comment.id)}
                            className="text-[11px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comment Composer Footer */}
        <form
          onSubmit={handleCommentSubmit}
          className="p-4 border-t border-slate-200 bg-slate-50/70"
        >
          <div className="flex items-start gap-3">
            <Avatar user={currentUser} size="md" />
            <div className="flex-1">
              <textarea
                rows={2}
                value={commentBody}
                onChange={(e) => handleCommentChange(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void handleCommentSubmit();
                  }
                }}
                placeholder="Write a comment... (Cmd/Ctrl + Enter to send)"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Real-time updates delivered to project members
                </span>
                <button
                  type="submit"
                  disabled={!commentBody.trim() || sendingComment}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingComment ? 'Sending...' : 'Comment'}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

import { useState } from 'react';
import { Calendar, MessageSquare, Plus } from 'lucide-react';
import {
  TASK_COLUMNS,
  type Task,
  type TaskStatus,
} from '../types';
import { Avatar, formatDueDate, PriorityIndicator, StatusIcon } from './Avatar';

interface KanbanBoardProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onQuickCreateTask: (title: string, status: TaskStatus) => Promise<void>;
  onOpenCreateModal: (status: TaskStatus) => void;
}

export function KanbanBoard({
  tasks,
  onSelectTask,
  onMoveTask,
  onQuickCreateTask,
  onOpenCreateModal,
}: KanbanBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [quickAddColumn, setQuickAddColumn] = useState<TaskStatus | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleQuickSubmit(e: React.FormEvent, status: TaskStatus) {
    e.preventDefault();
    if (!quickTitle.trim() || creating) return;
    setCreating(true);
    try {
      await onQuickCreateTask(quickTitle.trim(), status);
      setQuickTitle('');
      setQuickAddColumn(null);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 overflow-x-auto kanban-scroll p-6">
      <div className="flex items-start gap-4 min-w-max h-full">
        {TASK_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.id);
          const isOver = dragOverColumn === column.id;

          return (
            <section
              key={column.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverColumn !== column.id) {
                  setDragOverColumn(column.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverColumn === column.id) {
                  setDragOverColumn(null);
                }
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOverColumn(null);
                const droppedId = e.dataTransfer.getData('text/plain') || draggingTaskId;
                setDraggingTaskId(null);
                if (!droppedId) return;
                const task = tasks.find((t) => t.id === droppedId);
                if (task && task.status !== column.id) {
                  await onMoveTask(droppedId, column.id);
                }
              }}
              className={`w-[296px] shrink-0 flex flex-col max-h-full rounded-xl border transition-colors ${
                isOver
                  ? 'bg-blue-50/50 border-blue-300'
                  : 'bg-slate-100/80 border-slate-200/80'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-200/70">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon status={column.id} />
                  <h3 className="font-display text-xs font-semibold text-slate-900 truncate">
                    {column.label}
                  </h3>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {columnTasks.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCreateModal(column.id)}
                  title={`Add task to ${column.label}`}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Cards Container */}
              <div className="flex-1 overflow-y-auto kanban-scroll p-2.5 space-y-2.5">
                {columnTasks.length === 0 ? (
                  <div className="py-6 px-3 text-center text-xs text-slate-400">
                    No tasks in {column.label}
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    const due = formatDueDate(task.dueDate);
                    const isDragging = draggingTaskId === task.id;
                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingTaskId(task.id);
                          e.dataTransfer.setData('text/plain', task.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggingTaskId(null);
                          setDragOverColumn(null);
                        }}
                        onClick={() => onSelectTask(task)}
                        className={`group bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-3.5 cursor-pointer transition-all ${
                          isDragging ? 'opacity-50 scale-[0.98]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-mono text-[11px] font-medium text-slate-400 tabular-nums">
                            {task.taskCode}
                          </span>
                          <PriorityIndicator priority={task.priority} />
                        </div>

                        <h4 className="text-sm font-medium text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
                          {task.title}
                        </h4>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {task.assignee ? (
                              <>
                                <Avatar user={task.assignee} size="xs" />
                                <span className="text-xs text-slate-600 truncate">
                                  {task.assignee.name.split(' ')[0]}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">Unassigned</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 text-[11px] text-slate-500 tabular-nums shrink-0">
                            {due && (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  due.overdue && task.status !== 'done'
                                    ? 'text-red-600 font-medium'
                                    : 'text-slate-500'
                                }`}
                              >
                                <Calendar className="w-3 h-3" aria-hidden="true" />
                                <span>{due.text}</span>
                              </span>
                            )}
                            {task.commentCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <MessageSquare className="w-3 h-3" aria-hidden="true" />
                                <span>{task.commentCount}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}

                {quickAddColumn === column.id ? (
                  <form
                    onSubmit={(e) => handleQuickSubmit(e, column.id)}
                    className="bg-white border border-blue-300 rounded-lg p-2.5 space-y-2"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      placeholder="Task title..."
                      className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAddColumn(null);
                          setQuickTitle('');
                        }}
                        className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!quickTitle.trim() || creating}
                        className="px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              {/* Column Footer Quick Add */}
              {quickAddColumn !== column.id && (
                <div className="p-2 border-t border-slate-200/70">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddColumn(column.id);
                      setQuickTitle('');
                    }}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add task</span>
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

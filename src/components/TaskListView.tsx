import { Calendar, MessageSquare, Plus } from 'lucide-react';
import {
  TASK_COLUMNS,
  type ProjectMember,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../types';
import { Avatar, formatDueDate, PriorityIndicator, StatusIcon } from './Avatar';

interface TaskListViewProps {
  tasks: Task[];
  members: ProjectMember[];
  onSelectTask: (task: Task) => void;
  onUpdateTask: (
    taskId: string,
    patch: Partial<{ status: TaskStatus; priority: TaskPriority; assigneeId: string | null }>
  ) => Promise<void>;
  onOpenCreateModal: () => void;
}

export function TaskListView({
  tasks,
  members,
  onSelectTask,
  onUpdateTask,
  onOpenCreateModal,
}: TaskListViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <h3 className="font-display text-base font-semibold text-slate-900">
            No matching tasks found
          </h3>
          <p className="mt-1.5 text-sm text-slate-500">
            Adjust your filters or create a new task card to start collaborating with your team.
          </p>
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Task</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
              <th className="py-2.5 pl-4 pr-3 w-28">ID</th>
              <th className="py-2.5 px-3">Task</th>
              <th className="py-2.5 px-3 w-40">Status</th>
              <th className="py-2.5 px-3 w-36">Priority</th>
              <th className="py-2.5 px-3 w-48">Assignee</th>
              <th className="py-2.5 px-3 w-28 text-right">Due</th>
              <th className="py-2.5 pl-3 pr-4 w-20 text-right">Comments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {tasks.map((task) => {
              const due = formatDueDate(task.dueDate);
              return (
                <tr
                  key={task.id}
                  className="h-11 hover:bg-slate-50/80 transition-colors"
                >
                  <td className="pl-4 pr-3 font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                    {task.taskCode}
                  </td>
                  <td className="px-3">
                    <button
                      type="button"
                      onClick={() => onSelectTask(task)}
                      className="text-left font-medium text-slate-900 hover:text-blue-600 transition-colors line-clamp-1 cursor-pointer"
                    >
                      {task.title}
                    </button>
                  </td>
                  <td className="px-3">
                    <div className="inline-flex items-center gap-1.5">
                      <StatusIcon status={task.status} />
                      <select
                        value={task.status}
                        onChange={(e) =>
                          onUpdateTask(task.id, { status: e.target.value as TaskStatus })
                        }
                        aria-label={`Status for ${task.taskCode}`}
                        className="text-xs font-medium text-slate-700 bg-transparent hover:bg-slate-100 rounded px-1.5 py-1 focus:outline-none cursor-pointer"
                      >
                        {TASK_COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3">
                    <div className="inline-flex items-center gap-1">
                      <select
                        value={task.priority}
                        onChange={(e) =>
                          onUpdateTask(task.id, { priority: e.target.value as TaskPriority })
                        }
                        aria-label={`Priority for ${task.taskCode}`}
                        className="sr-only"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => onSelectTask(task)}
                        className="cursor-pointer"
                      >
                        <PriorityIndicator priority={task.priority} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      {task.assignee && <Avatar user={task.assignee} size="xs" />}
                      <select
                        value={task.assigneeId ?? ''}
                        onChange={(e) =>
                          onUpdateTask(task.id, { assigneeId: e.target.value || null })
                        }
                        aria-label={`Assignee for ${task.taskCode}`}
                        className="text-xs text-slate-700 bg-transparent hover:bg-slate-100 rounded px-1.5 py-1 focus:outline-none truncate max-w-[140px] cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.user.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                    {due ? (
                      <span
                        className={`inline-flex items-center justify-end gap-1 ${
                          due.overdue && task.status !== 'done'
                            ? 'text-red-600 font-medium'
                            : 'text-slate-500'
                        }`}
                      >
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        <span>{due.text}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="pl-3 pr-4 text-right font-mono text-xs text-slate-500 tabular-nums">
                    <button
                      type="button"
                      onClick={() => onSelectTask(task)}
                      className="inline-flex items-center justify-end gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{task.commentCount}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

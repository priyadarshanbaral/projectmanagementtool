import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Circle, Clock, Eye, Layers } from 'lucide-react';
import type { TaskPriority, TaskStatus, User } from '../types';
import { PRIORITY_META } from '../types';

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function Avatar({
  user,
  size = 'sm',
  online,
}: {
  user: Pick<User, 'name' | 'avatarColor'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  online?: boolean;
}) {
  const dims = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-6 h-6 text-[11px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  }[size];

  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none ${dims}`}
      style={{ backgroundColor: user.avatarColor }}
      title={user.name}
    >
      {getInitials(user.name)}
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
          title="Online now"
        />
      )}
    </span>
  );
}

export function PriorityIndicator({ priority }: { priority: TaskPriority }) {
  const meta = PRIORITY_META[priority];
  const Icon =
    priority === 'urgent'
      ? AlertCircle
      : priority === 'high'
        ? ArrowUp
        : priority === 'medium'
          ? ArrowRight
          : ArrowDown;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${meta.textClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'done') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />;
  }
  if (status === 'in_review') {
    return <Eye className="w-3.5 h-3.5 text-violet-600 shrink-0" aria-hidden="true" />;
  }
  if (status === 'in_progress') {
    return <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />;
  }
  if (status === 'todo') {
    return <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />;
  }
  return <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
}

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDueDate(dateStr: string | null): { text: string; overdue: boolean } | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T23:59:59`);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const overdue = dateStr < todayStr;
  const formatted = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { text: formatted, overdue };
}

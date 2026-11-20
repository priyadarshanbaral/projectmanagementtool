import { useEffect, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import type { AppNotification } from '../types';
import { Avatar, formatRelativeTime } from './Avatar';

interface NotificationsPopoverProps {
  notifications: AppNotification[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onSelectNotification: (notification: AppNotification) => void;
}

export function NotificationsPopover({
  notifications,
  open,
  onToggle,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onSelectNotification,
}: NotificationsPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold text-slate-900">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-xs text-slate-500 tabular-nums">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-slate-500">
                You are all caught up. Real-time updates on assignments and comments will appear here.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.isRead) onMarkRead(n.id);
                    onSelectNotification(n);
                    onClose();
                  }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                    n.isRead ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50/70'
                  }`}
                >
                  {n.actor ? (
                    <Avatar user={n.actor} size="sm" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                      C
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${n.isRead ? 'text-slate-600' : 'text-slate-900 font-medium'}`}>
                      {n.message}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{formatRelativeTime(n.createdAt)}</span>
                      {!n.isRead && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-blue-600 font-medium">Unread</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

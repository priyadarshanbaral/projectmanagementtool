import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Project, User } from '../types';
import { Avatar } from './Avatar';

interface CreateProjectModalProps {
  currentUser: User;
  allUsers: User[];
  onClose: () => void;
  onCreated: (project: Project) => void;
}

const PROJECT_COLORS = [
  { label: 'Cobalt', hex: '#2563EB' },
  { label: 'Teal', hex: '#0D9488' },
  { label: 'Violet', hex: '#7C3AED' },
  { label: 'Amber', hex: '#D97706' },
  { label: 'Crimson', hex: '#DC2626' },
  { label: 'Slate', hex: '#475569' },
];

export function CreateProjectModal({
  currentUser,
  allUsers,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [keyPrefix, setKeyPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherUsers = allUsers.filter((u) => u.id !== currentUser.id);

  function handleNameChange(val: string) {
    setName(val);
    if (!keyPrefix || keyPrefix === autoPrefix(name)) {
      setKeyPrefix(autoPrefix(val));
    }
  }

  function autoPrefix(val: string): string {
    return val
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
  }

  function toggleMember(uid: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.projects.create({
        name: name.trim(),
        description: description.trim(),
        keyPrefix: keyPrefix.trim() || autoPrefix(name) || 'PROJ',
        color,
        memberIds: selectedMemberIds,
      });
      onCreated(res.project);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="create-project-title" className="font-display text-base font-semibold text-slate-900">
            New Group Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Project Name
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Mobile Onboarding"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Task Key
              </label>
              <input
                type="text"
                required
                maxLength={5}
                value={keyPrefix}
                onChange={(e) => setKeyPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="MOBL"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Goals, scope, and shared milestones for this group board."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Project Marker Color
            </label>
            <div className="flex items-center gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  aria-label={c.label}
                  className={`w-7 h-7 rounded-md flex items-center justify-center transition-transform cursor-pointer ${
                    color === c.hex ? 'ring-2 ring-offset-2 ring-slate-900 scale-105' : ''
                  }`}
                  style={{ backgroundColor: c.hex }}
                >
                  {color === c.hex && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Invite Team Members
              </label>
              <span className="text-xs text-slate-500 tabular-nums">
                {selectedMemberIds.length + 1} members total
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {otherUsers.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">
                  No other registered users yet. Invite colleagues after they create an account.
                </div>
              ) : (
                otherUsers.map((u) => {
                  const checked = selectedMemberIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar user={u} size="sm" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {u.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {u.role} · {u.email}
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(u.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

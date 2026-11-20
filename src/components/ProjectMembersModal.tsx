import { useState } from 'react';
import { Trash2, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Project, User } from '../types';
import { Avatar } from './Avatar';

interface ProjectMembersModalProps {
  project: Project;
  currentUser: User;
  allUsers: User[];
  onlineUserIds: string[];
  onClose: () => void;
  onUpdated: (project: Project) => void;
  onDeleted: (projectId: string) => void;
}

export function ProjectMembersModal({
  project,
  currentUser,
  allUsers,
  onlineUserIds,
  onClose,
  onUpdated,
  onDeleted,
}: ProjectMembersModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [selectedAddUserId, setSelectedAddUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myMembership = project.members.find((m) => m.userId === currentUser.id);
  const isOwner = myMembership?.role === 'owner';
  const canManage = isOwner || myMembership?.role === 'admin';

  const existingIds = new Set(project.members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !existingIds.has(u.id));

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.projects.update(project.id, {
        name: name.trim(),
        description: description.trim(),
      });
      onUpdated(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember() {
    if (!selectedAddUserId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.projects.addMember(project.id, selectedAddUserId, 'member');
      setSelectedAddUserId('');
      onUpdated(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(uid: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.projects.removeMember(project.id, uid);
      onUpdated(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProject() {
    setBusy(true);
    setError(null);
    try {
      await api.projects.delete(project.id);
      onDeleted(project.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-settings-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <h2 id="project-settings-title" className="font-display text-base font-semibold text-slate-900">
              {project.name} — Team &amp; Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {canManage && (
            <form onSubmit={handleSaveDetails} className="space-y-3 pb-5 border-b border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project Title
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prefix Key
                  </label>
                  <input
                    type="text"
                    disabled
                    value={project.keyPrefix}
                    className="w-full px-3 py-1.5 text-sm font-mono bg-slate-50 text-slate-500 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Save Details
                </button>
              </div>
            </form>
          )}

          {/* Add Member */}
          <div>
            <h3 className="text-xs font-semibold text-slate-700 mb-2">
              Project Members ({project.members.length})
            </h3>
            <div className="flex items-center gap-2 mb-3">
              <select
                value={selectedAddUserId}
                onChange={(e) => setSelectedAddUserId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="">
                  {availableUsers.length === 0
                    ? 'All workspace users are already members'
                    : 'Select a teammate to add...'}
                </option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedAddUserId || busy}
                onClick={handleAddMember}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {project.members.map((m) => {
                const isOnline = onlineUserIds.includes(m.userId);
                const canRemove =
                  m.role !== 'owner' && (canManage || m.userId === currentUser.id);
                return (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar user={m.user} size="sm" online={isOnline} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 truncate">
                          <span>{m.user.name}</span>
                          {m.userId === currentUser.id && (
                            <span className="text-slate-400 font-normal">(You)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {m.user.role} · {m.role}
                        </div>
                      </div>
                    </div>

                    {canRemove && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemoveMember(m.userId)}
                        className="text-xs font-medium text-slate-500 hover:text-red-600 px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        {m.userId === currentUser.id ? 'Leave' : 'Remove'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isOwner && (
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Permanently remove this group project and its tasks.
              </div>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Project</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDeleteProject}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

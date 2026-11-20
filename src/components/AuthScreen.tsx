import { useEffect, useState } from 'react';
import { ArrowRight, CheckSquare, Layers, MessageSquare, Users } from 'lucide-react';
import { api } from '../lib/api';
import type { User } from '../types';
import { Avatar } from './Avatar';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: User) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState<User[]>([]);

  useEffect(() => {
    api.auth
      .demoUsers()
      .then((res) => setDemoUsers(res.users))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.auth.login(email, password);
        onAuthenticated(res.token, res.user);
      } else {
        const res = await api.auth.register({ name, email, password, role });
        onAuthenticated(res.token, res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(demoEmail: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.login(demoEmail, 'password123');
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Narrative Column */}
      <div className="lg:w-1/2 bg-slate-900 text-white p-8 lg:p-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center font-display font-bold text-sm">
              C
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Cadence</span>
          </div>

          <div className="mt-14 max-w-lg">
            <h1 className="font-display text-3xl lg:text-4xl font-semibold tracking-tight leading-tight [text-wrap:balance]">
              Coordinate group projects, task boards, and team discussions in real time.
            </h1>
            <p className="mt-4 text-slate-300 text-base leading-relaxed">
              Built for engineering, design, and operations teams that need structured Kanban workflows, clear ownership, and live WebSocket synchronization across every workspace.
            </p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-4">
            <Users className="w-4 h-4 text-blue-400 mb-2.5" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Group Projects</h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Organize shared boards by initiative, manage team access, and track progress across every milestone.
            </p>
          </div>
          <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-4">
            <Layers className="w-4 h-4 text-blue-400 mb-2.5" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Kanban &amp; List Views</h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Drag cards across workflow stages or switch to a structured table for rapid triage.
            </p>
          </div>
          <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-4">
            <MessageSquare className="w-4 h-4 text-blue-400 mb-2.5" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Threaded Task Comments</h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Keep technical decisions and review notes attached directly to the work item.
            </p>
          </div>
          <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-4">
            <CheckSquare className="w-4 h-4 text-blue-400 mb-2.5" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Live Notifications</h2>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Instant WebSocket alerts for assignments, status transitions, and mentions.
            </p>
          </div>
        </div>
      </div>

      {/* Right Auth Column */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-900">
                {mode === 'login' ? 'Sign in to workspace' : 'Create your account'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {mode === 'login'
                  ? 'Enter your credentials or choose a team member below.'
                  : 'Register to join collaborative boards and create projects.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Role / Title
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Frontend Engineer"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="elena@cadence.app"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

          {demoUsers.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500">
                  Team Demo Accounts
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  pw: password123
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin(u.email)}
                    className="flex items-center gap-2.5 p-2.5 text-left border border-slate-200 hover:border-blue-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Avatar user={u} size="md" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {u.name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{u.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

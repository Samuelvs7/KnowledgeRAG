import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, Clock, Play, Trash2, CheckCircle2, Circle, Target, Flame } from 'lucide-react';

/**
 * StudyPlanner — a lightweight weekly study timetable.
 *
 * Lets the learner schedule topics across the week, tick them off, and launch a
 * lesson straight from a planned session. Persisted per-user in localStorage
 * (no backend needed); safe to move to a DB table later if cross-device sync is
 * wanted. All storage access is guarded so a blocked/again-empty store never crashes the page.
 */

type Level = 'beginner' | 'intermediate' | 'advanced';
interface StudySession { id: string; topic: string; level: Level; day: string; time?: string; done: boolean }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const todayName = DAYS[(new Date().getDay() + 6) % 7]; // JS Sun=0 → shift so Mon=0

function storageKey(userId: string) { return `knowledgerag.studyplan.${userId}`; }

function load(userId: string): StudySession[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function save(userId: string, sessions: StudySession[]) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(sessions)); } catch { /* ignore */ }
}

export function StudyPlanner({ userId, onStudy }: { userId: string; onStudy: (topic: string, level: Level) => void }) {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<Level>('beginner');
  const [day, setDay] = useState<string>(todayName);
  const [time, setTime] = useState('');

  useEffect(() => { setSessions(load(userId)); }, [userId]);
  const persist = (next: StudySession[]) => { setSessions(next); save(userId, next); };

  const add = () => {
    const t = topic.trim();
    if (!t) return;
    persist([...sessions, { id: crypto.randomUUID(), topic: t, level, day, time: time || undefined, done: false }]);
    setTopic(''); setTime('');
  };
  const toggle = (id: string) => persist(sessions.map(s => s.id === id ? { ...s, done: !s.done } : s));
  const remove = (id: string) => persist(sessions.filter(s => s.id !== id));

  const byDay = useMemo(() => {
    const map: Record<string, StudySession[]> = {};
    for (const d of DAYS) map[d] = [];
    for (const s of sessions) (map[s.day] || (map[s.day] = [])).push(s);
    for (const d of DAYS) map[d].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    return map;
  }, [sessions]);

  const total = sessions.length;
  const done = sessions.filter(s => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-slate-900 to-slate-900 p-6">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-orange-300 text-sm font-medium mb-1"><CalendarDays className="w-4 h-4" /> Study plan</div>
            <h1 className="text-2xl font-bold text-white">Your weekly timetable</h1>
            <p className="text-slate-400 text-sm mt-1">Plan topics across the week and launch a lesson with one tap.</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-white tabular-nums">{done}<span className="text-slate-500 text-lg">/{total}</span></div>
            <div className="text-xs text-slate-400 mb-1">sessions done</div>
            <div className="w-40 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Topic</label>
          <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="e.g. Dynamic Programming"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Level</label>
          <select value={level} onChange={e => setLevel(e.target.value as Level)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 capitalize focus:outline-none focus:ring-1 focus:ring-orange-500">
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Day</label>
          <select value={day} onChange={e => setDay(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500">
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Time</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500" />
        </div>
        <button onClick={add} disabled={!topic.trim()} className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Week grid */}
      {total === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No sessions yet. Add your first topic above to build this week's plan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {DAYS.map(d => {
            const items = byDay[d];
            const isToday = d === todayName;
            return (
              <div key={d} className={`rounded-2xl border p-3 ${isToday ? 'border-orange-500/40 bg-orange-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-bold ${isToday ? 'text-orange-300' : 'text-slate-300'}`}>{d}</span>
                  {isToday && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 flex items-center gap-1"><Flame className="w-3 h-3" /> Today</span>}
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-slate-600 py-3 text-center">Rest day</p>
                ) : (
                  <div className="space-y-2">
                    {items.map(s => (
                      <div key={s.id} className={`group rounded-xl border p-2.5 ${s.done ? 'border-slate-800 bg-slate-950/50 opacity-60' : 'border-slate-700 bg-slate-950'}`}>
                        <div className="flex items-start gap-2">
                          <button onClick={() => toggle(s.id)} className="mt-0.5 shrink-0">
                            {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-slate-500 hover:text-orange-400" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-medium leading-snug ${s.done ? 'line-through text-slate-500' : 'text-white'}`}>{s.topic}</div>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                              <span className="capitalize">{s.level}</span>
                              {s.time && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {s.time}</span>}
                            </div>
                          </div>
                          <button onClick={() => remove(s.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        {!s.done && (
                          <button onClick={() => onStudy(s.topic, s.level)} className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-orange-500/20 border border-slate-700 hover:border-orange-500/40 text-slate-200 rounded-lg text-xs font-medium transition-all">
                            <Play className="w-3 h-3 text-orange-400" /> Study now
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StudyPlanner;

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { FpvAssignment, ShotListItem, ShotStatus } from '../types';

const STORAGE_KEY = 'fpv_boss_shotlist';
const PILOTS_KEY = 'fpv_boss_shotlist_pilots'; // stores UNCHECKED pilot names

interface ShotListPanelProps {
  isOpen: boolean;
  onClose: () => void;
  assignments: FpvAssignment[]; // Dashboard's allAssignments
  pilots: string[];             // unique pilot names
}

function baseKey(daySection: string, pilot: string, assignment: string, flyTime: string): string {
  return `${daySection}|||${pilot}|||${assignment}|||${flyTime}`;
}

/**
 * Build/merge ShotListItem[] from the CSV assignments.
 * - Preserves status, edited notes and id for any row whose key still matches.
 * - New CSV rows become 'pending'.
 * - Hand-added (manual) items are always kept.
 */
function buildItemsFromAssignments(assignments: FpvAssignment[], existing: ShotListItem[]): ShotListItem[] {
  const existingById = new Map<string, ShotListItem>();
  existing.forEach(it => { if (!it.manual) existingById.set(it.id, it); });

  const seen = new Map<string, number>();
  const seeded: ShotListItem[] = assignments.map(a => {
    const bk = baseKey(a.daySection, a.pilot, a.assignment, a.flyTime || '');
    const occurrenceIndex = seen.get(bk) ?? 0;
    seen.set(bk, occurrenceIndex + 1);
    const id = `${bk}|||${occurrenceIndex}`;

    const prev = existingById.get(id);
    if (prev) {
      // Keep status, edited notes and id; refresh the descriptive CSV fields.
      return {
        ...prev,
        daySection: a.daySection,
        pilot: a.pilot,
        assignment: a.assignment,
        setTime: a.setTime ?? prev.setTime ?? '',
        stage: a.stage ?? prev.stage ?? '',
        flyTime: a.flyTime ?? prev.flyTime ?? '',
        dropTime: a.dropTime ?? prev.dropTime ?? '',
        manual: false,
      };
    }
    return {
      id,
      daySection: a.daySection,
      pilot: a.pilot,
      assignment: a.assignment,
      setTime: a.setTime ?? '',
      stage: a.stage ?? '',
      flyTime: a.flyTime ?? '',
      dropTime: a.dropTime ?? '',
      notes: a.notes ?? '',
      status: 'pending' as ShotStatus,
      manual: false,
    };
  });

  const manual = existing.filter(it => it.manual);
  return [...seeded, ...manual];
}

const htmlEscape = (v: string): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const csvEscape = (v: string): string => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const dateStr = (): string => new Date().toISOString().slice(0, 10);

function triggerDownload(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ShotListPanel({ isOpen, onClose, assignments, pilots }: ShotListPanelProps) {
  const [items, setItems] = useState<ShotListItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as ShotListItem[]) : [];
    } catch {
      return [];
    }
  });
  // We store the UNCHECKED pilots so new pilots default to checked.
  const [deselectedPilots, setDeselectedPilots] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(PILOTS_KEY);
      return saved ? new Set<string>(JSON.parse(saved) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [dayFilter, setDayFilter] = useState<string>('ALL');
  const [activePilot, setActivePilot] = useState<string>('ALL'); // which selected pilot is in view
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShotListItem | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem(PILOTS_KEY, JSON.stringify(Array.from(deselectedPilots)));
  }, [deselectedPilots]);

  const togglePilot = (p: string) => setDeselectedPilots(prev => {
    const next = new Set(prev);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });
  const checkAllPilots = () => setDeselectedPilots(new Set());
  const checkNonePilots = () => setDeselectedPilots(new Set(pilots));

  // Auto-seed on first open when nothing has been saved yet.
  useEffect(() => {
    if (isOpen && items.length === 0 && assignments.length > 0) {
      setItems(buildItemsFromAssignments(assignments, []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Checked pilots are "in scope" — this is the working set used for the exports.
  const scopedItems = useMemo(
    () => items.filter(it => !deselectedPilots.has(it.pilot)),
    [items, deselectedPilots]
  );

  // The checked pilots that actually have shots (used for the view toggle).
  const scopedPilots = useMemo(
    () => Array.from(new Set(scopedItems.map(it => it.pilot || '—'))),
    [scopedItems]
  );

  // If the active pilot got unchecked, fall back to ALL.
  const effectiveActive = activePilot !== 'ALL' && scopedPilots.includes(activePilot) ? activePilot : 'ALL';

  // What's on screen: scope narrowed to the active pilot (the toggle).
  const viewItems = useMemo(
    () => (effectiveActive === 'ALL' ? scopedItems : scopedItems.filter(it => (it.pilot || '—') === effectiveActive)),
    [scopedItems, effectiveActive]
  );

  // Summary + progress reflect what you're currently viewing.
  const counts = useMemo(() => {
    let completed = 0, skipped = 0, pending = 0;
    viewItems.forEach(it => {
      if (it.status === 'completed') completed++;
      else if (it.status === 'skipped') skipped++;
      else pending++;
    });
    return { completed, skipped, pending, total: viewItems.length };
  }, [viewItems]);

  // Ordered day sections (within the current view) + per-day progress.
  const days = useMemo(
    () => Array.from(new Set(viewItems.map(it => it.daySection || 'Unknown Day/Section'))),
    [viewItems]
  );
  const dayStats = useMemo(() => {
    const m = new Map<string, { total: number; pending: number }>();
    viewItems.forEach(it => {
      const d = it.daySection || 'Unknown Day/Section';
      const s = m.get(d) ?? { total: 0, pending: 0 };
      s.total++;
      if (it.status === 'pending') s.pending++;
      m.set(d, s);
    });
    return m;
  }, [viewItems]);

  const visibleItems = useMemo(
    () => viewItems.filter(it =>
      dayFilter === 'ALL' || (it.daySection || 'Unknown Day/Section') === dayFilter
    ),
    [viewItems, dayFilter]
  );

  // Group by PILOT, then by day within each pilot, so every pilot's days are
  // tracked completely independently of the others.
  const pilotGroups = useMemo(() => {
    const pilotOrder: string[] = [];
    const byPilot = new Map<string, ShotListItem[]>();
    visibleItems.forEach(it => {
      const p = it.pilot || '—';
      if (!byPilot.has(p)) { byPilot.set(p, []); pilotOrder.push(p); }
      byPilot.get(p)!.push(it);
    });
    return pilotOrder.map(p => {
      const dayOrder: string[] = [];
      const byDay = new Map<string, ShotListItem[]>();
      byPilot.get(p)!.forEach(it => {
        const d = it.daySection || 'Unknown Day/Section';
        if (!byDay.has(d)) { byDay.set(d, []); dayOrder.push(d); }
        byDay.get(d)!.push(it);
      });
      return { pilot: p, days: dayOrder.map(d => ({ day: d, rows: byDay.get(d)! })) };
    });
  }, [visibleItems]);

  if (!isOpen) return null;

  const completedPct = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;

  // ── Mutations ───────────────────────────────────────────────
  const updateItem = (id: string, patch: Partial<ShotListItem>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  };
  const toggleDone = (it: ShotListItem) =>
    updateItem(it.id, { status: it.status === 'completed' ? 'pending' : 'completed' });
  const toggleSkip = (it: ShotListItem) =>
    updateItem(it.id, { status: it.status === 'skipped' ? 'pending' : 'skipped' });
  const deleteItem = (it: ShotListItem) => {
    if (confirm(`Delete shot "${it.assignment || '(unnamed)'}"? This cannot be undone.`)) {
      setItems(prev => prev.filter(x => x.id !== it.id));
      if (editingId === it.id) { setEditingId(null); setDraft(null); }
    }
  };
  const startEdit = (it: ShotListItem) => { setEditingId(it.id); setDraft({ ...it }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const saveEdit = () => {
    if (draft) setItems(prev => prev.map(it => (it.id === draft.id ? draft : it)));
    cancelEdit();
  };

  // Mark every still-pending shot for THIS pilot on THIS day completed (skips kept).
  const markDayDone = (pilot: string, day: string) => {
    setItems(prev => prev.map(it =>
      (it.pilot || '—') === pilot && (it.daySection || 'Unknown Day/Section') === day && it.status === 'pending'
        ? { ...it, status: 'completed' }
        : it
    ));
  };
  // Re-open a finished pilot-day: that pilot's completed shots go back to pending.
  const reopenDay = (pilot: string, day: string) => {
    setItems(prev => prev.map(it =>
      (it.pilot || '—') === pilot && (it.daySection || 'Unknown Day/Section') === day && it.status === 'completed'
        ? { ...it, status: 'pending' }
        : it
    ));
  };

  const addShot = () => {
    const checked = pilots.filter(p => !deselectedPilots.has(p));
    const pilot = effectiveActive !== 'ALL' ? effectiveActive : (checked[0] ?? pilots[0] ?? '');
    const firstDay = dayFilter !== 'ALL' ? dayFilter : (items[0]?.daySection ?? assignments[0]?.daySection ?? 'Day 1');
    const newItem: ShotListItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      daySection: firstDay,
      pilot,
      assignment: '',
      setTime: '',
      stage: '',
      flyTime: '',
      dropTime: '',
      notes: '',
      status: 'pending',
      manual: true,
    };
    setItems(prev => [...prev, newItem]);
    startEdit(newItem);
  };

  const rebuild = () => {
    if (confirm('Rebuild the shot list from the current CSV?\n\nCompleted / skipped status and edited notes are KEPT for rows that still match. New CSV rows are added as pending, and hand-added shots are kept.')) {
      setItems(prev => buildItemsFromAssignments(assignments, prev));
    }
  };

  // ── Exports ─────────────────────────────────────────────────
  const exportCSV = () => {
    const header = ['Day', 'Pilot', 'Assignment', 'Set Time', 'Stage', 'Fly Time', 'Drop Time', 'Status', 'Notes'];
    const lines = [header.map(csvEscape).join(',')];
    scopedItems.forEach(it => {
      lines.push([it.daySection, it.pilot, it.assignment, it.setTime, it.stage, it.flyTime, it.dropTime, it.status, it.notes].map(csvEscape).join(','));
    });
    triggerDownload(lines.join('\r\n'), 'text/csv;charset=utf-8', `shotlist_${dateStr()}.csv`);
  };

  const exportHTML = () => {
    // Summary reflects the whole exported set (all checked pilots), not the view.
    let eDone = 0, eSkip = 0, ePend = 0;
    scopedItems.forEach(it => {
      if (it.status === 'completed') eDone++;
      else if (it.status === 'skipped') eSkip++;
      else ePend++;
    });
    const eTotal = scopedItems.length;
    const ePct = eTotal > 0 ? (eDone / eTotal) * 100 : 0;

    const pilotOrder: string[] = [];
    const byPilot = new Map<string, ShotListItem[]>();
    scopedItems.forEach(it => {
      const p = it.pilot || '(no pilot)';
      if (!byPilot.has(p)) { byPilot.set(p, []); pilotOrder.push(p); }
      byPilot.get(p)!.push(it);
    });

    const statusCell = (s: ShotStatus): string =>
      s === 'completed' ? '<span class="m done">&#10003; DONE</span>'
      : s === 'skipped' ? '<span class="m skip">&#10007; SKIPPED</span>'
      : '<span class="m pend">&bull; PENDING</span>';

    let bodyHtml = '';
    pilotOrder.forEach(p => {
      bodyHtml += `<h2>${htmlEscape(p)}</h2>`;
      const dayOrder: string[] = [];
      const byDay = new Map<string, ShotListItem[]>();
      byPilot.get(p)!.forEach(it => {
        const d = it.daySection || 'Unknown';
        if (!byDay.has(d)) { byDay.set(d, []); dayOrder.push(d); }
        byDay.get(d)!.push(it);
      });
      dayOrder.forEach(d => {
        bodyHtml += `<h3>${htmlEscape(d)}</h3><table><thead><tr><th>Status</th><th>Assignment</th><th>Stage / Times</th><th>Notes</th></tr></thead><tbody>`;
        byDay.get(d)!.forEach(it => {
          const meta = [
            it.stage ? htmlEscape(it.stage) : '',
            it.setTime ? 'Set ' + htmlEscape(it.setTime) : '',
            it.flyTime ? 'Fly ' + htmlEscape(it.flyTime) : '',
            it.dropTime ? 'Drop ' + htmlEscape(it.dropTime) : '',
          ].filter(Boolean).join(' &middot; ');
          const asg = it.assignment ? htmlEscape(it.assignment) : '<em>(unnamed)</em>';
          bodyHtml += `<tr class="${it.status}"><td>${statusCell(it.status)}</td><td class="asg">${asg}</td><td class="meta">${meta}</td><td class="notes">${htmlEscape(it.notes)}</td></tr>`;
        });
        bodyHtml += `</tbody></table>`;
      });
    });

    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shot List ${dateStr()}</title><style>
      *{box-sizing:border-box;}
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0d12;color:#e8edf2;margin:0;padding:32px;}
      h1{font-size:24px;margin:0 0 4px;letter-spacing:3px;}
      .summary{font-size:14px;color:#9fb0c0;margin-bottom:6px;}
      .bar{height:10px;background:#1b2230;border-radius:6px;overflow:hidden;margin:10px 0 24px;max-width:480px;}
      .bar > i{display:block;height:100%;background:linear-gradient(90deg,#00ff88,#00cc6a);}
      h2{font-size:18px;margin:28px 0 4px;color:#00e5ff;border-bottom:1px solid #1b2230;padding-bottom:6px;letter-spacing:1px;}
      h3{font-size:12px;margin:16px 0 6px;color:#9fb0c0;text-transform:uppercase;letter-spacing:1px;}
      table{width:100%;border-collapse:collapse;margin-bottom:10px;}
      th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7c8a99;border-bottom:1px solid #1b2230;padding:6px 8px;}
      td{padding:8px;border-bottom:1px solid #141a24;vertical-align:top;font-size:13px;}
      td.asg{font-weight:700;}
      td.meta{color:#9fb0c0;font-size:12px;white-space:nowrap;}
      td.notes{color:#b9c4cf;font-size:12px;}
      tr.completed{background:rgba(0,255,136,0.06);}
      tr.completed td.asg{text-decoration:line-through;color:#00ff88;}
      tr.skipped{background:rgba(255,92,124,0.07);opacity:.8;}
      tr.skipped td.asg{color:#ff5c7c;}
      .m{font-weight:800;font-size:11px;white-space:nowrap;}
      .m.done{color:#00ff88;} .m.skip{color:#ff5c7c;} .m.pend{color:#9fb0c0;}
      @media print{
        body{background:#fff;color:#111;padding:10px;}
        h1{color:#111;} h2{color:#0a6f93;} h3{color:#444;}
        th{color:#555;border-color:#bbb;} td{border-color:#e2e2e2;}
        tr.completed{background:#eafff4;} tr.completed td.asg{color:#0a7a3c;}
        tr.skipped{background:#fff0f3;} tr.skipped td.asg{color:#b30021;}
        .m.done{color:#0a7a3c;} .m.skip{color:#b30021;} .m.pend{color:#666;}
        .bar{background:#eee;} .summary{color:#444;}
      }
    </style></head><body>
      <h1>SHOT LIST</h1>
      <div class="summary">${eDone} of ${eTotal} completed &middot; ${eSkip} skipped &middot; ${ePend} pending — generated ${htmlEscape(new Date().toLocaleString())}</div>
      <div class="bar"><i style="width:${ePct.toFixed(1)}%"></i></div>
      ${bodyHtml || '<p>No shots.</p>'}
    </body></html>`;

    triggerDownload(doc, 'text/html;charset=utf-8', `shotlist_${dateStr()}.html`);
  };

  // ── Style helpers ───────────────────────────────────────────
  // A completed day (nothing pending) turns RED so a finished day is unmistakable.
  const dayPill = (active: boolean, done: boolean): string =>
    `px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition border ${
      active
        ? 'bg-amber-500 text-slate-950 border-transparent'
        : done
        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
    }`;

  const cardClass = (status: ShotStatus, dayDone: boolean): string =>
    dayDone ? 'bg-rose-500/15 border border-rose-500/40'
    : status === 'completed' ? 'bg-emerald-500/10 border border-emerald-500/30'
    : status === 'skipped' ? 'bg-rose-500/10 border border-rose-500/30 opacity-70'
    : 'bg-slate-950 border border-amber-500/30';

  const editLabel = 'text-[10px] font-black text-slate-400 uppercase tracking-wider';
  const editInput = 'w-full mt-1 px-3 py-2 text-sm';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-stretch justify-center p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-3xl w-full max-w-7xl h-full flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="bg-slate-950 px-5 sm:px-6 py-4 border-b border-slate-800 space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl md:text-2xl font-black tracking-widest text-white">📋 SHOT LIST</h2>
              <p className="text-xs font-bold text-slate-400 mt-1">
                <span className="text-emerald-400">{counts.completed}</span> of {counts.total} completed ·{' '}
                <span className="text-rose-400">{counts.skipped}</span> skipped ·{' '}
                <span className="text-amber-400">{counts.pending}</span> pending
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={exportHTML} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase tracking-wider transition">⬇️ HTML</button>
              <button onClick={exportCSV} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase tracking-wider transition">⬇️ CSV</button>
              <button onClick={rebuild} className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wider transition hover:bg-amber-500/20">↻ Rebuild from CSV</button>
              <button onClick={onClose} className="px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-base font-black transition hover:bg-rose-500/30">✕</button>
            </div>
          </div>

          {/* progress bar */}
          <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${completedPct}%` }} />
          </div>

          {/* day filter pills */}
          {days.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-12 shrink-0">Day</span>
              <button onClick={() => setDayFilter('ALL')} className={dayPill(dayFilter === 'ALL', false)}>ALL</button>
              {days.map(d => {
                const s = dayStats.get(d);
                const done = !!s && s.total > 0 && s.pending === 0;
                return (
                  <button key={d} onClick={() => setDayFilter(d)} className={dayPill(dayFilter === d, done)}>
                    {d}{done ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          )}

          {/* pilot selection checkboxes — scopes the list AND the exports */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-12 shrink-0">Pilot</span>
            <button onClick={checkAllPilots} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 hover:bg-slate-700 transition">All</button>
            <button onClick={checkNonePilots} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 hover:bg-slate-700 transition">None</button>
            {pilots.map(p => {
              const checked = !deselectedPilots.has(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePilot(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition border ${
                    checked ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${checked ? 'bg-amber-500 text-slate-950 border-transparent' : 'border-slate-600 text-transparent'}`}>✓</span>
                  {p}
                </button>
              );
            })}
          </div>

          {/* active-pilot toggle — switch which selected pilot you're viewing */}
          {scopedPilots.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-12 shrink-0">View</span>
              <button onClick={() => setActivePilot('ALL')} className={dayPill(effectiveActive === 'ALL', false)}>ALL</button>
              {scopedPilots.map(p => {
                const its = scopedItems.filter(it => (it.pilot || '—') === p);
                const pdone = its.length > 0 && its.every(r => r.status !== 'pending');
                return (
                  <button key={p} onClick={() => setActivePilot(p)} className={dayPill(effectiveActive === p, pdone)}>
                    {p}{pdone ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* LIST */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-6">
          <button
            onClick={addShot}
            className="w-full py-3 rounded-2xl border border-dashed border-cyan-500/40 text-cyan-300 font-black text-sm uppercase tracking-widest hover:bg-cyan-400/10 transition"
          >
            ➕ Add Shot
          </button>

          {pilotGroups.length === 0 ? (
            <p className="text-center text-sm text-slate-500 italic py-12">
              No shots to show. Import a CSV or use “➕ Add Shot”.
            </p>
          ) : (
            pilotGroups.map(pg => (
              <div key={pg.pilot} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <span className="text-base md:text-lg font-black tracking-widest text-cyan-300 uppercase">🧑‍✈️ {pg.pilot}</span>
                </div>
                {pg.days.map(group => {
                  const dayDone = group.rows.length > 0 && group.rows.every(r => r.status !== 'pending');
                  return (
                  <div key={group.day} className="space-y-3">
                <h3 className={`text-sm font-black uppercase tracking-widest ${dayDone ? 'text-rose-400' : 'text-amber-400'}`}>
                  {group.day}
                  {dayDone && <span className="ml-2 text-[10px] font-black bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded align-middle">✓ DAY COMPLETE</span>}
                </h3>

                {group.rows.map(it => (
                  <div key={it.id} className={`rounded-2xl p-4 space-y-3 ${cardClass(it.status, dayDone)}`}>
                    {editingId === it.id && draft ? (
                      /* ── EDIT MODE ── */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className={editLabel}>Assignment
                            <input value={draft.assignment} onChange={e => setDraft({ ...draft, assignment: e.target.value })} className={editInput} />
                          </label>
                          <label className={editLabel}>Pilot
                            <select value={draft.pilot} onChange={e => setDraft({ ...draft, pilot: e.target.value })} className={editInput}>
                              {draft.pilot && !pilots.includes(draft.pilot) && <option value={draft.pilot}>{draft.pilot}</option>}
                              {pilots.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </label>
                          <label className={editLabel}>Day / Section
                            <input value={draft.daySection} onChange={e => setDraft({ ...draft, daySection: e.target.value })} className={editInput} />
                          </label>
                          <label className={editLabel}>Stage
                            <input value={draft.stage} onChange={e => setDraft({ ...draft, stage: e.target.value })} className={editInput} />
                          </label>
                          <label className={editLabel}>Set Time
                            <input value={draft.setTime} onChange={e => setDraft({ ...draft, setTime: e.target.value })} className={editInput} />
                          </label>
                          <label className={editLabel}>Fly Time
                            <input value={draft.flyTime} onChange={e => setDraft({ ...draft, flyTime: e.target.value })} className={editInput} />
                          </label>
                          <label className={editLabel}>Drop Time
                            <input value={draft.dropTime} onChange={e => setDraft({ ...draft, dropTime: e.target.value })} className={editInput} />
                          </label>
                        </div>
                        <label className={editLabel}>Notes
                          <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} rows={2} className={editInput} />
                        </label>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs uppercase tracking-widest transition">✓ Save</button>
                          <button onClick={cancelEdit} className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs uppercase tracking-widest transition">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      /* ── VIEW MODE ── */
                      <>
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleDone(it)}
                            title="Mark completed"
                            className={`mt-1 w-7 h-7 rounded-lg shrink-0 flex items-center justify-center border-2 font-black transition ${
                              it.status === 'completed'
                                ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                : 'border-slate-600 text-transparent hover:border-emerald-400'
                            }`}
                          >
                            ✓
                          </button>

                          <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-lg md:text-xl font-black tracking-wide break-words ${
                                dayDone ? 'line-through text-rose-300'
                                : it.status === 'completed' ? 'line-through text-emerald-400'
                                : it.status === 'skipped' ? 'text-rose-300'
                                : 'text-white'
                              }`}>
                                {it.assignment || '(unnamed shot)'}
                              </span>
                              {it.manual && <span className="text-[9px] font-black text-cyan-300 bg-cyan-400/10 px-2 py-0.5 rounded uppercase tracking-wider">added</span>}
                              {it.status === 'skipped' && <span className="text-[9px] font-black text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded uppercase tracking-wider">Skipped</span>}
                            </div>
                            <p className="text-xs font-mono text-slate-400 mt-1">
                              {[it.stage, it.setTime && `Set ${it.setTime}`, it.flyTime && `Fly ${it.flyTime}`, it.dropTime && `Drop ${it.dropTime}`].filter(Boolean).join('  ·  ') || 'no stage / times'}
                            </p>
                            <p className="text-[10px] font-mono text-slate-500 mt-0.5">{it.pilot || '—'}</p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => toggleSkip(it)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                                it.status === 'skipped'
                                  ? 'bg-rose-500/30 text-rose-300'
                                  : 'bg-slate-800 text-slate-300 hover:bg-rose-500/20 hover:text-rose-300'
                              }`}
                            >
                              Skip
                            </button>
                            <button onClick={() => startEdit(it)} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 hover:bg-slate-700 transition">✏️ Edit</button>
                            <button onClick={() => deleteItem(it)} className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-rose-950/40 text-rose-400 hover:bg-rose-950/60 transition">🗑</button>
                          </div>
                        </div>

                        <textarea
                          value={it.notes}
                          onChange={e => updateItem(it.id, { notes: e.target.value })}
                          rows={2}
                          placeholder={it.status === 'skipped' ? 'Why skipped? (e.g. artist cancelled, weather hold)…' : 'Notes…'}
                          className={`w-full text-xs rounded-xl px-3 py-2 resize-y ${it.status === 'skipped' ? 'border border-rose-500/40' : ''}`}
                        />
                      </>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => (dayDone ? reopenDay(pg.pilot, group.day) : markDayDone(pg.pilot, group.day))}
                  className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition border ${
                    dayDone
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-slate-800 text-slate-300 border-transparent hover:bg-slate-700'
                  }`}
                >
                  {dayDone ? '↩ Reopen Day' : `✓ Mark “${group.day}” Done`}
                </button>
              </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

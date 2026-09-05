import { ArrowDown, ArrowRight, RefreshCw, GitBranch, Columns2, Workflow, Network } from 'lucide-react';

/**
 * LessonDiagram — a dependency-free "visual board" for a lesson.
 *
 * The tutor returns a small, normalized diagram spec and we render it as one of
 * four clean, responsive layouts so a concept can be *seen*, not just read:
 *   - flow    : vertical steps connected by arrows (processes, algorithms)
 *   - cycle   : steps in sequence that loop back to the start (cycles, loops)
 *   - tree    : a root node with child nodes (hierarchies, taxonomies)
 *   - compare : two columns side by side (A vs B)
 *
 * Everything is HTML + Tailwind (plus tiny inline arrows), so there is no heavy
 * diagram library to install and nothing to break the build.
 */

export interface DiagramNode { label: string; detail?: string; group?: string }
export interface Diagram { kind: 'flow' | 'tree' | 'cycle' | 'compare'; title?: string; nodes: DiagramNode[] }

const KIND_META: Record<Diagram['kind'], { icon: typeof Workflow; label: string }> = {
  flow:    { icon: Workflow,  label: 'Step-by-step' },
  cycle:   { icon: RefreshCw, label: 'Cycle' },
  tree:    { icon: GitBranch, label: 'Hierarchy' },
  compare: { icon: Columns2,  label: 'Comparison' },
};

function NodeCard({ n, index, tone = 'amber' }: { n: DiagramNode; index?: number; tone?: 'amber' | 'slate' }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 w-full ${
      tone === 'amber' ? 'bg-amber-500/5 border-amber-500/25' : 'bg-slate-900 border-slate-700'
    }`}>
      {typeof index === 'number' && (
        <span className="shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-white text-xs font-bold flex items-center justify-center shadow">
          {index + 1}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white leading-snug">{n.label}</div>
        {n.detail && <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{n.detail}</div>}
      </div>
    </div>
  );
}

export function LessonDiagram({ diagram }: { diagram: Diagram }) {
  const nodes = (diagram?.nodes || []).filter(n => n && n.label);
  if (nodes.length === 0) return null;
  const kind = KIND_META[diagram.kind] ? diagram.kind : 'flow';
  const Meta = KIND_META[kind];

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center">
          <Network className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white leading-tight">{diagram.title || 'See it at a glance'}</h3>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-400/80">
            <Meta.icon className="w-3 h-3" /> {Meta.label}
          </div>
        </div>
      </div>

      {kind === 'flow' && (
        <div>
          {nodes.map((n, i) => (
            <div key={i}>
              <NodeCard n={n} index={i} />
              {i < nodes.length - 1 && (
                <div className="flex justify-center py-1.5"><ArrowDown className="w-4 h-4 text-amber-500/70" /></div>
              )}
            </div>
          ))}
        </div>
      )}

      {kind === 'cycle' && (
        <div>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
            {nodes.map((n, i) => (
              <div key={i} className="flex items-center gap-2 shrink-0">
                <div className="w-44"><NodeCard n={n} index={i} /></div>
                {i < nodes.length - 1 && <ArrowRight className="w-4 h-4 text-amber-500/70 shrink-0" />}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-amber-400/80">
            <RefreshCw className="w-3.5 h-3.5" /> …then it loops back to the start
          </div>
        </div>
      )}

      {kind === 'tree' && (
        <div className="flex flex-col items-center">
          <div className="max-w-sm w-full"><NodeCard n={nodes[0]} tone="amber" /></div>
          {nodes.length > 1 && (
            <>
              <div className="w-px h-4 bg-slate-700" />
              <div className="w-full h-px bg-slate-700 mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                {nodes.slice(1).map((n, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -top-3 left-1/2 w-px h-3 bg-slate-700" />
                    <NodeCard n={n} tone="slate" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {kind === 'compare' && (() => {
        const groups = Array.from(new Set(nodes.map(n => (n.group || '').toLowerCase()).filter(Boolean)));
        let left: DiagramNode[]; let right: DiagramNode[]; let leftLabel = 'Option A'; let rightLabel = 'Option B';
        if (groups.length >= 2) {
          leftLabel = groups[0]; rightLabel = groups[1];
          left = nodes.filter(n => (n.group || '').toLowerCase() === groups[0]);
          right = nodes.filter(n => (n.group || '').toLowerCase() === groups[1]);
        } else {
          const mid = Math.ceil(nodes.length / 2);
          left = nodes.slice(0, mid); right = nodes.slice(mid);
        }
        const Col = ({ label, items, tone }: { label: string; items: DiagramNode[]; tone: 'emerald' | 'blue' }) => (
          <div className={`rounded-xl border p-3 ${tone === 'emerald' ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-blue-500/5 border-blue-500/25'}`}>
            <div className={`text-xs font-bold uppercase tracking-wider mb-2 capitalize ${tone === 'emerald' ? 'text-emerald-300' : 'text-blue-300'}`}>{label}</div>
            <ul className="space-y-2">
              {items.map((n, i) => (
                <li key={i} className="text-sm text-slate-200">
                  <span className="font-medium text-white">{n.label}</span>
                  {n.detail && <span className="block text-xs text-slate-400 mt-0.5">{n.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
            <Col label={leftLabel} items={left} tone="emerald" />
            <Col label={rightLabel} items={right} tone="blue" />
          </div>
        );
      })()}
    </div>
  );
}

export default LessonDiagram;

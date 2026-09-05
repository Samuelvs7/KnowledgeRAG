import React, { useState, useMemo } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * RichMarkdown — a dependency-free Markdown renderer tuned for the app's dark theme.
 *
 * Turns an LLM's plain/markdown answer into structured, scannable content:
 * headings, bold/italic, inline code, fenced code blocks (with language label,
 * copy button and lightweight syntax highlighting), lists, blockquote callouts,
 * tables, links and rules. Everything is built from React elements (no
 * dangerouslySetInnerHTML), so it is XSS-safe by construction.
 *
 * `accent` tints headings / inline code / list markers so it can match the host
 * surface (purple in the codebase assistant, orange in the learning tutor).
 */

type Accent = 'purple' | 'orange' | 'emerald' | 'blue' | 'slate';

const ACCENT: Record<Accent, { text: string; codeText: string; codeBg: string; marker: string; bar: string }> = {
  purple:  { text: 'text-purple-300',  codeText: 'text-purple-200',  codeBg: 'bg-purple-500/10 border border-purple-500/20',   marker: 'text-purple-400',  bar: 'bg-purple-500' },
  orange:  { text: 'text-orange-300',  codeText: 'text-amber-200',   codeBg: 'bg-amber-500/10 border border-amber-500/20',     marker: 'text-orange-400',  bar: 'bg-orange-500' },
  emerald: { text: 'text-emerald-300', codeText: 'text-emerald-200', codeBg: 'bg-emerald-500/10 border border-emerald-500/20', marker: 'text-emerald-400', bar: 'bg-emerald-500' },
  blue:    { text: 'text-blue-300',    codeText: 'text-blue-200',    codeBg: 'bg-blue-500/10 border border-blue-500/20',       marker: 'text-blue-400',    bar: 'bg-blue-500' },
  slate:   { text: 'text-slate-200',   codeText: 'text-slate-200',   codeBg: 'bg-slate-800 border border-slate-700',           marker: 'text-slate-400',   bar: 'bg-slate-500' },
};

/* --------------------------- inline formatting --------------------------- */
// Splits a line into React nodes handling `code`, **bold**, *italic*, ~~strike~~, [links](url).
function renderInline(text: string, accent: Accent, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: inline code first (its contents must not be re-parsed).
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;
    if (tok.startsWith('`')) {
      nodes.push(
        <code key={key} className={`px-1.5 py-0.5 rounded font-mono text-[0.85em] ${ACCENT[accent].codeBg} ${ACCENT[accent].codeText}`}>
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(<strong key={key} className="font-semibold text-white">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('~~')) {
      nodes.push(<span key={key} className="line-through opacity-70">{tok.slice(2, -2)}</span>);
    } else if (tok.startsWith('[')) {
      const linkM = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (linkM) {
        nodes.push(
          <a key={key} href={linkM[2]} target="_blank" rel="noopener noreferrer" className={`${ACCENT[accent].text} underline underline-offset-2 hover:opacity-80`}>
            {linkM[1]}
          </a>,
        );
      } else nodes.push(tok);
    } else {
      // *italic* or _italic_
      nodes.push(<em key={key} className="italic text-slate-100">{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* --------------------------- syntax highlighting --------------------------- */
const KEYWORDS = new Set([
  'const','let','var','function','return','if','else','for','while','do','switch','case','break','continue',
  'class','extends','import','from','export','default','new','this','super','async','await','yield','try','catch',
  'finally','throw','typeof','instanceof','in','of','void','delete','null','undefined','true','false','def','elif',
  'lambda','pass','raise','with','as','not','and','or','is','None','True','False','self','print','public','private',
  'protected','static','final','interface','type','enum','struct','func','package','fn','use','pub','mut','impl',
  'match','where','select','from','insert','update','delete','create','table','join','on','group','order','by',
]);

// Very small, generic tokenizer → colored spans. Handles strings, comments, numbers, keywords.
function highlight(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // token: line comment | block comment | string | number | word | other
  const re = /(\/\/[^\n]*|#[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d._]*\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;
  let m: RegExpExecArray | null;
  let i = 0;
  let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  while ((m = re.exec(code)) !== null) {
    const key = `h${i++}`;
    if (m[1] || m[2]) { flush(); out.push(<span key={key} className="text-slate-500 italic">{m[0]}</span>); }
    else if (m[3]) { flush(); out.push(<span key={key} className="text-emerald-300">{m[0]}</span>); }
    else if (m[4]) { flush(); out.push(<span key={key} className="text-amber-300">{m[0]}</span>); }
    else if (m[5]) {
      if (KEYWORDS.has(m[5])) { flush(); out.push(<span key={key} className="text-purple-300 font-medium">{m[0]}</span>); }
      else if (re.lastIndex < code.length && code[re.lastIndex] === '(') { flush(); out.push(<span key={key} className="text-blue-300">{m[0]}</span>); }
      else buf += m[0];
    }
    else buf += m[0];
  }
  flush();
  return out;
}

function CodeBlock({ code, lang, accent }: { code: string; lang: string; accent: Accent }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-700/70 bg-slate-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800">
        <span className={`text-[10px] font-mono uppercase tracking-wider ${ACCENT[accent].marker}`}>{lang || 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
          {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-slate-200">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}

/* ------------------------------ block parsing ------------------------------ */
interface Block {
  type: 'code' | 'heading' | 'quote' | 'ul' | 'ol' | 'table' | 'hr' | 'p';
  content?: string;
  lang?: string;
  level?: number;
  items?: string[];
  rows?: string[][];
}

function parseBlocks(src: string): Block[] {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    // fenced code
    const fence = /^```(.*)$/.exec(line.trim());
    if (fence) {
      const lang = fence[1].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push({ type: 'code', content: body.join('\n'), lang });
      continue;
    }

    // blank
    if (line.trim() === '') { i++; continue; }

    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, content: h[2].trim() }); i++; continue; }

    // hr
    if (/^(\s*([-*_])\s*(\2\s*){2,})$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      blocks.push({ type: 'quote', content: body.join('\n') });
      continue;
    }

    // table (needs a header row then a |---| separator)
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      const rows: string[][] = [];
      const parseRow = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      rows.push(parseRow(line)); // header
      i += 2; // skip separator
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') { rows.push(parseRow(lines[i])); i++; }
      blocks.push({ type: 'table', rows });
      continue;
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // paragraph (gather consecutive non-empty, non-special lines)
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !/^```/.test(lines[i].trim()) && !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])
    ) { para.push(lines[i]); i++; }
    blocks.push({ type: 'p', content: para.join(' ') });
  }
  return blocks;
}

/* -------------------------------- component -------------------------------- */
export function RichMarkdown({ content, accent = 'slate', className = '' }: { content: string; accent?: Accent; className?: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const a = ACCENT[accent];

  return (
    <div className={`text-[13px] leading-relaxed text-slate-200 space-y-2 ${className}`}>
      {blocks.map((b, idx) => {
        const k = `b${idx}`;
        switch (b.type) {
          case 'code':
            return <CodeBlock key={k} code={b.content || ''} lang={b.lang || ''} accent={accent} />;
          case 'heading': {
            const size = b.level === 1 ? 'text-lg' : b.level === 2 ? 'text-base' : 'text-sm';
            return (
              <div key={k} className={`flex items-center gap-2 mt-4 mb-1 ${size} font-bold text-white`}>
                <span className={`w-1 h-4 rounded-full ${a.bar}`} />
                <span>{renderInline(b.content || '', accent, k)}</span>
              </div>
            );
          }
          case 'quote':
            return (
              <div key={k} className={`my-2 pl-3 py-2 border-l-2 ${a.bar} bg-slate-800/40 rounded-r-lg`}>
                <div className="text-slate-300">{renderInline(b.content || '', accent, k)}</div>
              </div>
            );
          case 'ul':
            return (
              <ul key={k} className="space-y-1 my-1">
                {(b.items || []).map((it, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.bar}`} />
                    <span>{renderInline(it, accent, `${k}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k} className="space-y-1 my-1">
                {(b.items || []).map((it, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className={`shrink-0 font-semibold ${a.marker} text-xs mt-0.5`}>{j + 1}.</span>
                    <span>{renderInline(it, accent, `${k}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'table':
            return (
              <div key={k} className="my-3 overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-xs">
                  <tbody>
                    {(b.rows || []).map((row, r) => (
                      <tr key={r} className={r === 0 ? 'bg-slate-800/80' : 'border-t border-slate-800'}>
                        {row.map((cell, c) => (
                          r === 0
                            ? <th key={c} className={`px-3 py-2 text-left font-semibold ${a.text}`}>{renderInline(cell, accent, `${k}-h${c}`)}</th>
                            : <td key={c} className="px-3 py-2 text-slate-300">{renderInline(cell, accent, `${k}-${r}-${c}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={k} className="my-4 border-slate-800" />;
          default:
            return <p key={k} className="text-slate-300">{renderInline(b.content || '', accent, k)}</p>;
        }
      })}
    </div>
  );
}

export default RichMarkdown;

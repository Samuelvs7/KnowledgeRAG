import {
  FileText,
  FolderOpen,
  Layers,
  Database,
  CheckCircle,
  HardDrive,
  MessageSquare,
  Bot,
} from 'lucide-react';

export interface DashboardMetricsProps {
  documentsCount: number;
  collectionsCount: number;
  totalChunks: number;
  totalEmbeddings: number;
  readyDocs: number;
  storageUsedFormatted: string;
  todayQueries: number;
  activeModel: string;
  gridCols?: string;
}

export function DashboardMetrics({
  documentsCount,
  collectionsCount,
  totalChunks,
  totalEmbeddings,
  readyDocs,
  storageUsedFormatted,
  todayQueries,
  activeModel,
  gridCols = 'grid-cols-2 sm:grid-cols-2',
}: DashboardMetricsProps) {
  const metrics = [
    { label: 'Documents', value: documentsCount.toLocaleString(), icon: FileText, tone: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Collections', value: collectionsCount.toLocaleString(), icon: FolderOpen, tone: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
    { label: 'Chunks', value: totalChunks.toLocaleString(), icon: Layers, tone: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    { label: 'Embeddings', value: totalEmbeddings.toLocaleString(), icon: Database, tone: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Indexed Files', value: readyDocs.toLocaleString(), icon: CheckCircle, tone: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
    { label: 'Storage Used', value: storageUsedFormatted, icon: HardDrive, tone: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'Queries Today', value: todayQueries.toLocaleString(), icon: MessageSquare, tone: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20' },
    { label: 'Active AI Model', value: activeModel, icon: Bot, tone: 'text-blue-300', bg: 'bg-blue-400/10 border-blue-400/20' },
  ];

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {metrics.map((item) => (
        <div
          key={item.label}
          className="group rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 transition-all hover:border-slate-700 hover:bg-slate-900"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${item.bg}`}>
              <item.icon className={`h-4 w-4 ${item.tone}`} />
            </div>
            <span className="text-[11px] font-medium text-slate-500">{item.label}</span>
          </div>
          <div className="truncate text-xl font-bold text-white tracking-tight">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

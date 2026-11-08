'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Bot,
  Sparkles,
  Database,
  ShieldCheck,
  Terminal,
  Copy,
  Check,
  Download,
  ExternalLink,
  FileText,
  UploadCloud,
  GitPullRequest,
  Trash2,
  Eye,
  Sun,
  Moon,
  Code2,
  Palette,
  Cloud,
  X,
  RefreshCw,
  CheckCircle2,
  Cpu,
  AlertTriangle,
  HardDrive,
  Search,
} from 'lucide-react';
import { GlassCapsuleButton } from '@/components/ui/glass-capsule-button';
import { SquircleKpiCard } from '@/components/ui/squircle-kpi-card';
import { TactilePillTabs } from '@/components/ui/tactile-pill-tabs';
import { AkiomWallDock } from '@/components/ui/akiom-wall-dock';
import { AGENT_CATEGORIES } from '@/types';
import { detectAgentCategory } from '@/lib/db';

interface AgentMd {
  id?: number;
  name: string;
  fileName: string;
  title: string;
  category?: string;
  whatItDoes: string;
  whenToUse: string;
  tags?: string[];
  content: string;
  chatCommand: string;
  sourceUrl?: string | null;
  license?: string | null;
  database?: string;
}

interface DbDetails {
  connected: boolean;
  configured: boolean;
  envVarName?: string;
  host?: string;
  databaseName?: string;
  tableExists?: boolean;
  agentCount?: number;
  timestamp?: string;
  message: string;
  error?: string;
}

const STORAGE_KEY = 'antigravity_hub_agents_v4';

export default function HomePage() {
  const [agents, setAgents] = useState<AgentMd[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'upload' | 'github'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Upload/Manual State
  const [uploadName, setUploadName] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('general');
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // GitHub Import State
  const [githubUrl, setGithubUrl] = useState('');
  const [githubCategory, setGithubCategory] = useState<string>('auto');
  const [isImporting, setIsImporting] = useState(false);
  const [githubStatus, setGithubStatus] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Modals & Diagnostic States
  const [previewAgent, setPreviewAgent] = useState<AgentMd | null>(null);
  const [showNeonModal, setShowNeonModal] = useState(false);
  const [showAntigravityGuide, setShowAntigravityGuide] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [dbDetails, setDbDetails] = useState<DbDetails | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4200);
  };

  // Toggle Theme
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const readFromStorage = (): AgentMd[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveToStorage = (list: AgentMd[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  };

  const checkNeonStatus = useCallback(async (forceInit = false) => {
    setIsCheckingDb(true);
    try {
      const res = await fetch('/api/db-status', {
        method: forceInit ? 'POST' : 'GET',
        cache: 'no-store',
      });
      const data: DbDetails = await res.json();
      setDbDetails(data);
      setDbConnected(!!data.connected);
      return data;
    } catch {
      return null;
    } finally {
      setIsCheckingDb(false);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    const cachedLocal = readFromStorage();

    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      const data = await res.json();

      const connected = Boolean(data.databaseConnected);
      setDbConnected(connected);

      if (data.dbError || data.dbMeta) {
        setDbDetails((prev) => ({
          connected,
          configured: Boolean(data.databaseConfigured),
          envVarName: data.dbMeta?.envVarName ?? prev?.envVarName,
          host: data.dbMeta?.host ?? prev?.host,
          databaseName: data.dbMeta?.databaseName ?? prev?.databaseName,
          tableExists: prev?.tableExists,
          agentCount: connected ? (data.agents?.length ?? 0) : prev?.agentCount,
          message:
            prev?.message ||
            (connected
              ? `Conectado ao Neon (${data.dbMeta?.databaseName || 'neondb'}).`
              : data.dbError
              ? 'Falha ao consultar o Neon PostgreSQL.'
              : 'DATABASE_URL ainda nao configurada neste ambiente.'),
          error: data.dbError ?? prev?.error,
        }));
      }

      let serverList: AgentMd[] = Array.isArray(data.agents) ? data.agents : [];

      if (connected) {
        // Auto-sync any agents previously saved in localStorage ('Cache Local') into Neon
        const serverNames = new Set(serverList.map((a) => a.name));
        const unsyncedLocal = cachedLocal.filter(
          (localAg) =>
            localAg &&
            localAg.name &&
            localAg.content &&
            localAg.database !== 'Neon PostgreSQL' &&
            !serverNames.has(localAg.name)
        );

        if (unsyncedLocal.length > 0) {
          try {
            const syncRes = await fetch('/api/agents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agents: unsyncedLocal }),
            });
            if (syncRes.ok) {
              const syncData = await syncRes.json();
              if (Array.isArray(syncData.agents) && syncData.agents.length > 0) {
                serverList = [...syncData.agents, ...serverList];
                showToast(
                  `${syncData.agents.length} agente(s) locais sincronizados com a tabela 'agents' na Neon.`
                );
              }
            }
          } catch {
            // ignore auto-sync failure
          }
        }

        setAgents(serverList);
        saveToStorage(serverList);
      } else {
        // When Neon is not connected (e.g. serverless fallback), merge server files + cached localStorage agents
        const mergedMap = new Map<string, AgentMd>();
        for (const item of serverList) {
          mergedMap.set(item.name, { ...item, database: 'Cache Local' });
        }
        for (const localItem of cachedLocal) {
          if (!mergedMap.has(localItem.name)) {
            mergedMap.set(localItem.name, { ...localItem, database: 'Cache Local' });
          }
        }
        const mergedList = Array.from(mergedMap.values());
        setAgents(mergedList);
        saveToStorage(mergedList);
      }
    } catch {
      if (cachedLocal.length > 0) {
        setAgents(cachedLocal);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    checkNeonStatus(false);
  }, [fetchAgents, checkNeonStatus]);

  const handleForceInitAndSync = async () => {
    setIsSyncingDb(true);
    try {
      const status = await checkNeonStatus(true);
      if (!status || !status.connected) {
        showToast(
          status?.error
            ? `Erro no Neon: ${status.error}`
            : 'Configure a variavel DATABASE_URL na Vercel e faca Redeploy primeiro.'
        );
        return;
      }

      if (agents.length > 0) {
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agents }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Falha ao sincronizar agentes com o Neon.');
          return;
        }
      }

      await fetchAgents();
      await checkNeonStatus(false);
      showToast('Tabela verificada e catalogo sincronizado com sucesso no Neon PostgreSQL.');
    } catch {
      showToast('Falha de rede ao sincronizar com o banco Neon.');
    } finally {
      setIsSyncingDb(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const baseName = file.name
      .replace(/\.md$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    setUploadName(baseName);
    setUploadStatus(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadContent(text);
      const autoCat = detectAgentCategory(baseName, text);
      setUploadCategory(autoCat);
      showToast(`Arquivo '${file.name}' carregado (Categoria detectada: ${getCategoryMeta(autoCat).label}).`);
    };
    reader.readAsText(file);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadName.trim() || !uploadContent.trim()) {
      showToast('Preencha o identificador e o conteudo markdown do agente.');
      return;
    }

    const cleanName =
      uploadName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/^-|-$/g, '') || 'custom-agent';

    setIsSavingManual(true);
    setUploadStatus(null);

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          content: uploadContent,
          category: uploadCategory,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.agent) {
        const updated = [data.agent, ...agents.filter((a) => a.name !== cleanName)];
        setAgents(updated);
        saveToStorage(updated);
        setUploadName('');
        setUploadContent('');

        if (data.savedInNeon) {
          setDbConnected(true);
          setUploadStatus({
            type: 'success',
            message: `Agente '${cleanName}.md' gravado na tabela 'agents' do Neon PostgreSQL.`,
          });
          showToast(`Agente '${cleanName}.md' salvo no Neon PostgreSQL.`);
          checkNeonStatus(false);
        } else {
          setUploadStatus({
            type: 'warning',
            message:
              data.warning ||
              'Salvo em Cache Local: adicione DATABASE_URL na Vercel e faca Redeploy para gravar na tabela da Neon.',
          });
          showToast(`Agente '${cleanName}.md' salvo localmente (conecte o Neon para persistir na nuvem).`);
        }
      } else {
        const errorMsg = data.error || 'Falha ao registrar agente no servidor.';
        setUploadStatus({
          type: 'error',
          message: errorMsg,
        });
        showToast(errorMsg);
        checkNeonStatus(false);
      }
    } catch {
      setUploadStatus({
        type: 'error',
        message: 'Erro de conexao com o servidor ao salvar agente.',
      });
      showToast('Erro de conexao ao salvar.');
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleImportGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) return;

    setIsImporting(true);
    setGithubStatus(null);

    try {
      const res = await fetch('/api/import-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: githubUrl,
          category: githubCategory === 'auto' ? undefined : githubCategory,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.valid) {
        const agentToAdd: AgentMd = data.agent || {
          name: data.name,
          fileName: `${data.name}.md`,
          title: data.title,
          category: data.category || (githubCategory === 'auto' ? undefined : githubCategory),
          whatItDoes: 'Agente importado do GitHub com licenca auditada.',
          whenToUse: 'Invoque no chat para executar tarefas desta especialidade.',
          tags: ['GitHub', data.license],
          content: data.content,
          chatCommand: `/${data.name}`,
          sourceUrl: githubUrl,
          license: data.license,
          database: data.savedInNeon ? 'Neon PostgreSQL' : 'Cache Local',
        };

        const updated = [agentToAdd, ...agents.filter((a) => a.name !== data.name)];
        setAgents(updated);
        saveToStorage(updated);
        setGithubUrl('');

        if (data.savedInNeon) {
          setDbConnected(true);
          setGithubStatus({
            type: 'success',
            message: `Agente '${data.name}.md' auditado (${data.license} — 0% risco legal) e gravado na tabela 'agents' do Neon PostgreSQL.`,
          });
          showToast(`Agente '${data.name}.md' salvo no Neon PostgreSQL.`);
          checkNeonStatus(false);
        } else {
          setGithubStatus({
            type: 'warning',
            message:
              data.warning ||
              `Licenca ${data.license} aprovada, mas salvo em Cache Local (configure DATABASE_URL na Vercel e faca Redeploy).`,
          });
          showToast(`Agente '${data.name}.md' salvo localmente.`);
        }
      } else {
        setGithubStatus({
          type: 'error',
          message: data.error || 'Falha ao auditar e importar repositorio.',
        });
      }
    } catch {
      setGithubStatus({
        type: 'error',
        message: 'Falha na conexao com o servico de importacao.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Remover permanentemente o agente ${name}.md?`)) return;

    const updated = agents.filter((a) => a.name !== name);
    setAgents(updated);
    saveToStorage(updated);
    showToast(`Agente '${name}.md' removido.`);

    try {
      const res = await fetch(`/api/agents?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (res.ok && dbConnected) {
        checkNeonStatus(false);
      }
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast(`Copiado para a area de transferencia.`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const downloadMd = (agent: AgentMd) => {
    const blob = new Blob([agent.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = agent.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategoryMeta = (catId?: string) => {
    const clean = (catId || 'general').toLowerCase();
    switch (clean) {
      case 'design':
        return {
          id: 'design',
          label: 'Design & UI/UX',
          accent: 'cyan' as const,
          badgeClass: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25',
          icon: <Palette className="w-3.5 h-3.5 text-cyan-500 shrink-0" strokeWidth={2} />,
          largeIcon: <Palette className="w-5 h-5 text-cyan-500" strokeWidth={2} />,
        };
      case 'development':
        return {
          id: 'development',
          label: 'Desenvolvimento',
          accent: 'emerald' as const,
          badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
          icon: <Code2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2} />,
          largeIcon: <Code2 className="w-5 h-5 text-emerald-500" strokeWidth={2} />,
        };
      case 'architecture':
        return {
          id: 'architecture',
          label: 'Arquitetura & Cloud',
          accent: 'violet' as const,
          badgeClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25',
          icon: <Cloud className="w-3.5 h-3.5 text-violet-500 shrink-0" strokeWidth={2} />,
          largeIcon: <Cloud className="w-5 h-5 text-violet-500" strokeWidth={2} />,
        };
      case 'security':
        return {
          id: 'security',
          label: 'Segurança & Review',
          accent: 'rose' as const,
          badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
          icon: <ShieldCheck className="w-3.5 h-3.5 text-rose-500 shrink-0" strokeWidth={2} />,
          largeIcon: <ShieldCheck className="w-5 h-5 text-rose-500" strokeWidth={2} />,
        };
      case 'data':
        return {
          id: 'data',
          label: 'Dados & IA / ML',
          accent: 'amber' as const,
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
          icon: <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={2} />,
          largeIcon: <Sparkles className="w-5 h-5 text-amber-500" strokeWidth={2} />,
        };
      case 'orchestration':
        return {
          id: 'orchestration',
          label: 'Orquestração & MCP',
          accent: 'cyan' as const,
          badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25',
          icon: <Layers className="w-3.5 h-3.5 text-sky-500 shrink-0" strokeWidth={2} />,
          largeIcon: <Layers className="w-5 h-5 text-sky-500" strokeWidth={2} />,
        };
      default:
        return {
          id: 'general',
          label: 'Geral',
          accent: 'slate' as const,
          badgeClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25',
          icon: <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" strokeWidth={2} />,
          largeIcon: <Bot className="w-5 h-5 text-blue-500" strokeWidth={2} />,
        };
    }
  };

  const getAgentIcon = (name: string, category?: string) => {
    return getCategoryMeta(category).largeIcon;
  };

  const categoryCounts: Record<string, number> = {
    all: agents.length,
    design: agents.filter((a) => (a.category || 'general') === 'design').length,
    development: agents.filter((a) => (a.category || 'general') === 'development').length,
    architecture: agents.filter((a) => (a.category || 'general') === 'architecture').length,
    security: agents.filter((a) => (a.category || 'general') === 'security').length,
    data: agents.filter((a) => (a.category || 'general') === 'data').length,
    orchestration: agents.filter((a) => (a.category || 'general') === 'orchestration').length,
    general: agents.filter((a) => (a.category || 'general') === 'general').length,
  };

  const activeCategoriesCount = Object.keys(categoryCounts).filter(
    (k) => k !== 'all' && categoryCounts[k] > 0
  ).length;

  const filteredAgents = agents.filter((agent) => {
    const cat = (agent.category || 'general').toLowerCase();
    const matchesCat = selectedCategory === 'all' || cat === selectedCategory.toLowerCase();
    if (!matchesCat) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.title.toLowerCase().includes(q) ||
      agent.chatCommand.toLowerCase().includes(q) ||
      (agent.whatItDoes && agent.whatItDoes.toLowerCase().includes(q)) ||
      (agent.category && agent.category.toLowerCase().includes(q)) ||
      (agent.tags && agent.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  const hasDbError = Boolean(dbDetails?.configured && !dbConnected);
  const localOnlyCount = agents.filter((a) => a.database !== 'Neon PostgreSQL').length;

  return (
    <div className="min-h-screen antialiased p-4 sm:p-6 lg:p-10 pb-32 transition-colors duration-300">
      {/* TOAST */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 max-w-md bg-slate-900 dark:bg-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl text-xs font-heading font-bold flex items-center gap-2.5 border border-cyan-500/40">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" strokeWidth={2} />
          <span className="leading-snug">{toast}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-10">
        {/* TOP NAVIGATION */}
        <nav className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800/80 gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
              <Layers className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-xl tracking-tight text-slate-900 dark:text-white">
                  Antigravity Hub
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-heading font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  Akiom Architecture
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Maestro de Agentes & Engenharia Visual
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Database Badge Button (3 Real-Time States) */}
            {dbConnected ? (
              <button
                onClick={() => setShowNeonModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                title="Neon PostgreSQL conectado. Clique para inspecionar tabela e registros."
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Database className="w-3.5 h-3.5" strokeWidth={2} />
                Neon: {dbDetails?.databaseName || 'agents_mpg'} (Ativo)
              </button>
            ) : hasDbError ? (
              <button
                onClick={() => setShowNeonModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors cursor-pointer"
                title="Variavel encontrada, mas falha ao conectar no Neon. Clique para diagnosticar."
              >
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                Neon: Erro de Conexao (Diagnosticar)
              </button>
            ) : (
              <button
                onClick={() => setShowNeonModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 transition-colors cursor-pointer"
                title="Clique para conectar sua DATABASE_URL do Neon na Vercel"
              >
                <Database className="w-3.5 h-3.5" strokeWidth={2} />
                Neon: Configurar Conexao
              </button>
            )}

            {/* MCP Server Button */}
            <button
              onClick={() => setShowMcpModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/20 transition-colors cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" strokeWidth={2} />
              Conectar via MCP
            </button>

            {/* License Shield Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
              0% Risco Legal: MIT & Apache-2.0
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-cyan-500 transition-colors cursor-pointer"
              title="Alternar Modo Claro / Escuro"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={2} />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" strokeWidth={2} />
              )}
            </button>

            {/* GitHub Link */}
            <a
              href="https://github.com/Mauthope/antigravity-hub"
              target="_blank"
              rel="noreferrer"
              className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-cyan-500 transition-colors"
              title="Ver repositorio no GitHub"
            >
              <ExternalLink className="w-4 h-4" strokeWidth={2} />
            </a>
          </div>
        </nav>

        {/* LIVE DIAGNOSTIC BANNER WHEN NEON HAS AN ERROR OR UNSYNCED LOCAL AGENTS */}
        {hasDbError && dbDetails?.error && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="space-y-1">
                <span className="font-heading font-bold text-sm block">
                  Falha na Conexao com o Neon ({dbDetails.envVarName || 'DATABASE_URL'})
                </span>
                <p className="font-mono text-[11px] opacity-90 break-all">{dbDetails.error}</p>
              </div>
            </div>
            <button
              onClick={() => setShowNeonModal(true)}
              className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-heading font-bold text-xs shrink-0 transition-colors cursor-pointer"
            >
              Abrir Diagnostico
            </button>
          </div>
        )}

        {dbConnected === false && !hasDbError && localOnlyCount > 0 && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="flex items-start gap-3">
              <HardDrive className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="space-y-1">
                <span className="font-heading font-bold text-sm block">
                  {localOnlyCount} agente(s) estao apenas em Cache Local neste navegador
                </span>
                <p className="opacity-90">
                  A tabela na Neon continua vazia porque nenhuma variavel <code className="font-mono font-bold">DATABASE_URL</code> ativa foi detectada no deploy da Vercel. Assim que conectar e fizer Redeploy, eles serao enviados automaticamente para a tabela <code className="font-mono font-bold">agents</code>.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowNeonModal(true)}
              className="px-4 py-2 rounded-full bg-amber-600 hover:bg-amber-500 text-white font-heading font-bold text-xs shrink-0 transition-colors cursor-pointer"
            >
              Conectar Neon Agora
            </button>
          </div>
        )}

        {/* HERO SECTION */}
        <section className="space-y-3">
          <h1 className="font-heading font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-slate-900 dark:text-white">
            Orquestrador de Agentes Markdown & Servidor MCP
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            Centralize seus agentes em Markdown e acione-os nativamente dentro do Antigravity como ferramentas do protocolo MCP. Seus agentes salvos no Neon PostgreSQL ficam instantaneamente acessiveis na conversa.
          </p>
        </section>

        {/* SQUIRCLE KPI METRICS CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <SquircleKpiCard
            badgeNumber={1}
            title="Agentes Prontos"
            value={agents.length}
            unit="ativos"
            subtitle="Disponiveis no Hub"
            icon={Bot}
            color="blue"
          />
          <SquircleKpiCard
            badgeNumber={2}
            title="Categorias Ativas"
            value={activeCategoriesCount}
            unit="de 7"
            subtitle="Taxonomia Especializada"
            icon={Layers}
            color="cyan"
          />
          <SquircleKpiCard
            badgeNumber={3}
            title="Banco Neon"
            value={dbConnected ? 'Conectado' : hasDbError ? 'Com Erro' : 'Cache Local'}
            unit=""
            subtitle={
              dbConnected
                ? `Database: ${dbDetails?.databaseName || 'neondb'}`
                : hasDbError
                ? 'Clique no topo para corrigir'
                : 'Adicione DATABASE_URL + Redeploy'
            }
            icon={Database}
            color="emerald"
          />
          <SquircleKpiCard
            badgeNumber={4}
            title="Servidor MCP"
            value="Ativo"
            unit="JSON-RPC"
            subtitle="Filtro por Categoria"
            icon={Cpu}
            color="amber"
          />
        </section>

        {/* TACTILE PILL TABS PER DESIGNER AKIOM */}
        <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TactilePillTabs
            tabs={[
              {
                id: 'all',
                label: 'Catálogo Completo',
                badge: agents.length,
                accent: 'cyan',
                icon: <Bot className="w-4 h-4" strokeWidth={2} />,
              },
              {
                id: 'upload',
                label: 'Subir Arquivo .md',
                accent: 'violet',
                icon: <UploadCloud className="w-4 h-4" strokeWidth={2} />,
              },
              {
                id: 'github',
                label: 'Salvar do GitHub (0% Risco)',
                badge: 'MIT / Apache-2.0',
                accent: 'emerald',
                icon: <GitPullRequest className="w-4 h-4" strokeWidth={2} />,
              },
            ]}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as 'all' | 'upload' | 'github')}
          />
        </section>

        {/* PRIMARY INTERACTION SURFACES */}
        <section
          className={
            activeTab === 'all'
              ? 'grid grid-cols-1 lg:grid-cols-2 gap-6'
              : 'max-w-2xl mx-auto w-full'
          }
        >
          {/* ACTION 1: SUBIR ARQUIVO .MD */}
          {(activeTab === 'all' || activeTab === 'upload') && (
            <div className="glow-card p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 text-cyan-600 dark:text-cyan-400">
                <UploadCloud className="w-5 h-5" strokeWidth={2.2} />
                <h2 className="font-heading font-bold text-lg sm:text-xl text-slate-900 dark:text-white">
                  Subir Agente (.md)
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Carregue um arquivo <code className="font-mono text-cyan-600 dark:text-cyan-300 font-bold">.md</code> do seu computador ou escreva a instrucao abaixo:
              </p>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px]">
                  Arquivo Markdown:
                </label>
                <input
                  type="file"
                  accept=".md,.markdown"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-heading file:font-bold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px]">
                  Identificador do Agente (sem espacos):
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="ex: validador-arquitetural"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px] flex items-center justify-between">
                  <span>Categoria de Atuacao:</span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono font-bold">
                    {getCategoryMeta(uploadCategory).label}
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {AGENT_CATEGORIES.map((cat) => {
                    const isSel = uploadCategory === cat.id;
                    const meta = getCategoryMeta(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setUploadCategory(cat.id)}
                        className={`px-2.5 py-2 rounded-xl text-[11px] font-heading font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                          isSel
                            ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500 shadow-sm'
                            : 'bg-slate-100/70 dark:bg-slate-900/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        {meta.icon}
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px]">
                  Conteudo Markdown do Agente:
                </label>
                <textarea
                  value={uploadContent}
                  onChange={(e) => {
                    setUploadContent(e.target.value);
                    if (e.target.value.length > 30 && uploadCategory === 'general') {
                      const detected = detectAgentCategory(uploadName, e.target.value);
                      if (detected !== 'general') setUploadCategory(detected);
                    }
                  }}
                  rows={4}
                  placeholder="# Titulo do Agente&#10;&#10;## O Que Este Agente Faz&#10;Explique de forma simples o objetivo...&#10;&#10;## Quando Usar&#10;Indique o momento de chamar no chat..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                />
              </div>

              {uploadStatus && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                    uploadStatus.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : uploadStatus.type === 'warning'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                      : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                  }`}
                >
                  {uploadStatus.message}
                </div>
              )}

              <div className="pt-2">
                <GlassCapsuleButton
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isSavingManual}
                  icon={<FileText className="w-4 h-4" strokeWidth={2} />}
                  className="w-full justify-center"
                >
                  {isSavingManual ? 'Gravando Agente...' : 'Salvar Agente (.md)'}
                </GlassCapsuleButton>
              </div>
            </form>
          </div>
          )}

          {/* ACTION 2: SALVAR DE REPOSITÓRIO GITHUB */}
          {(activeTab === 'all' || activeTab === 'github') && (
            <div className="glow-card p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
                  <GitPullRequest className="w-5 h-5" strokeWidth={2.2} />
                  <h2 className="font-heading font-bold text-lg sm:text-xl text-slate-900 dark:text-white">
                    Salvar de Repositorio GitHub
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Cole a URL de qualquer repositorio ou arquivo <code className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">.md</code> no GitHub para auditar a licenca e gravar no Neon:
                </p>
              </div>

              <form onSubmit={handleImportGithub} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px]">
                    URL do Repositorio GitHub:
                  </label>
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/usuario/meu-agente"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px] flex items-center justify-between">
                    <span>Categoria:</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                      {githubCategory === 'auto' ? 'Detecção Automática' : getCategoryMeta(githubCategory).label}
                    </span>
                  </label>
                  <select
                    value={githubCategory}
                    onChange={(e) => setGithubCategory(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs font-heading font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="auto">Auto-detectar por palavras-chave e tópicos</option>
                    {AGENT_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label} — {cat.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-2xl holographic-surface text-xs text-slate-800 dark:text-slate-200 space-y-2">
                  <span className="font-heading font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px] block">
                    Regras de Auditoria Automatizada:
                  </span>
                  <p className="leading-relaxed">
                    • <strong>0% Risco Juridico:</strong> Apenas licencas permissivas <strong>MIT</strong> e <strong>Apache-2.0</strong> sao autorizadas.
                  </p>
                  <p className="leading-relaxed">
                    • <strong>Gravacao Atomica:</strong> Valida a licenca e insere diretamente na tabela <code className="font-mono text-cyan-600 dark:text-cyan-300">agents</code> do Neon PostgreSQL.
                  </p>
                </div>

                {githubStatus && (
                  <div
                    className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                      githubStatus.type === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : githubStatus.type === 'warning'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                        : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {githubStatus.message}
                  </div>
                )}

                <div className="pt-2">
                  <GlassCapsuleButton
                    type="submit"
                    variant="emerald"
                    size="md"
                    isLoading={isImporting}
                    icon={<GitPullRequest className="w-4 h-4" strokeWidth={2} />}
                    className="w-full justify-center"
                  >
                    {isImporting ? 'Auditando e Salvando...' : 'Baixar e Salvar como Agente'}
                  </GlassCapsuleButton>
                </div>
              </form>
            </div>
          )}
        </section>

        {/* SECTION: AGENT CARDS WITH CATEGORIES AND SIMPLIFIED DESCRIPTIONS */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-heading font-black text-2xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Agentes Disponiveis</span>
                <span className="text-sm font-heading font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  {filteredAgents.length}{filteredAgents.length !== agents.length ? ` de ${agents.length}` : ''}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Organizados por especialidades taticas, prontos para invocacao direta no Antigravity via MCP.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {agents.length > 0 && (
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        'Deseja excluir todos os agentes cadastrados e deixar o catalogo limpo?'
                      )
                    ) {
                      setAgents([]);
                      saveToStorage([]);
                      showToast('Todos os agentes foram removidos.');
                      try {
                        await fetch('/api/agents?all=true', { method: 'DELETE' });
                        if (dbConnected) checkNeonStatus(false);
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  className="text-xs font-heading font-bold text-red-500 hover:text-red-600 flex items-center gap-1 p-1 cursor-pointer transition-colors"
                  title="Excluir todos os agentes"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                  Limpar Catalogo
                </button>
              )}
              <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                Invocacao: digite <span className="text-cyan-600 dark:text-cyan-400 font-bold">/nome</span> no chat
              </span>
            </div>
          </div>

          {/* TACTILE CATEGORY FILTER TABS & SEARCH BAR */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="overflow-x-auto pb-1 max-w-full">
              <TactilePillTabs
                tabs={[
                  {
                    id: 'all',
                    label: 'Todas',
                    badge: categoryCounts.all,
                    accent: 'cyan',
                    icon: <Layers className="w-4 h-4" strokeWidth={2} />,
                  },
                  {
                    id: 'design',
                    label: 'Design & UI/UX',
                    badge: categoryCounts.design,
                    accent: 'cyan',
                    icon: <Palette className="w-4 h-4" strokeWidth={2} />,
                  },
                  {
                    id: 'development',
                    label: 'Desenvolvimento',
                    badge: categoryCounts.development,
                    accent: 'emerald',
                    icon: <Code2 className="w-4 h-4" strokeWidth={2} />,
                  },
                  {
                    id: 'architecture',
                    label: 'Arquitetura & Cloud',
                    badge: categoryCounts.architecture,
                    accent: 'violet',
                    icon: <Cloud className="w-4 h-4" strokeWidth={2} />,
                  },
                  {
                    id: 'security',
                    label: 'Segurança & Review',
                    badge: categoryCounts.security,
                    accent: 'rose',
                    icon: <ShieldCheck className="w-4 h-4" strokeWidth={2} />,
                  },
                  {
                    id: 'data',
                    label: 'Dados & IA',
                    badge: categoryCounts.data,
                    accent: 'amber',
                    icon: <Sparkles className="w-4 h-4" strokeWidth={2} />,
                  },
                  {
                    id: 'orchestration',
                    label: 'Orquestração',
                    badge: categoryCounts.orchestration,
                    accent: 'cyan',
                    icon: <Cpu className="w-4 h-4" strokeWidth={2} />,
                  },
                  {
                    id: 'general',
                    label: 'Geral',
                    badge: categoryCounts.general,
                    accent: 'slate',
                    icon: <Bot className="w-4 h-4" strokeWidth={2} />,
                  },
                ]}
                activeId={selectedCategory}
                onChange={(id) => setSelectedCategory(id)}
              />
            </div>

            <div className="relative min-w-[240px] sm:min-w-[280px]">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={2}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por nome, comando, tag..."
                className="w-full pl-9 pr-8 py-2.5 rounded-full bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-heading text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 backdrop-blur-xl transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs font-heading font-bold text-slate-400">
              Carregando catalogo de agentes...
            </div>
          ) : agents.length === 0 ? (
            <div className="glow-card p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mx-auto">
                <Bot className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
                  Catalogo Limpo e Pronto
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  Nenhum agente cadastrado. Suba seus proprios arquivos{' '}
                  <code className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">.md</code>{' '}
                  ou informe URLs do GitHub acima para adicionar seus agentes personalizados.
                </p>
              </div>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="glow-card p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <Search className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
                  Nenhum Agente Encontrado Nesta Categoria
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  Nao ha agentes cadastrados para os filtros aplicados (Categoria: &ldquo;{selectedCategory !== 'all' ? getCategoryMeta(selectedCategory).label : 'Todas'}&rdquo;{searchQuery ? `, Busca: "${searchQuery}"` : ''}).
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-heading font-bold text-xs transition-colors cursor-pointer"
              >
                Ver Todos os Agentes ({agents.length})
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAgents.map((agent) => {
                const isNeonSaved = agent.database === 'Neon PostgreSQL';
                const catMeta = getCategoryMeta(agent.category);
                return (
                  <div
                    key={agent.name}
                    className="glow-card p-6 flex flex-col justify-between space-y-5 group relative"
                  >
                    <div className="space-y-4">
                      {/* Header with Icon, Slash Command, Category Badge & Storage Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
                            {catMeta.largeIcon}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25">
                                {agent.chatCommand}
                              </span>
                              <button
                                onClick={() => setSelectedCategory(agent.category || 'general')}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-heading font-bold border transition-all cursor-pointer hover:scale-105 ${catMeta.badgeClass}`}
                                title={`Filtrar apenas pela categoria ${catMeta.label}`}
                              >
                                {catMeta.icon}
                                <span>{catMeta.label}</span>
                              </button>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-heading font-bold border ${
                                  isNeonSaved
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                                }`}
                              >
                                {isNeonSaved ? (
                                  <Database className="w-2.5 h-2.5" strokeWidth={2.2} />
                                ) : (
                                  <HardDrive className="w-2.5 h-2.5" strokeWidth={2.2} />
                                )}
                                {isNeonSaved ? 'Neon PostgreSQL' : 'Cache Local'}
                              </span>
                            </div>
                            <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white mt-1 leading-snug">
                              {agent.title}
                            </h3>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDelete(agent.name)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                          title="Remover agente"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </div>

                      {/* Simplified Description: O Que Faz */}
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 space-y-1">
                        <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-cyan-700 dark:text-cyan-400 block">
                          O Que Este Agente Faz:
                        </span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {agent.whatItDoes || agent.content.slice(0, 160)}
                        </p>
                      </div>

                      {/* When to Use: Quando Chamar */}
                      <div className="p-3.5 rounded-2xl bg-slate-50/60 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 space-y-1">
                        <span className="font-heading font-bold text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                          Quando Chamar no Chat:
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {agent.whenToUse ||
                            'Invoque no chat quando precisar de auxilio especializado.'}
                        </p>
                      </div>

                      {/* Tags */}
                      {agent.tags && agent.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {agent.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md text-[10px] font-heading font-semibold bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions Footer */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setPreviewAgent(agent)}
                        className="text-xs font-heading font-bold text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" strokeWidth={2} />
                        Ver Markdown
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => downloadMd(agent)}
                          className="p-2 rounded-full bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          title="Baixar arquivo .md"
                        >
                          <Download className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>

                        <GlassCapsuleButton
                          variant="cyan"
                          size="sm"
                          onClick={() => copyToClipboard(agent.chatCommand, agent.name)}
                          icon={
                            copiedId === agent.name ? (
                              <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
                            ) : (
                              <Copy className="w-3.5 h-3.5" strokeWidth={2} />
                            )
                          }
                        >
                          {copiedId === agent.name ? 'Copiado' : agent.chatCommand}
                        </GlassCapsuleButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* FLOATING AKIOM WALL DOCK PER DESIGNER AKIOM */}
      <AkiomWallDock
        activeSection={activeTab === 'all' ? 'catalog' : activeTab}
        onSelectSection={(sec) => {
          if (sec === 'catalog') setActiveTab('all');
          if (sec === 'upload') setActiveTab('upload');
          if (sec === 'github') setActiveTab('github');
          window.scrollTo({ top: sec === 'catalog' ? 450 : 250, behavior: 'smooth' });
        }}
        onOpenNeon={() => setShowNeonModal(true)}
        onOpenMcp={() => setShowMcpModal(true)}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        dbConnected={dbConnected}
        agentCount={agents.length}
      />

      {/* MARKDOWN PREVIEW MODAL */}
      {previewAgent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glow-card max-w-3xl w-full p-6 sm:p-8 space-y-5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                    {previewAgent.fileName}
                  </h3>
                  {(() => {
                    const meta = getCategoryMeta(previewAgent.category);
                    return (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-heading font-bold border ${meta.badgeClass}`}>
                        {meta.icon}
                        <span>{meta.label}</span>
                      </span>
                    );
                  })()}
                </div>
                <span className="text-xs text-slate-500 font-mono block">{previewAgent.title}</span>
              </div>
              <button
                onClick={() => setPreviewAgent(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-300 whitespace-pre-wrap leading-relaxed custom-scrollbar">
              {previewAgent.content}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => downloadMd(previewAgent)}
                className="px-5 py-2.5 rounded-full bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-heading font-bold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Baixar `.md`
              </button>
              <GlassCapsuleButton
                variant="cyan"
                size="md"
                onClick={() => {
                  copyToClipboard(previewAgent.content, 'modal');
                  setPreviewAgent(null);
                }}
                icon={<Copy className="w-4 h-4" strokeWidth={2} />}
              >
                Copiar Markdown Completo
              </GlassCapsuleButton>
            </div>
          </div>
        </div>
      )}

      {/* NEON DATABASE DIAGNOSTIC & SYNC MODAL */}
      {showNeonModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glow-card max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <Database className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
                    Diagnostico Neon PostgreSQL (agents_mpg)
                  </h3>
                  <span className="text-xs text-slate-500">
                    Inspecao em tempo real da conexao, tabela e registros
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowNeonModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            {/* Live Status Card */}
            <div
              className={`p-4 rounded-2xl border text-xs space-y-3 ${
                dbConnected
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200'
                  : hasDbError
                  ? 'bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-200'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-heading font-bold text-sm">
                  {dbConnected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={2} />
                      Conectado ao Neon PostgreSQL
                    </>
                  ) : hasDbError ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-500" strokeWidth={2} />
                      Variavel Detectada, porem Falha na Conexao SQL
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 text-amber-500" strokeWidth={2} />
                      Variavel DATABASE_URL Nao Encontrada neste Deploy
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => checkNeonStatus(false)}
                    disabled={isCheckingDb || isSyncingDb}
                    className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-[11px] font-heading font-bold flex items-center gap-1.5 hover:border-cyan-500 transition-colors cursor-pointer text-slate-800 dark:text-slate-200"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isCheckingDb ? 'animate-spin' : ''}`}
                      strokeWidth={2}
                    />
                    {isCheckingDb ? 'Testando...' : 'Testar Conexao'}
                  </button>

                  <button
                    onClick={handleForceInitAndSync}
                    disabled={isSyncingDb || isCheckingDb}
                    className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-heading font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Database
                      className={`w-3 h-3 ${isSyncingDb ? 'animate-pulse' : ''}`}
                      strokeWidth={2}
                    />
                    {isSyncingDb ? 'Sincronizando...' : 'Criar Tabela & Sincronizar'}
                  </button>
                </div>
              </div>

              {dbDetails?.message && <p className="text-xs opacity-90">{dbDetails.message}</p>}

              {dbDetails?.error && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 font-mono text-[11px] text-red-200 break-all">
                  <strong>Detalhe Tecnico do Erro:</strong> {dbDetails.error}
                </div>
              )}

              {/* Live Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80">
                  <span className="block text-[10px] uppercase font-sans font-bold opacity-70">
                    Variavel Lida
                  </span>
                  <span className="font-bold">{dbDetails?.envVarName || 'Nenhuma'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80">
                  <span className="block text-[10px] uppercase font-sans font-bold opacity-70">
                    Database Alvo
                  </span>
                  <span className="font-bold">{dbDetails?.databaseName || '—'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80">
                  <span className="block text-[10px] uppercase font-sans font-bold opacity-70">
                    Tabela agents
                  </span>
                  <span className="font-bold">
                    {dbDetails?.tableExists ? 'Criada (OK)' : 'Nao verificada'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80">
                  <span className="block text-[10px] uppercase font-sans font-bold opacity-70">
                    Linhas no Neon
                  </span>
                  <span className="font-bold">{dbDetails?.agentCount ?? 0}</span>
                </div>
              </div>
              {dbDetails?.host && (
                <p className="text-[11px] font-mono opacity-80">Host conectado: {dbDetails.host}</p>
              )}
            </div>

            {/* Important Note about Neon Database Dropdown vs Project Name */}
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <span className="font-heading font-bold text-cyan-700 dark:text-cyan-400 block">
                Dica Importante ao Conferir a Tabela no Painel da Neon:
              </span>
              <p className="leading-relaxed">
                No Neon, o <strong>Projeto</strong> chama-se <code className="font-mono font-bold">agents_mpg</code>, mas o nome padrao do <strong>Database</strong> dentro dele geralmente e <code className="font-mono font-bold">neondb</code> (veja o campo <strong>Database Alvo</strong> acima). Na aba <strong>Tables</strong> da Neon, selecione exatamente esse Database e a branch <code className="font-mono">main</code> para visualizar a tabela <code className="font-mono font-bold">agents</code>.
              </p>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
              <h4 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                Como Ativar ou Corrigir na Vercel em 3 Passos:
              </h4>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="font-heading font-bold text-cyan-600 dark:text-cyan-400 block">
                    1. Copie a Connection String no Neon
                  </span>
                  <p className="text-slate-600 dark:text-slate-400">
                    Abra o projeto <strong className="text-slate-800 dark:text-white">agents_mpg</strong> no Neon, clique em <strong>Connect</strong> e copie a URL <code className="font-mono text-cyan-600 dark:text-cyan-300">postgresql://...</code> (mesmo que venha com <code className="font-mono">psql &apos;...&apos;</code>, o Hub limpa automaticamente).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="font-heading font-bold text-cyan-600 dark:text-cyan-400 block">
                    2. Salve em Environment Variables na Vercel
                  </span>
                  <p className="text-slate-600 dark:text-slate-400">
                    Acesse <strong className="text-slate-800 dark:text-white">Seu Projeto na Vercel &gt; Settings &gt; Environment Variables</strong> e adicione <code className="font-mono font-bold text-emerald-600 dark:text-emerald-400">DATABASE_URL</code> (ou conecte via aba <strong>Storage</strong> — variaveis como <code className="font-mono">AGENTS_MPG_DATABASE_URL</code> tambem sao reconhecidas automaticamente).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="font-heading font-bold text-cyan-600 dark:text-cyan-400 block">
                    3. Faca Redeploy e Clique em &quot;Criar Tabela &amp; Sincronizar&quot;
                  </span>
                  <p className="text-slate-600 dark:text-slate-400">
                    Variaveis adicionadas na Vercel so entram em vigor apos um <strong className="text-slate-800 dark:text-white">Redeploy</strong> (aba Deployments &gt; Redeploy). Assim que o deploy concluir, abra esta janela e clique em <strong>Criar Tabela &amp; Sincronizar</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <GlassCapsuleButton
                variant="cyan"
                size="md"
                onClick={() => setShowNeonModal(false)}
              >
                Fechar Diagnostico
              </GlassCapsuleButton>
            </div>
          </div>
        </div>
      )}

      {/* ANTIGRAVITY CHAT GUIDE MODAL */}
      {showAntigravityGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glow-card max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                  <Terminal className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
                    Como Usar no Chat do Antigravity
                  </h3>
                  <span className="text-xs text-slate-500">Invocacao nativa em qualquer projeto</span>
                </div>
              </div>
              <button
                onClick={() => setShowAntigravityGuide(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <h4 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                  Conexao Oficial via Servidor MCP
                </h4>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Conecte o Antigravity Hub como servidor MCP para listar, ler e salvar agentes diretamente da conversa.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <GlassCapsuleButton
                variant="cyan"
                size="md"
                onClick={() => setShowAntigravityGuide(false)}
              >
                Pronto para Usar
              </GlassCapsuleButton>
            </div>
          </div>
        </div>
      )}

      {/* MCP SERVER CONNECTION MODAL */}
      {showMcpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glow-card max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                  <Cpu className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
                    Conectar ao Antigravity via MCP
                  </h3>
                  <span className="text-xs text-slate-500">Padrao Model Context Protocol oficial</span>
                </div>
              </div>
              <button
                onClick={() => setShowMcpModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
              <p className="leading-relaxed">
                Ao instalar o Hub como servidor MCP, a IA do Antigravity ganha <strong>ferramentas nativas</strong> no chat para listar seus agentes, puxar instrucoes <code className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">.md</code>, salvar agentes no Neon e importar do GitHub com auditoria de licenca.
              </p>

              {/* SECTION: CONFIG SNIPPET */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-cyan-500" strokeWidth={2} />
                    Configuracao em mcp_config.json (Manage MCP Servers &gt; View raw config):
                  </span>
                  <button
                    onClick={() => {
                      const snippet = JSON.stringify(
                        {
                          mcpServers: {
                            'antigravity-hub': {
                              command: 'node',
                              args: ['/caminho/para/antigravity-hub/dist/mcp-server/index.js'],
                              env: {
                                DATABASE_URL: 'sua-connection-string-do-neon',
                              },
                            },
                          },
                        },
                        null,
                        2
                      );
                      copyToClipboard(snippet, 'mcp-json');
                    }}
                    className="text-[11px] font-heading font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" strokeWidth={2} />
                    {copiedId === 'mcp-json' ? 'Copiado!' : 'Copiar JSON'}
                  </button>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800">
                  <pre>{`{
  "mcpServers": {
    "antigravity-hub": {
      "command": "node",
      "args": ["/caminho/para/antigravity-hub/dist/mcp-server/index.js"],
      "env": {
        "DATABASE_URL": "sua-connection-string-do-neon"
      }
    }
  }
}`}</pre>
                </div>
              </div>

              {/* SECTION: 1-COMMAND INSTALL */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-slate-900 dark:text-white">
                    Instalacao em 1 Comando no Terminal:
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard('node dist/cli/index.js mcp install --global', 'cli-cmd')
                    }
                    className="text-[11px] font-heading font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" strokeWidth={2} />
                    {copiedId === 'cli-cmd' ? 'Copiado!' : 'Copiar Comando'}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 text-cyan-300 font-mono text-[11px]">
                  node dist/cli/index.js mcp install --global
                </div>
                <p className="text-[11px] text-slate-500">
                  Grava automaticamente em <code className="font-mono">.agents/mcp.json</code> e em{' '}
                  <code className="font-mono">~/.gemini/config/mcp.json</code>.
                </p>
              </div>

              {/* SECTION: AVAILABLE MCP TOOLS */}
              <div className="space-y-2">
                <span className="font-heading font-bold text-slate-900 dark:text-white block">
                  Ferramentas que o Antigravity passa a executar:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 block">
                      list_agents
                    </span>
                    <span className="text-slate-500">
                      Lista todos os agentes salvos no Hub com resumo.
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 block">
                      get_agent
                    </span>
                    <span className="text-slate-500">
                      Obtem as instrucoes .md completas do agente.
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 block">
                      save_agent
                    </span>
                    <span className="text-slate-500">
                      Salva novos agentes no Neon DB direto pelo chat.
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 block">
                      import_agent_github
                    </span>
                    <span className="text-slate-500">
                      Audita (so MIT/Apache-2.0) e importa do GitHub.
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION: HTTP ENDPOINT */}
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-900 dark:text-indigo-200 space-y-1">
                <span className="font-heading font-bold block">
                  Conexao Remota na Nuvem (Vercel):
                </span>
                <p className="text-[11px] opacity-90">
                  Voce tambem pode apontar qualquer cliente MCP para o endpoint HTTP da Vercel:
                </p>
                <code className="block p-2 rounded-lg bg-slate-900 text-indigo-300 font-mono text-[11px] break-all">
                  https://[seu-projeto].vercel.app/api/mcp
                </code>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <GlassCapsuleButton
                variant="cyan"
                size="md"
                onClick={() => setShowMcpModal(false)}
              >
                Concluir
              </GlassCapsuleButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

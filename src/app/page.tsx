'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { GlassCapsuleButton } from '@/components/ui/glass-capsule-button';
import { SquircleKpiCard } from '@/components/ui/squircle-kpi-card';

interface AgentMd {
  name: string;
  fileName: string;
  title: string;
  whatItDoes: string;
  whenToUse: string;
  tags?: string[];
  content: string;
  chatCommand: string;
  database?: string;
}

const STORAGE_KEY = 'antigravity_hub_agents_v3';

export default function HomePage() {
  const [agents, setAgents] = useState<AgentMd[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);

  // Upload/Manual State
  const [uploadName, setUploadName] = useState('');
  const [uploadContent, setUploadContent] = useState('');

  // GitHub Import State
  const [githubUrl, setGithubUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [githubStatus, setGithubStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Active Preview Modal
  const [previewAgent, setPreviewAgent] = useState<AgentMd | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
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

  const saveToStorage = (list: AgentMd[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  };

  const fetchAgents = async () => {
    let localAgents: AgentMd[] = [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        localAgents = JSON.parse(saved);
        if (Array.isArray(localAgents) && localAgents.length > 0) {
          setAgents(localAgents);
        }
      }
    } catch {
      // ignore
    }

    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        setDbConnected(!!data.databaseConnected);
        if (Array.isArray(data.agents) && data.agents.length > 0) {
          const merged = [...data.agents];
          localAgents.forEach((la) => {
            if (!merged.some((m) => m.name === la.name)) {
              merged.push(la);
            }
          });
          setAgents(merged);
          saveToStorage(merged);
        }
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const baseName = file.name.replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    setUploadName(baseName);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadContent(text);
      showToast(`Arquivo '${file.name}' carregado no formulário.`);
    };
    reader.readAsText(file);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadName.trim() || !uploadContent.trim()) {
      showToast('Preencha o identificador e o conteúdo markdown do agente.');
      return;
    }

    const cleanName = uploadName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-|-$/g, '') || 'custom-agent';

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          content: uploadContent,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updated = [data.agent, ...agents.filter((a) => a.name !== cleanName)];
        setAgents(updated);
        saveToStorage(updated);
        showToast(`Agente ${cleanName}.md registrado com sucesso.`);
        setUploadName('');
        setUploadContent('');
      } else {
        showToast('Falha ao registrar agente.');
      }
    } catch {
      showToast('Erro de conexão ao salvar.');
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
        body: JSON.stringify({ url: githubUrl }),
      });

      const data = await res.json();

      if (res.ok && data.valid) {
        // Save to agents API
        const saveRes = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.name,
            content: data.content,
            sourceUrl: githubUrl,
            license: data.license,
          }),
        });

        const savedData = await saveRes.json();
        const agentToAdd = savedData.agent || {
          name: data.name,
          fileName: `${data.name}.md`,
          title: data.title,
          whatItDoes: 'Agente importado do GitHub com licença auditada.',
          whenToUse: 'Invoque no chat para executar tarefas desta especialidade.',
          tags: ['GitHub', data.license],
          content: data.content,
          chatCommand: `/${data.name}`,
        };

        const updated = [agentToAdd, ...agents.filter((a) => a.name !== data.name)];
        setAgents(updated);
        saveToStorage(updated);

        setGithubStatus({
          type: 'success',
          message: `Agente '${data.name}.md' auditado e salvo. Licença: ${data.license} (0% risco legal).`,
        });
        setGithubUrl('');
        showToast(`Agente '${data.name}.md' adicionado com sucesso.`);
      } else {
        setGithubStatus({
          type: 'error',
          message: data.error || 'Falha ao auditar e importar repositório.',
        });
      }
    } catch {
      setGithubStatus({
        type: 'error',
        message: 'Falha na conexão com o serviço de importação.',
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
      await fetch(`/api/agents?name=${name}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast(`Comando copiado: ${text}`);
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

  const getAgentIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('designer') || lower.includes('akiom')) {
      return <Palette className="w-5 h-5 text-cyan-500" strokeWidth={2} />;
    }
    if (lower.includes('reviewer') || lower.includes('code')) {
      return <Code2 className="w-5 h-5 text-indigo-500" strokeWidth={2} />;
    }
    if (lower.includes('architect') || lower.includes('cloud')) {
      return <Cloud className="w-5 h-5 text-emerald-500" strokeWidth={2} />;
    }
    return <Bot className="w-5 h-5 text-blue-500" strokeWidth={2} />;
  };

  return (
    <div className="min-h-screen antialiased p-4 sm:p-6 lg:p-10 transition-colors duration-300">
      {/* TOAST */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 dark:bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-heading font-bold flex items-center gap-2.5 border border-cyan-500/40">
          <Sparkles className="w-4 h-4 text-cyan-400" strokeWidth={2} />
          {toast}
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
            {/* Database Badge */}
            {dbConnected ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Database className="w-3.5 h-3.5" strokeWidth={2} />
                Neon DB: agents_mpg
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 cursor-help"
                title="Adicione DATABASE_URL na Vercel para sincronizar com seu projeto Neon"
              >
                <Database className="w-3.5 h-3.5" strokeWidth={2} />
                Neon: Configure DATABASE_URL
              </div>
            )}

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
              {isDark ? <Sun className="w-4 h-4 text-amber-400" strokeWidth={2} /> : <Moon className="w-4 h-4 text-indigo-600" strokeWidth={2} />}
            </button>

            {/* GitHub Link */}
            <a
              href="https://github.com/Mauthope/antigravity-hub/tree/main/agents"
              target="_blank"
              rel="noreferrer"
              className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-cyan-500 transition-colors"
              title="Ver repositório no GitHub"
            >
              <ExternalLink className="w-4 h-4" strokeWidth={2} />
            </a>
          </div>
        </nav>

        {/* HERO SECTION */}
        <section className="space-y-3">
          <h1 className="font-heading font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight text-slate-900 dark:text-white">
            Orquestrador de Agentes Markdown
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            Centralize e acione seus agentes em qualquer conversa do Antigravity. Cada agente possui uma especialidade clara, comandos de chat imediatos e armazenamento persistente na nuvem.
          </p>
        </section>

        {/* SQUIRCLE KPI METRICS CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <SquircleKpiCard
            badgeNumber={1}
            title="Agentes Prontos"
            value={agents.length}
            unit="ativos"
            subtitle="Prontos para uso no chat"
            icon={Bot}
            color="blue"
          />
          <SquircleKpiCard
            badgeNumber={2}
            title="Banco Neon"
            value={dbConnected ? "Conectado" : "Local / Cache"}
            unit=""
            subtitle={dbConnected ? "Projeto agents_mpg" : "Adicione DATABASE_URL"}
            icon={Database}
            color="emerald"
          />
          <SquircleKpiCard
            badgeNumber={3}
            title="Conformidade"
            value="100%"
            unit="seguro"
            subtitle="Apenas MIT & Apache-2.0"
            icon={ShieldCheck}
            color="violet"
          />
          <SquircleKpiCard
            badgeNumber={4}
            title="Invocação Chat"
            value="Imediata"
            unit=""
            subtitle="Via /nome-do-agente"
            icon={Terminal}
            color="amber"
          />
        </section>

        {/* TWO PRIMARY INTERACTION SURFACES */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ACTION 1: SUBIR ARQUIVO .MD */}
          <div className="glow-card p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 text-cyan-600 dark:text-cyan-400">
                <UploadCloud className="w-5 h-5" strokeWidth={2.2} />
                <h2 className="font-heading font-bold text-lg sm:text-xl text-slate-900 dark:text-white">
                  Subir Agente (.md)
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Carregue um arquivo <code className="font-mono text-cyan-600 dark:text-cyan-300 font-bold">.md</code> do seu computador ou escreva a instrução abaixo:
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
                  Identificador do Agente (sem espaços):
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
                <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px]">
                  Conteúdo Markdown do Agente:
                </label>
                <textarea
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  rows={4}
                  placeholder="# Título do Agente&#10;&#10;## O Que Este Agente Faz&#10;Explique de forma simples o objetivo...&#10;&#10;## Quando Usar&#10;Indique o momento de chamar no chat..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                />
              </div>

              <div className="pt-2">
                <GlassCapsuleButton
                  type="submit"
                  variant="primary"
                  size="md"
                  icon={<FileText className="w-4 h-4" strokeWidth={2} />}
                  className="w-full justify-center"
                >
                  Salvar Agente (.md)
                </GlassCapsuleButton>
              </div>
            </form>
          </div>

          {/* ACTION 2: SALVAR DE REPOSITÓRIO GITHUB */}
          <div className="glow-card p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
                <GitPullRequest className="w-5 h-5" strokeWidth={2.2} />
                <h2 className="font-heading font-bold text-lg sm:text-xl text-slate-900 dark:text-white">
                  Salvar de Repositório GitHub
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Cole a URL de qualquer repositório no GitHub para auditar a licença e salvar o agente:
              </p>
            </div>

            <form onSubmit={handleImportGithub} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1.5 font-heading font-bold uppercase tracking-wider text-[11px]">
                  URL do Repositório GitHub:
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

              <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <span className="font-heading font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px] block">
                  Regras de Auditoria Automatizada:
                </span>
                <p className="leading-relaxed">
                  • <strong>0% Risco Jurídico:</strong> Apenas licenças permissivas <strong>MIT</strong> e <strong>Apache-2.0</strong> são autorizadas.
                </p>
                <p className="leading-relaxed">
                  • <strong>Extração Inteligente:</strong> Detecta arquivos <code className="font-mono text-cyan-600 dark:text-cyan-300">SKILL.md</code>, <code className="font-mono text-cyan-600 dark:text-cyan-300">agent.md</code> ou <code className="font-mono text-cyan-600 dark:text-cyan-300">README.md</code>.
                </p>
              </div>

              {githubStatus && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                    githubStatus.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
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
                  {isImporting ? 'Auditando Licença...' : 'Baixar e Salvar como Agente'}
                </GlassCapsuleButton>
              </div>
            </form>
          </div>
        </section>

        {/* SECTION: AGENT CARDS WITH SIMPLIFIED DESCRIPTIONS */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-heading font-black text-2xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Agentes Disponíveis</span>
                <span className="text-sm font-heading font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  {agents.length}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cada agente possui descrição simplificada de atuação e orientação de quando acioná-lo.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Invocação: digite <span className="text-cyan-600 dark:text-cyan-400 font-bold">/nome</span> no chat
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs font-heading font-bold text-slate-400">
              Carregando catálogo de agentes...
            </div>
          ) : agents.length === 0 ? (
            <div className="glow-card p-12 text-center space-y-3">
              <Bot className="w-10 h-10 text-slate-400 mx-auto opacity-50" strokeWidth={1.5} />
              <h3 className="font-heading font-bold text-base text-slate-800 dark:text-slate-200">
                Nenhum agente catalogado no momento
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Suba seu primeiro arquivo <code className="font-mono text-cyan-600 dark:text-cyan-400">.md</code> ou informe uma URL do GitHub acima para registrar seu primeiro especialista.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="glow-card p-6 flex flex-col justify-between space-y-5 group relative"
                >
                  <div className="space-y-4">
                    {/* Header with Icon and Slash Command */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
                          {getAgentIcon(agent.name)}
                        </div>
                        <div>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25">
                            {agent.chatCommand}
                          </span>
                          <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white mt-1 leading-snug">
                            {agent.title}
                          </h3>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(agent.name)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
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
                        {agent.whenToUse || 'Invoque no chat quando precisar de auxílio especializado.'}
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
              ))}
            </div>
          )}
        </section>
      </div>

      {/* MARKDOWN PREVIEW MODAL */}
      {previewAgent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glow-card max-w-3xl w-full p-6 sm:p-8 space-y-5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                  {previewAgent.fileName}
                </h3>
                <span className="text-xs text-slate-500 font-mono">{previewAgent.title}</span>
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
    </div>
  );
}

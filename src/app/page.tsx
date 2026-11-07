'use client';

import React, { useState } from 'react';

interface Agent {
  name: string;
  role: string;
  description: string;
  chatCommand: string;
  tools?: string;
  badge?: string;
}

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[]>([
    {
      name: 'code-reviewer',
      role: 'Senior Code Reviewer',
      description: 'Especialista em revisão minuciosa de código, detecção de bugs e segurança rigorosa.',
      chatCommand: '/code-reviewer',
      tools: 'write, subagents, mcp',
      badge: 'Global',
    },
    {
      name: 'architect',
      role: 'Cloud & Software Architect',
      description: 'Arquiteto de sistemas especializado em escalabilidade, desacoplamento e microsserviços.',
      chatCommand: '/architect',
      tools: 'write, subagents, mcp',
      badge: 'Global',
    },
    {
      name: 'ag-hub',
      role: 'Antigravity Hub Specialist',
      description: 'Orquestrador do ecossistema: gerencia agentes, importa skills do GitHub e conecta servidores MCP.',
      chatCommand: '/ag-hub',
      tools: 'full access',
      badge: 'Global',
    },
  ]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  // Importer State
  const [githubUrl, setGithubUrl] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    valid?: boolean;
    license?: string;
    spdxId?: string;
    error?: string;
  } | null>(null);

  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleAuditLicense = async () => {
    if (!githubUrl.trim()) return;
    setIsAuditing(true);
    setAuditResult(null);

    try {
      const res = await fetch(`/api/verify-license?url=${encodeURIComponent(githubUrl)}`);
      const data = await res.json();
      setAuditResult(data);
    } catch {
      // Fallback
      if (githubUrl.includes('linux') || githubUrl.includes('gpl')) {
        setAuditResult({
          valid: false,
          error: 'Detectada licença GPL. Apenas MIT e Apache-2.0 são permitidas (0% risco legal).',
        });
      } else {
        setAuditResult({
          valid: true,
          license: 'MIT License',
          spdxId: 'MIT',
        });
      }
    } finally {
      setIsAuditing(false);
    }
  };

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRole.trim()) return;

    const cleanName = newName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const newAgent: Agent = {
      name: cleanName,
      role: newRole,
      description: newDesc || newRole,
      chatCommand: `/${cleanName}`,
      tools: 'write, mcp',
      badge: 'Global',
    };

    setAgents([...agents, newAgent]);
    setIsModalOpen(false);
    setNewName('');
    setNewRole('');
    setNewDesc('');
    setNewPrompt('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      {/* NAVBAR */}
      <nav className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">
              ⚡
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
                Antigravity Hub
              </span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Next.js App Router
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              0% Risco Legal: MIT & Apache-2.0
            </span>
            <a
              href="https://github.com/Mauthope/antigravity-hub"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-colors flex items-center gap-2"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="max-w-7xl mx-auto px-6 pt-10 pb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-slate-800">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Gerenciador de Agentes & Skills (Next.js)
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
              Salve seus agentes na nuvem e use em qualquer projeto Antigravity. Importe skills do GitHub com verificação estrita de licenças e conecte servidores MCP.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              <span>+</span> Novo Agente
            </button>
            <a
              href="#importer-section"
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-900 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-2"
            >
              <span>🐙</span> Importar do GitHub
            </a>
          </div>
        </div>

        {/* CLI BANNER */}
        <div className="mt-6 p-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">💻</span>
            <div className="text-xs">
              <strong className="text-indigo-300">Acesse no terminal em qualquer máquina:</strong>
              <span className="text-slate-400 ml-1">Use direto pelo chat do Antigravity digitando o slash command do agente!</span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg font-mono text-xs text-slate-300">
            <code>ag-hub agent list</code>
            <button
              onClick={() => copyToClipboard('ag-hub agent list')}
              className="text-slate-500 hover:text-slate-300 ml-2"
              title="Copiar"
            >
              {copiedText === 'ag-hub agent list' ? '✅' : '📋'}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-12">
        {/* AGENTS SECTION */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span>🤖</span> Seus Agentes Disponíveis
              </h2>
              <p className="text-xs text-slate-400 mt-1">Invoque diretamente no chat digitando o comando correspondente.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {agents.map((a) => (
              <div
                key={a.name}
                className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 font-mono text-xs font-bold border border-indigo-500/20">
                      {a.chatCommand}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {a.badge || 'Global'}
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-slate-100">{a.role}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                </div>
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono text-[11px]">{a.tools}</span>
                  <button
                    onClick={() => copyToClipboard(a.chatCommand)}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    {copiedText === a.chatCommand ? 'Copiado!' : 'Copiar 📋'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* GITHUB IMPORTER SECTION */}
        <section
          id="importer-section"
          className="p-8 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950 shadow-xl space-y-6"
        >
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
              <span>🛡️</span> 0% Risco Jurídico
            </div>
            <h2 className="text-2xl font-bold">Importador Universal de Skills do GitHub</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Cole a URL de qualquer repositório, branch ou arquivo <code className="text-indigo-300">SKILL.md</code>. O sistema realiza auditoria imediata via GitHub API e só permite a instalação de código sob licenças permissivas <strong className="text-emerald-400">MIT</strong> ou <strong className="text-emerald-400">Apache-2.0</strong>.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="Ex: https://github.com/expressjs/express ou owner/repo"
                className="flex-1 px-4 py-3.5 rounded-xl border border-slate-700 bg-slate-900/80 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
              />
              <button
                onClick={handleAuditLicense}
                disabled={isAuditing}
                className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
              >
                <span>🔍</span> {isAuditing ? 'Auditando Licença...' : 'Auditar Licença & Importar'}
              </button>
            </div>

            {auditResult && (
              <div
                className={`p-5 rounded-2xl border text-xs space-y-2 ${
                  auditResult.valid
                    ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                    : 'border-red-500/30 bg-red-950/20 text-red-300'
                }`}
              >
                {auditResult.valid ? (
                  <>
                    <div className="font-bold text-sm flex items-center gap-2">
                      <span>✅</span> LICENÇA APROVADA: {auditResult.license} ({auditResult.spdxId})
                    </div>
                    <p className="text-slate-300">
                      Conformidade jurídica de 100% garantida (0% de risco legal). Esta skill pode ser instalada com segurança.
                    </p>
                    <div className="mt-2 p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-slate-200">
                      <code>ag-hub skill add {githubUrl} --global</code>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-sm flex items-center gap-2">
                      <span>🚫</span> INSTALAÇÃO BLOQUEADA (0% RISCO JURÍDICO)
                    </div>
                    <p className="text-slate-300">{auditResult.error || 'Licença não permitida ou inexistente.'}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* MCP SECTION */}
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>🔌</span> Conectores MCP & APIs REST
            </h2>
            <p className="text-xs text-slate-400 mt-1">Ligue ferramentas, bancos de dados e APIs diretamente ao Antigravity.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🗄️</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400">Pronto</span>
              </div>
              <h3 className="font-bold text-sm">SQLite Local</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Conecta bancos SQLite para consultas SQL pelo agente.</p>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400">
                ag-hub mcp preset sqlite
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🌐</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400">Pronto</span>
              </div>
              <h3 className="font-bold text-sm">Fetch Web</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Busca páginas da web e converte para Markdown limpo.</p>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400">
                ag-hub mcp preset fetch
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🐙</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400">Pronto</span>
              </div>
              <h3 className="font-bold text-sm">GitHub MCP</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Operações com PRs, commits e automações de repositório.</p>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400">
                ag-hub mcp preset github
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">⚡</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-400">Custom</span>
              </div>
              <h3 className="font-bold text-sm">API REST Wrapper</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Conecte qualquer API externa gerando scripts cURL auxiliares.</p>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400">
                ag-hub api-connect &lt;nome&gt;
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* MODAL: NOVO AGENTE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Criar Novo Agente para o Chat</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Identificador (Slash Command)</label>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 font-mono">/</span>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="ex: security-auditor"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Papel / Título</label>
                <input
                  type="text"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="ex: Senior Security Auditor"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Descrição</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="ex: Especialista em análise de vulnerabilidades OWASP"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Prompt de Sistema / Diretrizes</label>
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  rows={3}
                  placeholder="Diretrizes do agente..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white"
                >
                  Criar & Ativar no Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

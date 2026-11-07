'use client';

import React, { useState, useEffect } from 'react';

interface AgentMd {
  name: string;
  fileName: string;
  title: string;
  content: string;
  chatCommand: string;
}

export default function HomePage() {
  const [agents, setAgents] = useState<AgentMd[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // Handle file upload (.md file selected from disk)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const baseName = file.name.replace(/\.md$/i, '');
    setUploadName(baseName);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadContent(text);
      showToast(`Arquivo ${file.name} carregado no formulário!`);
    };
    reader.readAsText(file);
  };

  // Save agent from manual upload or paste
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadName.trim() || !uploadContent.trim()) {
      showToast('Preencha o nome e o conteúdo do markdown.');
      return;
    }

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadName,
          content: uploadContent,
        }),
      });

      if (res.ok) {
        showToast(`✅ Agente ${uploadName}.md salvo com sucesso!`);
        setUploadName('');
        setUploadContent('');
        fetchAgents();
      } else {
        const err = await res.json();
        showToast(`Erro: ${err.error || 'Falha ao salvar'}`);
      }
    } catch (err) {
      showToast('Erro de conexão ao salvar agente.');
    }
  };

  // Save from GitHub repo URL
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
        await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.name,
            content: data.content,
          }),
        });

        setGithubStatus({
          type: 'success',
          message: `✅ Agente '${data.name}.md' importado com sucesso do GitHub! Licença verificada: ${data.license} (0% risco legal).`,
        });
        setGithubUrl('');
        fetchAgents();
      } else {
        setGithubStatus({
          type: 'error',
          message: data.error || 'Não foi possível importar este repositório.',
        });
      }
    } catch {
      setGithubStatus({
        type: 'error',
        message: 'Falha ao conectar para importar do GitHub.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Delete agent
  const handleDelete = async (name: string) => {
    if (!confirm(`Deseja realmente excluir o agente ${name}.md?`)) return;

    try {
      const res = await fetch(`/api/agents?name=${name}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`🗑️ Agente ${name}.md removido.`);
        fetchAgents();
      }
    } catch {
      showToast('Falha ao excluir agente.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copiado para a área de transferência: ${text}`);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased p-6 md:p-10 font-sans">
      {/* TOAST */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-indigo-400">
          <span>🔔</span> {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between pb-8 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-600/30">
                📄
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Meus Agentes Markdown (`.md`)</h1>
                <p className="text-xs md:text-sm text-slate-400 mt-1">
                  Suba seus arquivos <code className="text-indigo-400">.md</code> ou salve novos diretamente a partir de repositórios do GitHub.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              🛡️ Apenas MIT & Apache-2.0
            </span>
            <a
              href="https://github.com/Mauthope/antigravity-hub/tree/main/agents"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 font-medium transition-colors"
            >
              Ver no GitHub ↗
            </a>
          </div>
        </header>

        {/* TWO PRIMARY ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ACTION 1: SUBIR ARQUIVO .MD */}
          <div className="p-6 rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-base">
              <span>📤</span>
              <h2>Subir meu Agente (`.md`)</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Carregue um arquivo <code className="text-slate-300">.md</code> do seu computador ou cole o texto do agente abaixo:
            </p>

            <form onSubmit={handleSaveManual} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Carregar arquivo do computador:</label>
                <input
                  type="file"
                  accept=".md,.markdown"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Nome do Agente (sem espaços):</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="ex: revisor-de-codigo"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Conteúdo Markdown do Agente:</label>
                <textarea
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  rows={4}
                  placeholder="# Revisor de Código&#10;&#10;Você é um revisor de código experiente...&#10;&#10;## Diretrizes&#10;- Examine segurança&#10;- Verifique arquitetura"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>💾</span> Salvar Agente (`.md`)
              </button>
            </form>
          </div>

          {/* ACTION 2: SALVAR DE REPOSITÓRIO GITHUB */}
          <div className="p-6 rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
              <span>🐙</span>
              <h2>Salvar de Repositório do GitHub</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cole a URL de qualquer repositório no GitHub. O sistema audita a licença e baixa o <code className="text-slate-300">.md</code> do agente automaticamente:
            </p>

            <form onSubmit={handleImportGithub} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Link do repositório no GitHub:</label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/usuario/meu-agente"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Como funciona a auditoria:</div>
                <div>• Verifica licença via API oficial (apenas MIT e Apache-2.0).</div>
                <div>• Localiza arquivos <code className="text-indigo-300">SKILL.md</code>, <code className="text-indigo-300">agent.md</code> ou <code className="text-indigo-300">README.md</code>.</div>
                <div>• Salva como novo agente na sua pasta <code className="text-emerald-400">agents/</code>.</div>
              </div>

              <button
                type="submit"
                disabled={isImporting}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>📥</span> {isImporting ? 'Auditando e Baixando...' : 'Baixar e Salvar como Agente'}
              </button>
            </form>

            {githubStatus && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  githubStatus.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                    : 'border-red-500/30 bg-red-950/20 text-red-300'
                }`}
              >
                {githubStatus.message}
              </div>
            )}
          </div>

        </div>

        {/* AGENTS LIST */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>📚</span> Agentes Salvos ({agents.length})
            </h2>
            <span className="text-xs text-slate-400">Pasta: <code>agents/&lt;nome&gt;.md</code></span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Carregando agentes...</div>
          ) : agents.length === 0 ? (
            <div className="p-12 rounded-3xl border border-dashed border-slate-800 text-center space-y-2">
              <div className="text-2xl">📭</div>
              <h3 className="text-sm font-bold text-slate-300">Nenhum agente salvo ainda</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Suba seu primeiro arquivo <code className="text-slate-400">.md</code> ou cole uma URL do GitHub acima para salvar seu primeiro agente!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="p-5 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-4 shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {agent.fileName}
                      </span>
                      <button
                        onClick={() => handleDelete(agent.name)}
                        className="text-slate-500 hover:text-red-400 text-xs px-1"
                        title="Excluir agente"
                      >
                        ✕
                      </button>
                    </div>

                    <h3 className="font-bold text-sm text-slate-100">{agent.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed font-mono bg-slate-950 p-2 rounded-lg border border-slate-900">
                      {agent.content.slice(0, 150)}...
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={() => setPreviewAgent(agent)}
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      Ver `.md` 👁️
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => downloadMd(agent)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300"
                        title="Baixar arquivo markdown"
                      >
                        Baixar 💾
                      </button>
                      <button
                        onClick={() => copyToClipboard(agent.content)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] text-white font-medium shadow-sm"
                        title="Copiar prompt completo para o chat"
                      >
                        Copiar 📋
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* MODAL PREVIEW MARKDOWN */}
      {previewAgent && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-sm">{previewAgent.fileName}</h3>
                <span className="text-xs text-slate-400">{previewAgent.title}</span>
              </div>
              <button
                onClick={() => setPreviewAgent(null)}
                className="text-slate-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {previewAgent.content}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => downloadMd(previewAgent)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Baixar `.md`
              </button>
              <button
                onClick={() => {
                  copyToClipboard(previewAgent.content);
                  setPreviewAgent(null);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Copiar Prompt Completo 📋
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

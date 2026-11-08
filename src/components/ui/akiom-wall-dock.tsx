"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  UploadCloud,
  GitPullRequest,
  Database,
  Cpu,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AkiomWallDockProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  onOpenNeon: () => void;
  onOpenMcp: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  dbConnected: boolean | null;
  agentCount: number;
}

export function AkiomWallDock({
  activeSection,
  onSelectSection,
  onOpenNeon,
  onOpenMcp,
  isDark,
  onToggleTheme,
  dbConnected,
  agentCount,
}: AkiomWallDockProps) {
  const [visible, setVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 120 && currentScrollY > lastScrollY) {
        // Scrolling down -> hide smoothly to release viewport
        setVisible(false);
      } else {
        // Scrolling up or near top -> show
        setVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <aside
      aria-label="Navegação Flutuante Dock Akiom"
      className={cn(
        "fixed bottom-5 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 pointer-events-auto",
        visible
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-16 opacity-0 scale-95 pointer-events-none"
      )}
    >
      <div className="flex items-center gap-1 sm:gap-2 px-3 py-2 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-slate-300/80 dark:border-slate-800 shadow-[0_16px_40px_-10px_rgba(15,23,42,0.18),inset_0_1px_1px_rgba(255,255,255,0.8)] dark:shadow-[0_20px_45px_-12px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.1)]">
        {/* Nav 1: Agentes */}
        <button
          type="button"
          onClick={() => onSelectSection("catalog")}
          className={cn(
            "relative min-h-[44px] px-3 sm:px-4 py-2 rounded-full font-heading font-bold text-xs flex items-center gap-2 transition-all duration-200 cursor-pointer select-none",
            activeSection === "catalog"
              ? "bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-white shadow-[0_6px_18px_-3px_rgba(6,182,212,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)]"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
          )}
          title="Ver Catálogo de Agentes"
        >
          <Bot className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span className="hidden sm:inline">Agentes</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold",
              activeSection === "catalog"
                ? "bg-white/25 text-white"
                : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            )}
          >
            {agentCount}
          </span>
        </button>

        {/* Nav 2: Subir .md */}
        <button
          type="button"
          onClick={() => onSelectSection("upload")}
          className={cn(
            "relative min-h-[44px] px-3 sm:px-4 py-2 rounded-full font-heading font-bold text-xs flex items-center gap-2 transition-all duration-200 cursor-pointer select-none",
            activeSection === "upload"
              ? "bg-gradient-to-r from-cyan-600 via-sky-500 to-indigo-600 text-white shadow-[0_6px_18px_-3px_rgba(6,182,212,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)]"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
          )}
          title="Subir arquivo markdown (.md)"
        >
          <UploadCloud className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span className="hidden sm:inline">Subir .md</span>
        </button>

        {/* Nav 3: GitHub */}
        <button
          type="button"
          onClick={() => onSelectSection("github")}
          className={cn(
            "relative min-h-[44px] px-3 sm:px-4 py-2 rounded-full font-heading font-bold text-xs flex items-center gap-2 transition-all duration-200 cursor-pointer select-none",
            activeSection === "github"
              ? "bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 text-white shadow-[0_6px_18px_-3px_rgba(16,185,129,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)]"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
          )}
          title="Importar do GitHub com auditoria MIT/Apache-2.0"
        >
          <GitPullRequest className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span className="hidden sm:inline">GitHub</span>
        </button>

        <div className="w-[1px] h-6 bg-slate-300 dark:bg-slate-800 mx-0.5 sm:mx-1" />

        {/* Action 4: Neon Database */}
        <button
          type="button"
          onClick={onOpenNeon}
          className={cn(
            "relative min-h-[44px] px-3 py-2 rounded-full font-heading font-bold text-xs flex items-center gap-1.5 transition-all duration-200 cursor-pointer select-none",
            dbConnected
              ? "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
              : "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
          )}
          title="Status e Diagnóstico do Neon PostgreSQL"
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              dbConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )}
          />
          <Database className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span className="hidden md:inline">Neon</span>
        </button>

        {/* Action 5: MCP Server */}
        <button
          type="button"
          onClick={onOpenMcp}
          className="relative min-h-[44px] px-3 py-2 rounded-full font-heading font-bold text-xs text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/10 flex items-center gap-1.5 transition-all duration-200 cursor-pointer select-none"
          title="Conectar ao Antigravity via Protocolo MCP"
        >
          <Cpu className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span className="hidden md:inline">MCP</span>
        </button>

        {/* Action 6: Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2.5 rounded-full text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Alternar Modo Claro (Porcelana) / Escuro (Obsidian)"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" strokeWidth={2} />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600" strokeWidth={2} />
          )}
        </button>
      </div>
    </aside>
  );
}

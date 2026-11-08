"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface TactileTabItem {
  id: string;
  label: string;
  badge?: string | number;
  accent: "cyan" | "violet" | "amber" | "rose" | "emerald" | "slate" | "indigo";
  icon?: React.ReactNode;
}

interface TactilePillTabsProps {
  tabs: TactileTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function TactilePillTabs({ tabs, activeId, onChange, className }: TactilePillTabsProps) {
  const activeStyles: Record<TactileTabItem["accent"], string> = {
    cyan: "bg-gradient-to-b from-cyan-400 via-sky-500 to-blue-600 text-white shadow-[0_10px_22px_-4px_rgba(14,165,233,0.6),inset_0_2px_2px_rgba(255,255,255,0.65)] border-cyan-300/60",
    violet: "bg-gradient-to-b from-violet-500 via-purple-600 to-indigo-700 text-white shadow-[0_10px_22px_-4px_rgba(139,92,246,0.6),inset_0_2px_2px_rgba(255,255,255,0.65)] border-violet-300/60",
    amber: "bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-slate-950 shadow-[0_10px_22px_-4px_rgba(245,158,11,0.55),inset_0_2px_2px_rgba(255,255,255,0.75)] border-amber-200/80",
    rose: "bg-gradient-to-b from-pink-400 via-rose-500 to-red-600 text-white shadow-[0_10px_22px_-4px_rgba(244,63,94,0.6),inset_0_2px_2px_rgba(255,255,255,0.65)] border-rose-300/60",
    emerald: "bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-600 text-white shadow-[0_10px_22px_-4px_rgba(16,185,129,0.6),inset_0_2px_2px_rgba(255,255,255,0.65)] border-emerald-300/60",
    slate: "bg-gradient-to-b from-slate-600 via-slate-700 to-slate-900 text-white shadow-[0_10px_22px_-4px_rgba(71,85,105,0.6),inset_0_2px_2px_rgba(255,255,255,0.4)] border-slate-500/60",
    indigo: "bg-gradient-to-b from-indigo-500 via-indigo-600 to-indigo-800 text-white shadow-[0_10px_22px_-4px_rgba(99,102,241,0.6),inset_0_2px_2px_rgba(255,255,255,0.65)] border-indigo-400/60",
  };

  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-3xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative min-h-[44px] px-4 sm:px-5 py-2.5 rounded-full font-heading font-bold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer select-none border",
              isActive
                ? activeStyles[tab.accent]
                : "border-transparent bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-heading font-extrabold",
                  isActive
                    ? "bg-white/25 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

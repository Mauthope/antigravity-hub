'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SquircleColor = 'blue' | 'emerald' | 'amber' | 'violet';

interface SquircleKpiCardProps {
  badgeNumber: number;
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon: LucideIcon;
  color?: SquircleColor;
  className?: string;
  onClick?: () => void;
}

export function SquircleKpiCard({
  badgeNumber,
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  color = 'blue',
  className,
  onClick,
}: SquircleKpiCardProps) {
  const squircleStyles: Record<SquircleColor, { box: string; pill: string }> = {
    blue: {
      box: 'bg-gradient-to-br from-blue-500 via-indigo-500 to-cyan-500 shadow-[0_14px_28px_-6px_rgba(59,130,246,0.55),inset_0_2px_3px_rgba(255,255,255,0.55)]',
      pill: 'bg-indigo-600 text-white border-2 border-white dark:border-slate-900',
    },
    emerald: {
      box: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-[0_14px_28px_-6px_rgba(16,185,129,0.55),inset_0_2px_3px_rgba(255,255,255,0.55)]',
      pill: 'bg-emerald-600 text-white border-2 border-white dark:border-slate-900',
    },
    amber: {
      box: 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 shadow-[0_14px_28px_-6px_rgba(249,115,22,0.55),inset_0_2px_3px_rgba(255,255,255,0.55)]',
      pill: 'bg-orange-600 text-white border-2 border-white dark:border-slate-900',
    },
    violet: {
      box: 'bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-500 shadow-[0_14px_28px_-6px_rgba(139,92,246,0.55),inset_0_2px_3px_rgba(255,255,255,0.55)]',
      pill: 'bg-purple-700 text-white border-2 border-white dark:border-slate-900',
    },
  };

  const style = squircleStyles[color];

  return (
    <div
      onClick={onClick}
      className={cn(
        'glow-card p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group min-w-0 cursor-pointer',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-heading font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 truncate uppercase tracking-wider">
          {title}
        </span>
        <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 group-hover:text-cyan-500 transition-colors">
          <Icon className="w-4 h-4" />
          <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className={cn('w-12 h-12 sm:w-14 sm:h-14 rounded-[1.25rem] flex items-center justify-center text-white', style.box)}>
            <Icon className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className={cn('absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-heading font-black shadow-md', style.pill)}>
            {badgeNumber}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-heading font-black text-2xl sm:text-3xl text-slate-900 dark:text-white tracking-tight">
              {value}
            </span>
            {unit && <span className="text-xs font-heading font-bold text-slate-500 dark:text-slate-400">{unit}</span>}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CapsuleVariant = 'primary' | 'cyan' | 'amber' | 'violet' | 'emerald' | 'danger' | 'porcelain';

interface GlassCapsuleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CapsuleVariant;
  isLoading?: boolean;
  isSuccess?: boolean;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  withOuterShell?: boolean;
}

export function GlassCapsuleButton({
  children,
  variant = 'primary',
  isLoading = false,
  isSuccess = false,
  icon,
  size = 'md',
  withOuterShell = true,
  className,
  disabled,
  ...props
}: GlassCapsuleButtonProps) {
  const effectiveVariant: CapsuleVariant = isLoading
    ? 'danger'
    : isSuccess
      ? 'emerald'
      : variant;

  const variantClasses: Record<CapsuleVariant, string> = {
    primary:
      'bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-400 text-white shadow-[0_8px_24px_-4px_rgba(6,182,212,0.55),inset_0_2px_2px_rgba(255,255,255,0.65),inset_0_-2px_4px_rgba(2,132,199,0.8)] hover:from-cyan-500 hover:via-sky-400 hover:to-indigo-500 hover:shadow-[0_10px_28px_-4px_rgba(6,182,212,0.65),inset_0_2px_3px_rgba(255,255,255,0.8)] focus-visible:from-slate-900 focus-visible:to-blue-950',
    cyan:
      'bg-gradient-to-r from-cyan-600 via-sky-500 to-indigo-600 text-white shadow-[0_8px_24px_-4px_rgba(6,182,212,0.55),inset_0_2px_2px_rgba(255,255,255,0.65)] hover:brightness-110',
    amber:
      'bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 text-slate-950 shadow-[0_8px_24px_-4px_rgba(245,158,11,0.55),inset_0_2px_2px_rgba(255,255,255,0.75)] hover:brightness-105',
    violet:
      'bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 text-white shadow-[0_8px_24px_-4px_rgba(139,92,246,0.55),inset_0_2px_2px_rgba(255,255,255,0.6)] hover:brightness-110',
    emerald:
      'bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 text-white shadow-[0_8px_24px_-4px_rgba(16,185,129,0.5),inset_0_2px_2px_rgba(255,255,255,0.65)] hover:brightness-105',
    danger:
      'bg-gradient-to-r from-red-600 via-rose-500 to-orange-500 text-white shadow-[0_8px_24px_-4px_rgba(239,68,68,0.6),inset_0_2px_2px_rgba(255,255,255,0.65)]',
    porcelain:
      'bg-gradient-to-b from-white to-slate-100 dark:from-slate-800 dark:to-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300/80 dark:border-slate-700 shadow-[0_6px_16px_-4px_rgba(15,23,42,0.12),inset_0_2px_1px_rgba(255,255,255,0.9)] hover:border-cyan-500/50',
  };

  const sizeClasses = {
    sm: 'px-4 py-1.5 text-xs min-h-[36px]',
    md: 'px-5 py-2.5 text-xs min-h-[42px]',
    lg: 'px-7 py-3 text-sm min-h-[48px]',
  };

  const buttonNode = (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'relative rounded-full font-heading font-bold tracking-wide transition-all duration-300 flex items-center justify-center gap-2 select-none cursor-pointer active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden',
        sizeClasses[size],
        variantClasses[effectiveVariant],
        !withOuterShell && className
      )}
      {...props}
    >
      {/* Reflexo especular superior de vidro */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 top-0.5 h-[38%] rounded-full bg-gradient-to-b from-white/55 to-transparent opacity-80"
      />
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 relative z-10" />
      ) : isSuccess ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 relative z-10" />
      ) : (
        icon && <span className="shrink-0 relative z-10">{icon}</span>
      )}
      <span className="relative z-10 truncate">{children}</span>
    </button>
  );

  if (!withOuterShell) return buttonNode;

  return (
    <div className={cn('inline-flex glass-capsule-shell', className)}>
      {buttonNode}
    </div>
  );
}

import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", dot = false, children, ...props }, ref) => {
    const variantStyles = {
      success: "bg-emerald-950/80 text-emerald-300 border-emerald-800/60",
      warning: "bg-amber-950/80 text-amber-300 border-amber-800/60",
      error: "bg-rose-950/80 text-rose-300 border-rose-800/60",
      info: "bg-sky-950/80 text-sky-300 border-sky-800/60",
      neutral: "bg-slate-800/80 text-slate-300 border-slate-700/60",
    };

    const dotColors = {
      success: "bg-emerald-400",
      warning: "bg-amber-400",
      error: "bg-rose-400",
      info: "bg-sky-400",
      neutral: "bg-slate-400",
    };

    return (
      <span
        ref={ref}
        role="status"
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn("h-1.5 w-1.5 rounded-full animate-pulse", dotColors[variant])}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

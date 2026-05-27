"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, cta, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className ?? ""}`}
    >
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      )}
      {cta && (
        <div className="mt-5">
          {cta.href ? (
            <Button asChild className="bg-[#16A34A] hover:bg-[#15803d] text-white">
              <a href={cta.href}>{cta.label}</a>
            </Button>
          ) : (
            <Button
              onClick={cta.onClick}
              className="bg-[#16A34A] hover:bg-[#15803d] text-white"
            >
              {cta.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

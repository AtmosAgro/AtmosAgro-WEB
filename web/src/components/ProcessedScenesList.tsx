"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function parseIsoDate(iso: string): Date {
  // YYYY-MM-DD → Date às 12h UTC pra evitar timezone shenanigans no render
  return new Date(`${iso}T12:00:00Z`);
}

type Grouped = {
  year: number;
  dates: { iso: string; day: number; monthIdx: number }[];
};

export type ProcessedScenesListProps = {
  /** Datas ISO YYYY-MM-DD com cena já processada */
  dates: Set<string>;
  /** Data atualmente selecionada (highlight) */
  selectedDate?: string;
  /** Disparado ao clicar numa data — caller deve setar selectedDate + visibleMonth */
  onDateClick: (iso: string) => void;
};

export function ProcessedScenesList({ dates, selectedDate, onDateClick }: ProcessedScenesListProps) {
  const grouped = useMemo<Grouped[]>(() => {
    const byYear = new Map<number, { iso: string; day: number; monthIdx: number }[]>();
    for (const iso of dates) {
      const d = parseIsoDate(iso);
      const year = d.getUTCFullYear();
      const monthIdx = d.getUTCMonth();
      const day = d.getUTCDate();
      const list = byYear.get(year) ?? [];
      list.push({ iso, day, monthIdx });
      byYear.set(year, list);
    }
    const result: Grouped[] = [];
    for (const [year, list] of byYear.entries()) {
      list.sort((a, b) => b.monthIdx - a.monthIdx || b.day - a.day);
      result.push({ year, dates: list });
    }
    result.sort((a, b) => b.year - a.year);
    return result;
  }, [dates]);

  const initialExpanded = useMemo(() => {
    // Se só tem 1 ano, expande direto. Caso contrário, expande apenas o mais recente.
    const set = new Set<number>();
    if (grouped.length > 0) set.add(grouped[0].year);
    return set;
  }, [grouped]);

  const [expandedYears, setExpandedYears] = useState<Set<number>>(initialExpanded);

  const totalCount = dates.size;

  if (totalCount === 0) return null;

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        Cenas processadas ({totalCount})
      </p>
      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
        {grouped.map(({ year, dates: yearDates }) => {
          const isOpen = expandedYears.has(year);
          return (
            <div key={year}>
              <button
                type="button"
                onClick={() => toggleYear(year)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <span>
                  {year} <span className="font-normal text-slate-400">({yearDates.length})</span>
                </span>
                <ChevronDown
                  className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {isOpen && (
                <div className="ml-2 mt-1 flex flex-wrap gap-1">
                  {yearDates.map(({ iso, day, monthIdx }) => {
                    const isSelected = iso === selectedDate;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => onDateClick(iso)}
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                        }`}
                        title={iso}
                      >
                        {day} {MONTH_LABELS[monthIdx]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

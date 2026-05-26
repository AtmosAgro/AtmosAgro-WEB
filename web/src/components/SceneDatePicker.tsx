"use client";

import { useMemo } from "react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Calendar } from "@/components/ui/calendar";

const ISO_FMT = "yyyy-MM-dd";

function toIso(date: Date): string {
  return format(date, ISO_FMT);
}

function fromIso(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, ISO_FMT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

export type SceneDatePickerProps = {
  availableDates: Set<string>;
  downloadableLow?: Set<string>;
  downloadablePartial?: Set<string>;
  downloadableCloudy?: Set<string>;
  downloadableUnknown?: Set<string>;
  selectedDate: string;
  onSelect: (date: string) => void;
  onRequestNewDate: (date: string) => void;
  onMonthChange?: (month: Date) => void;
};

export function SceneDatePicker({
  availableDates,
  downloadableLow,
  downloadablePartial,
  downloadableCloudy,
  downloadableUnknown,
  selectedDate,
  onSelect,
  onRequestNewDate,
  onMonthChange,
}: SceneDatePickerProps) {
  const selected = useMemo(() => fromIso(selectedDate), [selectedDate]);

  const allDownloadable = useMemo(() => {
    const set = new Set<string>();
    for (const s of [downloadableLow, downloadablePartial, downloadableCloudy, downloadableUnknown]) {
      s?.forEach((d) => set.add(d));
    }
    return set;
  }, [downloadableLow, downloadablePartial, downloadableCloudy, downloadableUnknown]);

  const modifiers = useMemo(
    () => ({
      available: (date: Date) => availableDates.has(toIso(date)),
      cloudLow: (date: Date) => {
        const iso = toIso(date);
        return !!downloadableLow?.has(iso) && !availableDates.has(iso);
      },
      cloudPartial: (date: Date) => {
        const iso = toIso(date);
        return !!downloadablePartial?.has(iso) && !availableDates.has(iso);
      },
      cloudHigh: (date: Date) => {
        const iso = toIso(date);
        return !!downloadableCloudy?.has(iso) && !availableDates.has(iso);
      },
      cloudUnknown: (date: Date) => {
        const iso = toIso(date);
        return !!downloadableUnknown?.has(iso) && !availableDates.has(iso);
      },
    }),
    [availableDates, downloadableLow, downloadablePartial, downloadableCloudy, downloadableUnknown],
  );

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const iso = toIso(date);
    if (availableDates.has(iso)) {
      onSelect(iso);
    } else {
      onRequestNewDate(iso);
    }
  };

  const dotBase =
    "[&>button]:relative [&>button]:font-semibold [&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:left-1/2 [&>button]:after:h-1 [&>button]:after:w-1 [&>button]:after:-translate-x-1/2 [&>button]:after:rounded-full";

  return (
    <div className="space-y-2">
      <Calendar
        mode="single"
        locale={ptBR}
        selected={selected}
        onSelect={handleSelect}
        onMonthChange={onMonthChange}
        modifiers={modifiers}
        modifiersClassNames={{
          available: `${dotBase} [&>button]:text-emerald-700 [&>button]:after:bg-emerald-500`,
          cloudLow: `${dotBase} [&>button]:text-sky-700 [&>button]:after:bg-sky-500`,
          cloudPartial: `${dotBase} [&>button]:text-amber-700 [&>button]:after:bg-amber-500`,
          cloudHigh: `${dotBase} [&>button]:text-red-700 [&>button]:after:bg-red-500`,
          cloudUnknown: `${dotBase} [&>button]:text-slate-600 [&>button]:after:bg-slate-300`,
        }}
        className="rounded-lg border border-slate-200 bg-white p-2"
      />
      <div className="grid grid-cols-1 gap-1 text-[10px] text-slate-500">
        <LegendItem color="bg-emerald-500" label="Cena já processada" />
        {allDownloadable.size > 0 && (
          <>
            {downloadableLow && downloadableLow.size > 0 && (
              <LegendItem color="bg-sky-500" label="Disponível · nuvem ≤ 30%" />
            )}
            {downloadablePartial && downloadablePartial.size > 0 && (
              <LegendItem color="bg-amber-500" label="Disponível · nuvem 30-70%" />
            )}
            {downloadableCloudy && downloadableCloudy.size > 0 && (
              <LegendItem color="bg-red-500" label="Disponível · nuvem > 70%" />
            )}
            {downloadableUnknown && downloadableUnknown.size > 0 && (
              <LegendItem color="bg-slate-300" label="Disponível · nuvem n/d" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

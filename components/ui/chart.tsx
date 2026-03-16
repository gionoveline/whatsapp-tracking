"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";

export type ChartConfig = Record<
  string,
  {
    label: string;
    color?: string;
  }
>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

type ChartContainerProps = {
  children: React.ReactNode;
  config: ChartConfig;
  className?: string;
};

export function ChartContainer({ children, config, className }: ChartContainerProps) {
  const style: React.CSSProperties = {};
  for (const [key, value] of Object.entries(config)) {
    if (value.color) {
      (style as any)[`--color-${key}`] = value.color;
    }
  }

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={"relative w-full " + (className ?? "")}
        style={style}
      >
        <ResponsiveContainer width="100%" height={260}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

type ChartTooltipProps = React.ComponentProps<typeof Tooltip>;

export function ChartTooltip(props: ChartTooltipProps) {
  return <Tooltip {...props} />;
}

type ChartTooltipContentProps = {
  active?: boolean;
  payload?: any[];
  label?: string;
};

export function ChartTooltipContent({ active, payload, label }: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-[var(--foreground)]">{label}</div>
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color ?? "currentColor" }}
              />
              <span className="text-[var(--muted-foreground)]">
                {entry.name ?? entry.dataKey}
              </span>
            </span>
            <span className="font-medium text-[var(--foreground)]">
              {entry.value}
              {entry.dataKey?.toString().toLowerCase().includes("rate") ? "%" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ChartLegendProps = React.ComponentProps<typeof Legend>;

export function ChartLegend(props: ChartLegendProps) {
  return <Legend {...props} />;
}

type ChartLegendContentProps = {
  payload?: any[];
};

export function ChartLegendContent({ payload }: ChartLegendContentProps) {
  if (!payload?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--muted-foreground)]">
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: item.color ?? "currentColor" }}
          />
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
};


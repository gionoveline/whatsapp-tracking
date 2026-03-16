"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "p-3 text-sm bg-[var(--card)] text-[var(--foreground)] rounded-2xl border border-[var(--border)] shadow-sm",
        className
      )}
      classNames={{
        months: "flex flex-col space-y-4",
        month: "space-y-4",
        caption: "flex justify-between items-center px-1",
        caption_label: "text-sm font-medium text-[var(--foreground)]",
        nav: "flex items-center gap-1",
        nav_button:
          "h-7 w-7 rounded-full border border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--muted)]/60",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "w-9 text-[0.7rem] font-normal text-[var(--muted-foreground)] text-center",
        row: "flex w-full mt-1",
        cell: "h-9 w-9 text-center text-sm p-0 relative",
        day: "h-9 w-9 p-0 font-normal rounded-full text-[var(--foreground)] hover:bg-[var(--muted)]/70",
        day_selected:
          "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        day_today:
          "border border-[var(--accent)] text-[var(--accent)] bg-[var(--background)] hover:bg-[var(--accent)]/10",
        day_outside: "text-[var(--muted-foreground)]/50",
        day_disabled: "text-[var(--muted-foreground)]/40",
        day_range_middle:
          "bg-[var(--accent)]/10 text-[var(--accent-foreground)] aria-selected:bg-[var(--accent)]/10",
        ...classNames,
      }}
      {...props}
    />
  );
}


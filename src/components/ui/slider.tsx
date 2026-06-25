"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Brand-styled native range slider. Kept dependency-free (native <input>) so
 * the booth demo stays deterministic and the integrator has nothing extra to
 * wire. Accent color matches the Inngest coral.
 */
function Slider({
  className,
  label,
  valueLabel,
  ...props
}: React.ComponentProps<"input"> & {
  label?: React.ReactNode;
  valueLabel?: React.ReactNode;
}) {
  return (
    <label className={cn("grid gap-2", className)}>
      {(label || valueLabel) && (
        <span className="mono flex items-center justify-between text-[11px] uppercase">
          <span>{label}</span>
          <span className="tabnum text-[var(--muted-copy)]">{valueLabel}</span>
        </span>
      )}
      <input
        type="range"
        data-slot="slider"
        className="h-1.5 w-full cursor-pointer appearance-none bg-[var(--cloud)] accent-[var(--coral)]"
        {...props}
      />
    </label>
  );
}

export { Slider };

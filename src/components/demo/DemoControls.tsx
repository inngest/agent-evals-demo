"use client";

import * as React from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { DemoFlags } from "@/lib/demo-flags";

export function DemoControls({
  flags,
  onFlagsChange,
  onReset,
}: {
  flags: DemoFlags;
  onFlagsChange: (flags: DemoFlags) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="border-[var(--ink)] bg-white"
          />
        }
      >
        <Settings2 className="size-4" />
        Demo Controls
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(420px,calc(100vw-24px))] border-[var(--ink)] bg-white"
      >
        <SheetHeader className="border-b border-[var(--rule-soft)]">
          <SheetTitle className="display text-xl">Demo Controls</SheetTitle>
          <SheetDescription>
            Tune the recovery beat for the next agent run.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 p-4">
          <label className="flex items-center justify-between gap-4 border border-[var(--rule-soft)] p-4">
            <span>
              <span className="display block text-base font-medium">
                Opus offline
              </span>
              <span className="mt-1 block text-sm text-[var(--muted-copy)]">
                Make generate-sql fail before it recovers.
              </span>
            </span>
            <input
              type="checkbox"
              checked={flags.llmOffline}
              onChange={(event) =>
                onFlagsChange({ ...flags, llmOffline: event.target.checked })
              }
              className="size-5 accent-[var(--coral)]"
            />
          </label>

          <label className="grid gap-3">
            <span className="flex items-center justify-between">
              <span className="display text-base font-medium">
                Retry failures
              </span>
              <span className="mono tabnum text-xs">{flags.failureCount}</span>
            </span>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={flags.failureCount}
              onChange={(event) =>
                onFlagsChange({
                  ...flags,
                  failureCount: Number(event.target.value),
                })
              }
              className="accent-[var(--coral)]"
            />
          </label>

          <label className="grid gap-3">
            <span className="flex items-center justify-between">
              <span className="display text-base font-medium">Slow mode</span>
              <span className="mono tabnum text-xs">{flags.latencyMs}ms</span>
            </span>
            <input
              type="range"
              min={0}
              max={1800}
              step={100}
              value={flags.latencyMs}
              onChange={(event) =>
                onFlagsChange({ ...flags, latencyMs: Number(event.target.value) })
              }
              className="accent-[var(--coral)]"
            />
          </label>

          <Button
            variant="outline"
            className="h-10 justify-start border-[var(--ink)]"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            <RotateCcw className="size-4" />
            Reset demo
          </Button>

          <Button
            className="h-10 bg-[var(--ink)] text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

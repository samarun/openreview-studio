"use client";

import type { UploadController, UploadProgress } from "../../lib/upload";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function UploadProgressBar({
  progress,
  controller,
}: {
  progress: UploadProgress;
  controller?: UploadController;
}) {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-frame-border">
        <div
          className="h-full bg-frame-accent transition-all duration-300"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-frame-muted">
        <div className="flex items-center gap-3">
          <span>{progress.percent}%</span>
          {progress.currentPart !== null && progress.totalParts !== null && (
            <span>
              Part {progress.currentPart}/{progress.totalParts}
            </span>
          )}
          {progress.speed !== null && <span>{formatSpeed(progress.speed)}</span>}
          {progress.etaSeconds !== null && progress.etaSeconds > 0 && (
            <span>{formatEta(progress.etaSeconds)} left</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span>
            {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.bytesTotal)}
          </span>
          {controller && (
            <div className="flex gap-1.5">
              {!controller.isCancelled && (
                <button
                  className="rounded border border-frame-border px-2 py-0.5 text-xs hover:bg-frame-panel-elevated"
                  onClick={() => (controller.isPaused ? controller.resume() : controller.pause())}
                  type="button"
                >
                  {controller.isPaused ? "Resume" : "Pause"}
                </button>
              )}
              {!controller.isCancelled && (
                <button
                  className="rounded border border-rose-500/40 px-2 py-0.5 text-xs text-rose-300 hover:bg-rose-500/10"
                  onClick={() => controller.cancel()}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

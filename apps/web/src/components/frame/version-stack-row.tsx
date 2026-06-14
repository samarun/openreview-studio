"use client";

import Link from "next/link";
import { versionStatusClass, versionStatusLabel, formatDuration } from "../../lib/version-ui";
import type { AssetVersion } from "../../lib/types";

type VersionStackRowProps = {
  version: AssetVersion;
  active?: boolean;
  compareHref?: string;
  onSelect?: () => void;
  onArchive?: () => void;
  loading?: boolean;
};

export function VersionStackRow({ version, active, compareHref, onSelect, onArchive, loading }: VersionStackRowProps) {
  const fileName = version.originalKey.split("/").pop() ?? version.originalKey;

  return (
    <article
      className={`cursor-pointer rounded-lg border p-3 transition ${
        active ? "border-frame-accent bg-frame-accent/10" : "border-frame-border bg-frame-panel-elevated hover:border-frame-accent/40"
      }`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (onSelect && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-frame-text">v{version.versionNumber}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${versionStatusClass(version.status)}`}>
              {versionStatusLabel(version.status)}
            </span>
            {active ? <span className="text-[10px] font-medium text-frame-accent">Current</span> : null}
          </div>
          <p className="mt-1 truncate text-xs text-frame-muted" title={version.originalKey}>
            {fileName}
          </p>
          <p className="mt-1 text-[11px] text-frame-muted">
            {formatDuration(version.durationSeconds)}
            {version.width && version.height ? ` · ${version.width}×${version.height}` : ""}
          </p>
          {version.failureReason ? <p className="mt-1 text-xs text-rose-300">{version.failureReason}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {version.status === "READY" ? (
          <Link
            className="frame-btn-primary !px-3 !py-1.5 text-xs"
            href={`/review/${version.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            Review
          </Link>
        ) : (
          <span className="rounded-lg border border-frame-border px-3 py-1.5 text-xs text-frame-muted">Processing…</span>
        )}
        {compareHref ? (
          <Link
            className="frame-btn-secondary !px-3 !py-1.5 text-xs"
            href={compareHref}
            onClick={(event) => event.stopPropagation()}
            title="Compare with the previous version side by side"
          >
            Side by side
          </Link>
        ) : null}
        {onArchive ? (
          <button
            className="frame-btn-secondary !px-3 !py-1.5 text-xs text-rose-300"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
            type="button"
          >
            Archive
          </button>
        ) : null}
      </div>
    </article>
  );
}

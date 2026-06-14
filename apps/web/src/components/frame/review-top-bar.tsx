"use client";

import Link from "next/link";
import { approvalLabel, approvalStatusOptions } from "../../lib/approval-ui";
import type { ApprovalStatus } from "../../lib/types";

type ReviewTopBarProps = {
  assetName: string;
  projectName: string;
  versionNumber: number;
  versionStatus: string;
  approvalStatus?: ApprovalStatus;
  backHref: string;
  onStatusChange: (status: ApprovalStatus) => void;
  onShare: () => void;
  onDownload?: () => void;
  downloadDisabled?: boolean;
  presenterHref?: string;
  exitPresenterHref?: string;
  compareHref?: string;
};

export function ReviewTopBar({
  assetName,
  projectName,
  versionNumber,
  versionStatus,
  approvalStatus,
  backHref,
  onStatusChange,
  onShare,
  onDownload,
  downloadDisabled,
  presenterHref,
  exitPresenterHref,
  compareHref
}: ReviewTopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-frame-border bg-frame-panel px-4">
      <div className="flex min-w-0 items-center gap-4">
        <Link className="text-sm text-frame-muted hover:text-frame-text" href={backHref}>
          ← Back
        </Link>
        <div className="min-w-0 border-l border-frame-border pl-4">
          <h1 className="truncate text-sm font-semibold text-frame-text">{assetName}</h1>
          <p className="truncate text-xs text-frame-muted">
            {projectName} · v{versionNumber} · {versionStatus}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="review-status">
          Review status
        </label>
        <select
          className="rounded-lg border border-frame-border bg-frame-panel-elevated px-3 py-1.5 text-xs font-medium text-frame-text"
          id="review-status"
          onChange={(event) => onStatusChange(event.target.value as ApprovalStatus)}
          value={approvalStatus ?? "PENDING"}
        >
          {approvalStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="hidden rounded-full border border-frame-border px-2 py-1 text-[10px] uppercase tracking-wide text-frame-muted sm:inline">
          {approvalLabel(approvalStatus)}
        </span>
        {onDownload ? (
          <button className="frame-btn-secondary !px-3 !py-1.5 text-xs" disabled={downloadDisabled} onClick={onDownload} type="button">
            Download
          </button>
        ) : null}
        {compareHref ? (
          <Link
            className="frame-btn-secondary !px-3 !py-1.5 text-xs"
            href={compareHref}
            title="Compare two versions side by side with synced playback"
          >
            Side by side
          </Link>
        ) : null}
        <button className="frame-btn-primary !px-4 !py-1.5 text-xs" onClick={onShare} type="button">
          Share for review
        </button>
        {presenterHref ? (
          <Link className="frame-btn-secondary !px-3 !py-1.5 text-xs" href={presenterHref}>
            Present
          </Link>
        ) : null}
        {exitPresenterHref ? (
          <Link className="frame-btn-secondary !px-3 !py-1.5 text-xs" href={exitPresenterHref}>
            Exit present
          </Link>
        ) : null}
      </div>
    </header>
  );
}

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
    <header className="shrink-0 border-b border-frame-border bg-frame-panel">
      <div className="flex h-10 items-center justify-between px-2 sm:h-12 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-4">
          <Link className="shrink-0 text-xs text-frame-muted hover:text-frame-text sm:text-sm" href={backHref}>
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xs font-semibold text-frame-text sm:text-sm">{assetName}</h1>
            <p className="hidden truncate text-xs text-frame-muted sm:block">
              {projectName} · v{versionNumber} · {versionStatus}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <label className="sr-only" htmlFor="review-status">
            Review status
          </label>
          <select
            className="rounded-md border border-frame-border bg-frame-panel-elevated px-1.5 py-1 text-[11px] font-medium text-frame-text sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
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
          <span className="hidden rounded-full border border-frame-border px-2 py-1 text-[10px] uppercase tracking-wide text-frame-muted lg:inline">
            {approvalLabel(approvalStatus)}
          </span>
          {onDownload ? (
            <button className="hidden frame-btn-secondary !px-3 !py-1.5 text-xs sm:inline-flex" disabled={downloadDisabled} onClick={onDownload} type="button">
              Download
            </button>
          ) : null}
          {compareHref ? (
            <Link
              className="hidden frame-btn-secondary !px-3 !py-1.5 text-xs lg:inline-flex"
              href={compareHref}
              title="Compare two versions side by side with synced playback"
            >
              Side by side
            </Link>
          ) : null}
          <button className="frame-btn-primary !min-h-0 !px-2 !py-1 text-[11px] sm:!px-4 sm:!py-1.5 sm:text-xs" onClick={onShare} type="button">
            <span className="hidden sm:inline">Share for review</span>
            <span className="sm:hidden">Share</span>
          </button>
          {presenterHref ? (
            <Link className="hidden frame-btn-secondary !px-3 !py-1.5 text-xs md:inline-flex" href={presenterHref}>
              Present
            </Link>
          ) : null}
          {exitPresenterHref ? (
            <Link className="frame-btn-secondary !min-h-0 !px-2 !py-1 text-[11px] sm:!px-3 sm:!py-1.5 sm:text-xs" href={exitPresenterHref}>
              Exit
            </Link>
          ) : null}
        </div>
      </div>
      {/* Overflow row for mobile-hidden actions */}
      <div className="flex items-center gap-1 overflow-x-auto border-t border-frame-border px-2 py-1 sm:hidden">
        <span className="shrink-0 text-[10px] text-frame-muted">v{versionNumber} · {versionStatus}</span>
        {onDownload ? (
          <button className="frame-btn-secondary shrink-0 !min-h-0 !px-2 !py-0.5 text-[10px]" disabled={downloadDisabled} onClick={onDownload} type="button">
            Download
          </button>
        ) : null}
        {compareHref ? (
          <Link className="frame-btn-secondary shrink-0 !min-h-0 !px-2 !py-0.5 text-[10px]" href={compareHref}>
            Compare
          </Link>
        ) : null}
        {presenterHref ? (
          <Link className="frame-btn-secondary shrink-0 !min-h-0 !px-2 !py-0.5 text-[10px]" href={presenterHref}>
            Present
          </Link>
        ) : null}
      </div>
    </header>
  );
}

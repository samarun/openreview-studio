"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildMediaProxyUrl } from "../../lib/media";
import { approvalLabel } from "../../lib/approval-ui";
import type { ApprovalStatus, Asset, Folder } from "../../lib/types";

type AssetGridCardProps = {
  asset: Asset;
  token: string;
  approvalStatus?: ApprovalStatus;
  folders?: Folder[];
  onShare?: () => void;
  onArchive?: () => void;
  onMoveToFolder?: (folderId: string | null) => void;
};

export function AssetGridCard({
  asset,
  token,
  approvalStatus = "PENDING",
  folders = [],
  onShare,
  onArchive,
  onMoveToFolder
}: AssetGridCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const latestVersion = [...asset.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const reviewHref = latestVersion ? `/review/${latestVersion.id}` : `/assets/${asset.id}`;
  const thumbKey = latestVersion?.thumbnailKey;
  const poster = thumbKey
    ? buildMediaProxyUrl(thumbKey, `token=${encodeURIComponent(token)}`)
    : undefined;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <article className="group relative overflow-hidden rounded-xl border border-frame-border bg-frame-panel transition hover:border-frame-accent/40 hover:shadow-frame">
      <Link className="block" href={reviewHref}>
        <div className="relative aspect-video bg-frame-panel-elevated">
          {poster ? (
            <img alt="" className="h-full w-full object-cover" src={poster} />
          ) : (
            <div className="flex h-full items-center justify-center text-frame-muted">
              <span className="text-4xl opacity-40">▶</span>
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-md border border-frame-border bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            {latestVersion ? `v${latestVersion.versionNumber}` : "No version"}
          </span>
        </div>
        <div className="p-2.5 sm:p-3">
          <h4 className="truncate text-sm font-medium text-frame-text sm:text-base">{asset.name}</h4>
          <p className="mt-0.5 text-[11px] text-frame-muted sm:mt-1 sm:text-xs">
            {asset.versions.length} version{asset.versions.length === 1 ? "" : "s"}
            {latestVersion ? ` · ${latestVersion.status}` : ""}
          </p>
          <span
            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              approvalStatus === "APPROVED"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : approvalStatus === "CHANGES_REQUESTED"
                  ? "border-frame-accent/30 bg-frame-accent/10 text-indigo-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`}
          >
            {approvalLabel(approvalStatus)}
          </span>
        </div>
      </Link>

      <div className="absolute right-2 top-2" ref={menuRef}>
        <button
          aria-label="Asset actions"
          className="rounded-lg border border-frame-border bg-black/70 px-2 py-1 text-sm text-white opacity-0 transition group-hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            setMenuOpen((value) => !value);
          }}
          type="button"
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="absolute right-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-frame-border bg-frame-panel-elevated py-1 shadow-frame">
            <Link className="block px-3 py-2 text-sm text-frame-text hover:bg-white/5" href={reviewHref} onClick={() => setMenuOpen(false)}>
              Open review
            </Link>
            <Link className="block px-3 py-2 text-sm text-frame-text hover:bg-white/5" href={`/assets/${asset.id}`} onClick={() => setMenuOpen(false)}>
              Asset details
            </Link>
            {onMoveToFolder && folders.length > 0 ? (
              <label className="block px-3 py-2 text-sm text-frame-muted">
                Move to folder
                <select
                  className="frame-input mt-1 w-full text-sm text-frame-text"
                  onChange={(event) => {
                    const value = event.target.value;
                    setMenuOpen(false);
                    onMoveToFolder(value ? value : null);
                  }}
                  value={asset.folderId ?? ""}
                >
                  <option value="">Uncategorized</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {onShare ? (
              <button className="block w-full px-3 py-2 text-left text-sm text-frame-text hover:bg-white/5" onClick={() => { setMenuOpen(false); onShare(); }} type="button">
                Create share link
              </button>
            ) : null}
            {onArchive ? (
              <button className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/5" onClick={() => { setMenuOpen(false); onArchive(); }} type="button">
                Archive
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

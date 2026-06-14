"use client";

import type { ReviewShareLink } from "../../lib/types";

type ShareLinkPanelProps = {
  open: boolean;
  onClose: () => void;
  sharePassword: string;
  shareExpiresAt: string;
  shareInviteEmail: string;
  shareUrl: string;
  shareLinks: ReviewShareLink[];
  loading: boolean;
  onPasswordChange: (value: string) => void;
  onExpiresChange: (value: string) => void;
  onInviteChange: (value: string) => void;
  onCreate: () => void;
  onRevoke: (shareLinkId: string) => void;
  onRestore?: (shareLinkId: string) => void;
};

export function ShareLinkPanel({
  open,
  onClose,
  sharePassword,
  shareExpiresAt,
  shareInviteEmail,
  shareUrl,
  shareLinks,
  loading,
  onPasswordChange,
  onExpiresChange,
  onInviteChange,
  onCreate,
  onRevoke,
  onRestore
}: ShareLinkPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-frame-border bg-frame-panel p-4 shadow-frame sm:max-h-[90vh] sm:rounded-xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <h3 className="text-base font-semibold sm:text-lg">Share for review</h3>
          <button className="text-frame-muted hover:text-frame-text" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-frame-muted sm:mb-4 sm:text-sm">
          Guests can view, comment, and draw on the video.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-frame-muted">
            Password (optional)
            <input className="frame-input mt-1" minLength={8} onChange={(event) => onPasswordChange(event.target.value)} type="password" value={sharePassword} />
          </label>
          <label className="block text-xs text-frame-muted">
            Expires (optional)
            <input className="frame-input mt-1" onChange={(event) => onExpiresChange(event.target.value)} type="datetime-local" value={shareExpiresAt} />
          </label>
          <label className="block text-xs text-frame-muted sm:col-span-2">
            Invite email (optional)
            <input className="frame-input mt-1" onChange={(event) => onInviteChange(event.target.value)} type="email" value={shareInviteEmail} />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="frame-btn-primary flex-1" disabled={loading} onClick={onCreate} type="button">
            Create link
          </button>
        </div>
        {shareUrl ? (
          <div className="mt-3 flex gap-2">
            <input className="frame-input flex-1 text-frame-accent" readOnly value={shareUrl} />
            <button
              className="frame-btn-secondary shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl);
              }}
              type="button"
            >
              Copy link
            </button>
          </div>
        ) : null}
        <div className="mt-4 space-y-2">
          {shareLinks.length === 0 ? <p className="text-xs text-frame-muted">No links yet.</p> : null}
          {shareLinks.map((link) => (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-frame-border bg-frame-panel-elevated p-3" key={link.id}>
              <div className="min-w-0">
                <p className="truncate text-xs text-frame-text">
                  {typeof window === "undefined" ? `/share/${link.token}` : `${window.location.origin}/share/${link.token}`}
                </p>
                <p className="mt-1 text-[10px] text-frame-muted">
                  {link.passwordProtected ? "Password" : "Open"} · {link.revoked ? "Revoked" : link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleString()}` : "No expiry"}
                </p>
              </div>
              {link.revoked ? (
                onRestore ? (
                  <button className="text-xs text-emerald-300 hover:underline disabled:opacity-40" disabled={loading} onClick={() => onRestore(link.id)} type="button">
                    Restore
                  </button>
                ) : null
              ) : (
                <button className="text-xs text-rose-300 hover:underline disabled:opacity-40" disabled={loading} onClick={() => onRevoke(link.id)} type="button">
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { drawAnnotation } from "../lib/annotations";
import { isTimeWithinAnnotationRange, mergeAnnotationEnd } from "../lib/annotation-visibility";
import { apiRequest, formatTimestamp } from "../lib/api";
import { approvalLabel, rollupApprovalStatus } from "../lib/approval-ui";
import { useReviewEvents } from "../lib/use-review-events";
import type { ReviewComment, ShareLink } from "../lib/types";
import { CommentList } from "./review-core/comment-list";
import { TimelineMarkers } from "./review-core/timeline-markers";
import { useAnnotationDrawing } from "./review-core/use-annotation-drawing";
import { ReviewToolbar } from "./frame/review-toolbar";
import { ReviewPlayer, type ReviewPlayerHandle } from "./review-player";

const GUEST_STORAGE_KEY = "openreview.guest";

function loadGuestProfile() {
  if (typeof window === "undefined") return { name: "", email: "" };
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return { name: "", email: "" };
    return JSON.parse(raw) as { name: string; email: string };
  } catch {
    return { name: "", email: "" };
  }
}

function saveGuestProfile(name: string, email: string) {
  localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ name, email }));
}

export function PublicShareReview({ token }: { token: string }) {
  const [share, setShare] = useState<ShareLink | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [timeSeconds, setTimeSeconds] = useState("0");
  const [approvalNote, setApprovalNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [pinnedCommentId, setPinnedCommentId] = useState<string | null>(null);
  const [annotationRangeEnd, setAnnotationRangeEnd] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<ReviewPlayerHandle | null>(null);

  const drawing = useAnnotationDrawing();

  function accessQuery(nextAccessToken = accessToken) {
    return nextAccessToken ? `?accessToken=${encodeURIComponent(nextAccessToken)}` : "";
  }

  async function loadShare(nextAccessToken = accessToken) {
    setShare(await apiRequest<ShareLink>(`/share/${token}${accessQuery(nextAccessToken)}`));
  }

  async function requestAccess(password?: string) {
    const result = await apiRequest<{ accessToken: string; requiresPassword: boolean }>(`/share/${token}/access`, {
      method: "POST",
      body: JSON.stringify({ password })
    });

    setAccessToken(result.accessToken);
    setPasswordRequired(false);
    await loadShare(result.accessToken);
  }

  useEffect(() => {
    const guest = loadGuestProfile();
    setName(guest.name);
    setEmail(guest.email);

    requestAccess().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : "Unable to load share link.";

      if (
        errorMessage.includes("Invalid share password") ||
        errorMessage.includes("Share password required") ||
        errorMessage.includes("403")
      ) {
        setPasswordRequired(true);
        setMessage("Enter the share password to continue.");
        return;
      }

      setMessage(errorMessage);
    });
  }, [token]);

  useReviewEvents(
    share && !passwordRequired ? `/share/${token}/events?accessToken=${encodeURIComponent(accessToken)}` : null,
    (event) => {
      if (event.type === "comment.created" || event.type === "comment.resolved") {
        const comment = event.payload as ReviewComment;
        setShare((current) => {
          if (!current || current.assetVersion.id !== event.assetVersionId) return current;
          const existing = current.assetVersion.comments;
          if (event.type === "comment.created") {
            if (existing.some((item) => item.id === comment.id)) return current;
            return {
              ...current,
              assetVersion: {
                ...current.assetVersion,
                comments: [...existing, comment]
              }
            };
          }

          return {
            ...current,
            assetVersion: {
              ...current.assetVersion,
              comments: existing.map((item) => (item.id === comment.id ? { ...item, ...comment } : item))
            }
          };
        });
        return;
      }

      if (event.type === "reply.created" || event.type === "approval.updated") {
        void loadShare();
      }
    },
    Boolean(share && !passwordRequired && accessToken)
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const redraw = () => drawAnnotation(canvas, drawing.activeAnnotation, drawing.draftPaths, drawing.draftShapes);
    redraw();

    const container = videoContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(redraw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [drawing.activeAnnotation, drawing.draftPaths, drawing.draftShapes]);

  useEffect(() => {
    if (!pinnedCommentId || !share) return;
    const comment = share.assetVersion.comments.find((item) => item.id === pinnedCommentId);
    if (!comment?.annotationJson) {
      setPinnedCommentId(null);
      drawing.setActiveAnnotation(null);
      return;
    }
    if (!isTimeWithinAnnotationRange(currentTime, comment)) {
      setPinnedCommentId(null);
      drawing.setActiveAnnotation(null);
    }
  }, [currentTime, pinnedCommentId, share]);

  function toggleAnnotationComment(comment: ReviewComment) {
    if (!comment.annotationJson) return;
    if (pinnedCommentId === comment.id) {
      setPinnedCommentId(null);
      drawing.setActiveAnnotation(null);
      return;
    }
    setPinnedCommentId(comment.id);
    drawing.setActiveAnnotation(comment.annotationJson);
    drawing.resetDrafts();
    jumpToTime(comment.timeSeconds);
  }

  function jumpToTime(seconds: number) {
    const video = videoContainerRef.current?.querySelector<HTMLVideoElement>("[data-review-player] video");
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => undefined);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await requestAccess(sharePassword);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to unlock share link.");
    } finally {
      setLoading(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const seconds = Number(timeSeconds);

    if (!Number.isFinite(seconds) || seconds < 0) {
      setMessage("Enter a valid timestamp.");
      return;
    }

    if (!name.trim()) {
      setMessage("Enter your name before commenting.");
      return;
    }

    setLoading(true);
    setMessage("");
    saveGuestProfile(name.trim(), email.trim());

    try {
      await apiRequest(`/share/${token}/comments${accessQuery()}`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          body,
          timeSeconds: seconds,
          annotationJson: mergeAnnotationEnd(drawing.annotationPayload ?? null, annotationRangeEnd) ?? undefined
        })
      });
      setBody("");
      drawing.resetDrafts();
      drawing.clearOverlay();
      setPinnedCommentId(null);
      setAnnotationRangeEnd(null);
      await loadShare();
      setMessage("Comment added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add comment.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReply(commentId: string) {
    const replyBody = replyBodies[commentId]?.trim();
    if (!replyBody || !name.trim()) {
      setMessage("Enter your name and reply text.");
      return;
    }

    setLoading(true);
    setMessage("");
    saveGuestProfile(name.trim(), email.trim());

    try {
      await apiRequest(`/share/${token}/comments/${commentId}/replies${accessQuery()}`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, body: replyBody })
      });
      setReplyBodies((current) => ({ ...current, [commentId]: "" }));
      await loadShare();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add reply.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleGuestResolve(comment: ReviewComment) {
    setLoading(true);
    setMessage("");

    try {
      const resolved = !comment.resolvedAt;
      const updated = await apiRequest<ReviewComment>(`/share/${token}/comments/${comment.id}/resolve${accessQuery()}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved })
      });
      setShare((current) => {
        if (!current) return current;
        return {
          ...current,
          assetVersion: {
            ...current.assetVersion,
            comments: current.assetVersion.comments.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
          }
        };
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update comment.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadProxy() {
    setLoading(true);
    setMessage("");

    try {
      const result = await apiRequest<{ downloadUrl: string }>(`/share/${token}/download${accessQuery()}`, {}, "");
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download unavailable until approved.");
    } finally {
      setLoading(false);
    }
  }

  async function submitApproval(status: "APPROVED" | "CHANGES_REQUESTED") {
    if (!name.trim()) {
      setMessage("Enter your name before submitting a decision.");
      return;
    }

    setLoading(true);
    setMessage("");
    saveGuestProfile(name.trim(), email.trim());

    try {
      await apiRequest(`/share/${token}/approval${accessQuery()}`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, status, note: approvalNote || undefined })
      });
      await loadShare();
      setMessage(status === "APPROVED" ? "Review approved." : "Changes requested.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit decision.");
    } finally {
      setLoading(false);
    }
  }

  if (passwordRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-frame-bg px-4 text-frame-text sm:px-5">
        <form className="w-full max-w-md frame-panel p-4 sm:p-6" onSubmit={submitPassword}>
          <h1 className="text-xl font-semibold sm:text-2xl">Protected review link</h1>
          <p className="mt-1.5 text-xs text-frame-muted sm:mt-2 sm:text-sm">Enter the password provided by the review owner.</p>
          <input className="frame-input mt-5" type="password" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} />
          <button className="frame-btn-primary mt-4 w-full" disabled={loading || !sharePassword} type="submit">
            Unlock review
          </button>
          {message ? <p className="mt-4 text-sm text-amber-200">{message}</p> : null}
        </form>
      </main>
    );
  }

  if (!share) {
    return <main className="flex min-h-screen items-center justify-center bg-frame-bg text-frame-muted">{message || "Loading review..."}</main>;
  }

  const version = share.assetVersion;
  const asset = version.asset;
  const comments = version.comments;
  const reviewStatus = rollupApprovalStatus(version.approvals ?? []);
  const sharePageUrl = typeof window !== "undefined" ? window.location.href : `/share/${token}`;

  return (
    <main className="flex min-h-screen flex-col bg-frame-bg text-frame-text">
      <header
        className="shrink-0 border-b border-frame-border bg-frame-panel"
        style={share.project.organization.brandColor ? { borderBottomColor: share.project.organization.brandColor } : undefined}
      >
        <div className="flex h-10 items-center px-2 sm:h-14 sm:px-4">
          {share.project.organization.logoUrl ? (
            <img alt="" className="mr-2 h-6 shrink-0 object-contain sm:mr-3 sm:h-8" src={share.project.organization.logoUrl} />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xs font-semibold sm:text-sm">{asset.name}</h1>
            <p className="hidden truncate text-xs text-frame-muted sm:block">
              {share.project.organization.name} · {share.project.name} · v{version.versionNumber}
            </p>
          </div>
          <span className="mr-2 hidden rounded-full border border-frame-border bg-frame-panel-elevated px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-frame-muted sm:inline">
            {approvalLabel(reviewStatus)}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="frame-btn-secondary !min-h-0 !px-2 !py-1 text-[11px] sm:!px-3 sm:!py-1.5 sm:text-xs"
              onClick={() => void navigator.clipboard.writeText(sharePageUrl)}
              type="button"
            >
              <span className="hidden sm:inline">Copy link</span>
              <span className="sm:hidden">Copy</span>
            </button>
            {reviewStatus === "APPROVED" ? (
              <button className="frame-btn-primary !min-h-0 !px-2 !py-1 text-[11px] sm:!px-3 sm:!py-1.5 sm:text-xs" disabled={loading} onClick={() => void downloadProxy()} type="button">
                Download
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {message ? (
        <p className="border-b border-frame-accent/20 bg-frame-accent/10 px-4 py-2 text-center text-sm text-indigo-100">{message}</p>
      ) : null}

      <div className="frame-review-layout">
          <section className="flex min-w-0 flex-1 flex-col bg-black">
            <div className="relative flex aspect-video min-h-0 overflow-hidden md:aspect-auto md:flex-1" ref={videoContainerRef}>
              <ReviewPlayer
                authQuery={accessQuery().replace(/^\?/, "")}
                mediaBasePath={`/media/share/${token}/proxies`}
                onTimeUpdate={setCurrentTime}
                ref={playerRef}
                version={version}
              />
              {(drawing.annotationMode || drawing.activeAnnotation || drawing.draftPaths.length > 0 || drawing.draftShapes.length > 0) ? (
                <canvas
                  className={`absolute inset-0 z-10 h-full w-full ${drawing.annotationMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
                  onPointerDown={drawing.startAnnotationPath}
                  onPointerLeave={(event) => drawing.finishAnnotationPath(event)}
                  onPointerMove={drawing.extendAnnotationPath}
                  onPointerUp={(event) => drawing.finishAnnotationPath(event)}
                  ref={canvasRef}
                />
              ) : null}
            </div>
            <ReviewToolbar
              annotationMode={drawing.annotationMode}
              annotationTool={drawing.annotationTool}
              onClearOverlay={() => {
                drawing.clearOverlay();
                setPinnedCommentId(null);
              }}
              onMarkRangeEnd={() => {
                const start = Number(timeSeconds);
                setAnnotationRangeEnd(Number.isFinite(start) ? Math.max(currentTime, start) : currentTime);
              }}
              onMarkRangeStart={() => {
                setTimeSeconds(currentTime.toFixed(2));
                if (annotationRangeEnd != null && annotationRangeEnd < currentTime) {
                  setAnnotationRangeEnd(null);
                }
              }}
              rangeEndLabel={annotationRangeEnd != null ? formatTimestamp(annotationRangeEnd) : undefined}
              rangeStartLabel={formatTimestamp(Number(timeSeconds) || 0)}
              onNextFrame={() => {
                const player = playerRef.current;
                if (!player) return;
                player.setCurrentTime(player.getCurrentTime() + 1 / player.getFrameRate());
              }}
              onPrevFrame={() => {
                const player = playerRef.current;
                if (!player) return;
                player.setCurrentTime(Math.max(0, player.getCurrentTime() - 1 / player.getFrameRate()));
              }}
              onToggleDraw={() => drawing.setAnnotationMode((value) => !value)}
              onToolChange={drawing.setAnnotationTool}
              onUseCurrentTime={() => setTimeSeconds(currentTime.toFixed(2))}
            />
            <TimelineMarkers comments={comments} durationSeconds={version.durationSeconds} onJump={jumpToTime} />
          </section>

          <aside className="frame-review-sidebar overflow-y-auto">
            <div className="border-b border-frame-border p-3 sm:p-4">
              <h2 className="text-xs font-semibold sm:text-sm">Review decision</h2>
              <p className="mt-0.5 text-[11px] text-frame-muted sm:mt-1 sm:text-xs">Approve or request changes</p>
              <textarea
                className="frame-input mt-2 min-h-12 text-xs sm:mt-3 sm:min-h-16 sm:text-sm"
                placeholder="Decision note optional"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
              />
              <div className="mt-2 flex gap-1.5 sm:mt-3 sm:gap-2">
                <button
                  className="flex-1 rounded-lg border border-amber-300/30 px-2 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-300/10 disabled:opacity-60 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                  disabled={loading || !name.trim()}
                  onClick={() => submitApproval("CHANGES_REQUESTED")}
                  type="button"
                >
                  <span className="hidden sm:inline">Request changes</span>
                  <span className="sm:hidden">Changes</span>
                </button>
                <button
                  className="flex-1 rounded-lg bg-emerald-300 px-2 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-200 disabled:opacity-60 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                  disabled={loading || !name.trim()}
                  onClick={() => submitApproval("APPROVED")}
                  type="button"
                >
                  Approve
                </button>
              </div>
            </div>

            <h2 className="px-3 pt-3 text-base font-semibold sm:px-4 sm:pt-4 sm:text-xl">Add feedback</h2>
            <form className="mt-2 space-y-2 px-3 sm:mt-4 sm:space-y-3 sm:px-4" onSubmit={submitComment}>
              <label className="block text-xs text-slate-300 sm:text-sm">
                Name
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-cyan-300 focus:ring-2 sm:mt-2 sm:rounded-xl sm:px-4 sm:py-3"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-300 sm:text-sm">
                Email optional
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-cyan-300 focus:ring-2 sm:mt-2 sm:rounded-xl sm:px-4 sm:py-3"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-300 sm:text-sm">
                Time seconds
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-cyan-300 focus:ring-2 sm:mt-2 sm:rounded-xl sm:px-4 sm:py-3"
                  min="0"
                  step="0.01"
                  type="number"
                  value={timeSeconds}
                  onChange={(event) => setTimeSeconds(event.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-300 sm:text-sm">
                Comment
                <textarea
                  className="mt-1 min-h-16 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-cyan-300 focus:ring-2 sm:mt-2 sm:min-h-24 sm:rounded-xl sm:px-4 sm:py-3"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <button
                className="w-full rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60 sm:rounded-xl sm:px-4 sm:py-3"
                disabled={loading || !name.trim() || !body.trim()}
                type="submit"
              >
                Add comment
              </button>
            </form>

            <div className="mt-6 px-3 pb-4 sm:px-4">
              <CommentList
                activeAnnotationCommentId={pinnedCommentId}
                canReply
                canResolve
                comments={comments}
                loading={loading}
                onJumpToTime={jumpToTime}
                onToggleResolved={(comment) => void toggleGuestResolve(comment)}
                onReplyBodyChange={(commentId, value) => setReplyBodies((current) => ({ ...current, [commentId]: value }))}
                onShowAnnotation={toggleAnnotationComment}
                onSubmitReply={submitReply}
                replyBodies={replyBodies}
              />
            </div>
          </aside>
        </div>
    </main>
  );
}

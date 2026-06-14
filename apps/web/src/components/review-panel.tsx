"use client";

import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { apiRequest, formatTimestamp } from "../lib/api";
import { isTimeWithinAnnotationRange, mergeAnnotationEnd } from "../lib/annotation-visibility";
import { commentAuthor } from "../lib/comment-utils";
import { drawAnnotation } from "../lib/draw-annotation";
import { useReviewEvents } from "../lib/use-review-events";
import { ReviewTopBar } from "./frame/review-top-bar";
import { ReviewScrubber } from "./review-core/review-scrubber";
import { ReviewToolbar } from "./frame/review-toolbar";
import { ShareLinkPanel } from "./frame/share-link-panel";
import { ReviewPlayer, type ReviewPlayerHandle } from "./review-player";
import type { AnnotationData, AnnotationPath, AnnotationPoint, AnnotationShape, Approval, ApprovalStatus, Asset, AssetVersion, Project, ReviewComment, ReviewShareLink } from "../lib/types";

const annotationColor = "#7c6cf0";
type AnnotationTool = "freehand" | "rectangle" | "circle" | "arrow" | "text";

export function ReviewPanel({
  assetVersionId,
  token,
  presenterMode = false
}: {
  assetVersionId: string;
  token: string;
  presenterMode?: boolean;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [version, setVersion] = useState<AssetVersion | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [shareLinks, setShareLinks] = useState<ReviewShareLink[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentTimeSeconds, setCommentTimeSeconds] = useState("0");
  const [approvalNote, setApprovalNote] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [shareInviteEmail, setShareInviteEmail] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [draftPaths, setDraftPaths] = useState<AnnotationPath[]>([]);
  const [draftShapes, setDraftShapes] = useState<AnnotationShape[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationData | null>(null);
  const [pinnedCommentId, setPinnedCommentId] = useState<string | null>(null);
  const [annotationRangeEnd, setAnnotationRangeEnd] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [shapeStart, setShapeStart] = useState<AnnotationPoint | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("freehand");
  const [message, setMessage] = useState("");
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<ReviewPlayerHandle | null>(null);

  async function loadComments() {
    setComments(await apiRequest<ReviewComment[]>(`/review/${assetVersionId}/comments`, {}, token));
  }

  async function loadApproval() {
    const nextApproval = await apiRequest<Approval | null>(`/review/${assetVersionId}/approval`, {}, token);
    setApproval(nextApproval);
    setApprovalNote(nextApproval?.note ?? "");
  }

  async function loadShareLinks() {
    setShareLinks(await apiRequest<ReviewShareLink[]>(`/review/${assetVersionId}/share-links`, {}, token));
  }

  async function loadReviewContext() {
    const [versionDetail, projects] = await Promise.all([
      apiRequest<AssetVersion & { asset: Asset & { project: Project } }>(`/versions/${assetVersionId}`, {}, token),
      apiRequest<Project[]>("/projects", {}, token)
    ]);

    const nextAsset = projects.flatMap((item) => item.assets).find((item) => item.id === versionDetail.asset.id)
      ?? { ...versionDetail.asset, versions: [versionDetail] };

    try {
      const fullAsset = await apiRequest<Asset>(`/assets/${versionDetail.asset.id}`, {}, token);
      setAsset(fullAsset);
    } catch {
      setAsset(nextAsset);
    }

    const nextProject = projects.find((item) => item.id === versionDetail.asset.project.id) ?? versionDetail.asset.project;

    setProject(nextProject);
    setVersion(versionDetail);
  }

  async function refreshVersionStatus() {
    const status = await apiRequest<AssetVersion>(`/versions/${assetVersionId}/status`, {}, token);
    setVersion((current) => (current ? { ...current, ...status } : status));
  }

  useEffect(() => {
    loadReviewContext()
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load review."));

    loadComments().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load comments."));
    loadApproval().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load approval."));
    loadShareLinks().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load share links."));
  }, [assetVersionId, token]);

  useReviewEvents(`/review/${assetVersionId}/events`, (event) => {
    if (event.type === "comment.created" || event.type === "comment.resolved" || event.type === "reply.created") {
      void loadComments();
    }

    if (event.type === "approval.updated") {
      void loadApproval();
    }

    if (event.type === "version.status") {
      void refreshVersionStatus();
    }
  }, true, token);

  useEffect(() => {
    if (canvasRef.current) {
      drawAnnotation(canvasRef.current, activeAnnotation ? { ...activeAnnotation, shapes: [...(activeAnnotation.shapes ?? []), ...draftShapes] } : { type: "annotation", paths: [], shapes: draftShapes }, draftPaths);
    }
  }, [activeAnnotation, draftPaths, draftShapes]);

  useEffect(() => {
    if (!pinnedCommentId) return;
    const comment = comments.find((item) => item.id === pinnedCommentId);
    if (!comment?.annotationJson) {
      setPinnedCommentId(null);
      setActiveAnnotation(null);
      return;
    }
    if (!isTimeWithinAnnotationRange(currentTime, comment)) {
      setPinnedCommentId(null);
      setActiveAnnotation(null);
    }
  }, [comments, currentTime, pinnedCommentId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const player = playerRef.current;
      if (!player || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      const frameStep = 1 / player.getFrameRate();
      const seekStep = event.shiftKey ? frameStep : 5;
      const current = player.getCurrentTime();
      const duration = version?.durationSeconds ?? Infinity;

      if (event.key === " ") {
        event.preventDefault();
        const video = player.getVideoElement();
        if (video) {
          if (video.paused) void video.play();
          else video.pause();
        }
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const next = Math.max(0, current - seekStep);
        player.setCurrentTime(next);
        setCurrentTime(next);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = Math.min(duration, current + seekStep);
        player.setCurrentTime(next);
        setCurrentTime(next);
      }
      if (event.key.toLowerCase() === "m") setCommentTimeSeconds(current.toFixed(2));
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [version?.frameRate, version?.durationSeconds]);

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  function startAnnotationPath(event: PointerEvent<HTMLCanvasElement>) {
    if (!annotationMode) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing(true);
    setActiveAnnotation(null);
    const point = pointFromEvent(event);

    if (annotationTool === "freehand") {
      setDraftPaths((paths) => [...paths, { kind: "freehand", color: annotationColor, points: [point] }]);
      return;
    }

    setShapeStart(point);
  }

  function extendAnnotationPath(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing || !annotationMode) {
      return;
    }

    if (annotationTool === "freehand") {
      const point = pointFromEvent(event);
      setDraftPaths((paths) => paths.map((path, index) => index === paths.length - 1 ? { ...path, points: [...path.points, point] } : path));
    }
  }

  function finishAnnotationPath(event?: PointerEvent<HTMLCanvasElement>) {
    if (drawing && annotationTool !== "freehand" && shapeStart && event) {
      const end = pointFromEvent(event);
      const text = annotationTool === "text" ? window.prompt("Annotation text")?.trim() : undefined;

      if (annotationTool !== "text" || text) {
        setDraftShapes((shapes) => [...shapes, { kind: annotationTool as Exclude<AnnotationTool, "freehand">, color: annotationColor, start: shapeStart, end, text }]);
      }
    }

    setDrawing(false);
    setShapeStart(null);
  }

  function useCurrentVideoTime() {
    const current = playerRef.current?.getCurrentTime();
    if (current !== undefined) {
      setCommentTimeSeconds(current.toFixed(2));
    }
  }

  function seekToTime(seconds: number) {
    playerRef.current?.setCurrentTime(seconds);
    setCurrentTime(seconds);
  }

  function jumpToTime(seconds: number) {
    seekToTime(seconds);
    const video = playerRef.current?.getVideoElement();
    if (video) void video.play().catch(() => undefined);
  }

  function toggleAnnotationComment(comment: ReviewComment) {
    if (!comment.annotationJson) return;

    if (pinnedCommentId === comment.id) {
      setPinnedCommentId(null);
      setActiveAnnotation(null);
      return;
    }

    setPinnedCommentId(comment.id);
    setActiveAnnotation(comment.annotationJson);
    setDraftPaths([]);
    setDraftShapes([]);
    seekToTime(comment.timeSeconds);
  }

  function clearAnnotationOverlay() {
    setDraftPaths([]);
    setDraftShapes([]);
    setActiveAnnotation(null);
    setPinnedCommentId(null);
  }

  function markAnnotationRangeStart() {
    const current = playerRef.current?.getCurrentTime();
    if (current === undefined) return;
    setCommentTimeSeconds(current.toFixed(2));
    if (annotationRangeEnd != null && annotationRangeEnd < current) {
      setAnnotationRangeEnd(null);
    }
  }

  function markAnnotationRangeEnd() {
    const current = playerRef.current?.getCurrentTime();
    if (current === undefined) return;
    const start = Number(commentTimeSeconds);
    setAnnotationRangeEnd(Number.isFinite(start) ? Math.max(current, start) : current);
  }

  async function handleCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timeSeconds = Number(commentTimeSeconds);

    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
      setMessage("Enter a valid timestamp in seconds.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await apiRequest<ReviewComment>(`/review/${assetVersionId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body: commentBody,
          timeSeconds,
          annotationJson:
            draftPaths.length > 0 || draftShapes.length > 0
              ? mergeAnnotationEnd({ type: "annotation", paths: draftPaths, shapes: draftShapes }, annotationRangeEnd)
              : undefined
        })
      }, token);
      setCommentBody("");
      setDraftPaths([]);
      setDraftShapes([]);
      setActiveAnnotation(null);
      setPinnedCommentId(null);
      setAnnotationRangeEnd(null);
      await loadComments();
      setMessage("Comment added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add comment.");
    } finally {
      setLoading(false);
    }
  }

  async function submitApproval(status: ApprovalStatus) {
    setLoading(true);
    setMessage("");

    try {
      const nextApproval = await apiRequest<Approval>(`/review/${assetVersionId}/approval`, {
        method: "POST",
        body: JSON.stringify({ status, note: approvalNote || undefined })
      }, token);
      setApproval(nextApproval);
      setMessage(status === "APPROVED" ? "Version approved." : status === "CHANGES_REQUESTED" ? "Changes requested." : "Approval reset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit approval.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleResolved(comment: ReviewComment) {
    setLoading(true);
    setMessage("");

    try {
      await apiRequest<ReviewComment>(`/comments/${comment.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ resolved: !comment.resolvedAt })
      }, token);
      await loadComments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update comment.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReply(commentId: string) {
    const body = replyBodies[commentId]?.trim();

    if (!body) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await apiRequest(`/comments/${commentId}/replies`, {
        method: "POST",
        body: JSON.stringify({ body })
      }, token);
      setReplyBodies((current) => ({ ...current, [commentId]: "" }));
      await loadComments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add reply.");
    } finally {
      setLoading(false);
    }
  }

  async function createShareLink() {
    setLoading(true);
    setMessage("");

    try {
      const link = await apiRequest<{ token: string }>(`/review/${assetVersionId}/share-links`, {
        method: "POST",
        body: JSON.stringify({
          password: sharePassword || undefined,
          expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : undefined,
          inviteEmail: shareInviteEmail || undefined
        })
      }, token);
      setShareUrl(`${window.location.origin}/share/${link.token}`);
      setSharePassword("");
      setShareInviteEmail("");
      await loadShareLinks();
      setMessage("Share link created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create share link.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeShareLink(shareLinkId: string) {
    if (!confirm("Revoke this share link?")) return;

    setLoading(true);
    setMessage("");

    try {
      await apiRequest(`/share-links/${shareLinkId}/revoke`, {
        method: "PATCH",
        body: JSON.stringify({ revoked: true })
      }, token);
      await loadShareLinks();
      setMessage("Share link revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke share link.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadOriginal() {
    if (!asset || !version) return;

    setLoading(true);
    try {
      const result = await apiRequest<{ downloadUrl: string }>(
        `/assets/${asset.id}/versions/${version.id}/download`,
        {},
        token
      );
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download unavailable.");
    } finally {
      setLoading(false);
    }
  }

  if (!project || !asset || !version) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-frame-bg text-frame-muted">
        Loading review...
      </div>
    );
  }

  const shellClass = presenterMode
    ? "fixed inset-0 z-50 flex flex-col bg-frame-bg text-frame-text"
    : "flex min-h-screen flex-col bg-frame-bg text-frame-text md:h-screen md:overflow-hidden";

  return (
    <div className={shellClass}>
      <ReviewTopBar
        approvalStatus={approval?.status}
        assetName={asset.name}
        backHref={presenterMode ? `/review/${assetVersionId}` : `/assets/${asset.id}`}
        compareHref={
          asset.versions.length >= 2
            ? `/review/compare?left=${[...asset.versions].sort((a, b) => a.versionNumber - b.versionNumber)[0]?.id ?? assetVersionId}&right=${assetVersionId}`
            : undefined
        }
        downloadDisabled={approval?.status !== "APPROVED" || loading}
        exitPresenterHref={presenterMode ? `/review/${assetVersionId}` : undefined}
        onDownload={downloadOriginal}
        onShare={() => {
          setSharePanelOpen(true);
          void loadShareLinks();
        }}
        onStatusChange={(status) => void submitApproval(status)}
        presenterHref={presenterMode ? undefined : `/review/${assetVersionId}?presenter=1`}
        projectName={project.name}
        versionNumber={version.versionNumber}
        versionStatus={version.status}
      />

      {message && !presenterMode ? (
        <p className="border-b border-frame-accent/20 bg-frame-accent/10 px-4 py-2 text-center text-sm text-indigo-100">
          {message}
        </p>
      ) : null}

      <ShareLinkPanel
        loading={loading}
        onClose={() => setSharePanelOpen(false)}
        onCreate={() => void createShareLink()}
        onExpiresChange={setShareExpiresAt}
        onInviteChange={setShareInviteEmail}
        onPasswordChange={setSharePassword}
        onRevoke={(id) => void revokeShareLink(id)}
        open={sharePanelOpen}
        shareExpiresAt={shareExpiresAt}
        shareInviteEmail={shareInviteEmail}
        shareLinks={shareLinks}
        sharePassword={sharePassword}
        shareUrl={shareUrl}
      />

      <div className="frame-review-layout min-h-0 flex-1">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-black">
          {version.proxyKey || version.hlsManifestKey ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative flex aspect-video min-h-0 overflow-hidden bg-black md:aspect-auto md:flex-1">
                <ReviewPlayer
                  authQuery={`token=${encodeURIComponent(token)}`}
                  layout="fill"
                  mediaBasePath="/media/proxies"
                  onTimeUpdate={setCurrentTime}
                  presenterMode={presenterMode}
                  ref={playerRef}
                  version={version}
                />
                {(annotationMode || activeAnnotation || draftPaths.length > 0 || draftShapes.length > 0) ? (
                  <canvas
                    className={`absolute inset-0 z-10 h-full w-full ${annotationMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
                    onPointerDown={startAnnotationPath}
                    onPointerLeave={(event) => finishAnnotationPath(event)}
                    onPointerMove={extendAnnotationPath}
                    onPointerUp={(event) => finishAnnotationPath(event)}
                    ref={canvasRef}
                  />
                ) : null}
              </div>
              <ReviewToolbar
                annotationMode={annotationMode}
                annotationTool={annotationTool}
                onClearOverlay={clearAnnotationOverlay}
                onMarkRangeEnd={markAnnotationRangeEnd}
                onMarkRangeStart={markAnnotationRangeStart}
                rangeEndLabel={annotationRangeEnd != null ? formatTimestamp(annotationRangeEnd) : undefined}
                rangeStartLabel={formatTimestamp(Number(commentTimeSeconds) || 0)}
                onNextFrame={() => {
                  const player = playerRef.current;
                  if (!player) return;
                  const next = player.getCurrentTime() + 1 / player.getFrameRate();
                  player.setCurrentTime(next);
                  setCurrentTime(next);
                }}
                onPrevFrame={() => {
                  const player = playerRef.current;
                  if (!player) return;
                  const next = Math.max(0, player.getCurrentTime() - 1 / player.getFrameRate());
                  player.setCurrentTime(next);
                  setCurrentTime(next);
                }}
                onToggleDraw={() => setAnnotationMode((value) => !value)}
                onToolChange={setAnnotationTool}
                onUseCurrentTime={useCurrentVideoTime}
              />
              <ReviewScrubber
                comments={comments}
                currentTime={currentTime}
                durationSeconds={version.durationSeconds ?? 0}
                onSeek={seekToTime}
              />
            </div>
          ) : (
            <div className="aspect-video rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_center,#1f2a44,#05060a_70%)] p-6">
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Processing</p>
                <h3 className="mt-3 text-2xl font-semibold">Video proxy is not ready yet</h3>
                <p className="mt-2 max-w-lg text-slate-400">Refresh once the worker finishes processing this asset version.</p>
              </div>
            </div>
          )}
        </section>

        {!presenterMode ? (
          <aside className="frame-review-sidebar shrink-0">
            <div className="border-b border-frame-border p-3 sm:p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-frame-muted sm:text-xs">Review status</h3>
              <textarea
                className="frame-input mt-1.5 min-h-12 text-xs sm:mt-2 sm:min-h-14 sm:text-sm"
                placeholder="Decision note (optional)"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
              />
            </div>

            <div className="flex items-center justify-between border-b border-frame-border px-3 py-1.5 sm:px-4 sm:py-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-frame-muted sm:text-xs">Comments</span>
              <button className="text-[11px] text-frame-accent hover:underline sm:text-xs" onClick={() => loadComments()} type="button">
                Refresh
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3 sm:space-y-3 sm:p-4">
              {comments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-frame-border p-4 text-center text-xs text-frame-muted sm:p-6 sm:text-sm">
                  No comments yet. Draw on the frame or add feedback at the current time.
                </p>
              ) : null}
              {comments.map((comment) => (
                <article
                  className={`rounded-lg border p-2.5 sm:p-3 ${comment.resolvedAt ? "border-emerald-500/30 bg-emerald-500/5" : "border-frame-border bg-frame-panel-elevated"}`}
                  key={comment.id}
                >
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                    <button className="frame-time-pill text-[11px] sm:text-xs" onClick={() => jumpToTime(comment.timeSeconds)} type="button">
                      {formatTimestamp(comment.timeSeconds)}
                    </button>
                    <span className="truncate text-[11px] text-frame-muted sm:text-xs">{commentAuthor(comment)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-frame-text sm:mt-2 sm:text-sm">{comment.body}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
                    {comment.annotationJson ? (
                      <button
                        className={`text-[11px] hover:underline sm:text-xs ${pinnedCommentId === comment.id ? "font-semibold text-frame-text" : "text-frame-accent"}`}
                        onClick={() => toggleAnnotationComment(comment)}
                        type="button"
                      >
                        {pinnedCommentId === comment.id ? "Hide drawing" : "Show drawing"}
                      </button>
                    ) : null}
                    <button className="text-[11px] text-frame-muted hover:text-frame-text sm:text-xs" disabled={loading} onClick={() => toggleResolved(comment)} type="button">
                      {comment.resolvedAt ? "Reopen" : "Mark complete"}
                    </button>
                  </div>
                  {comment.replies.length > 0 ? (
                    <div className="mt-2 space-y-1.5 border-l border-frame-border pl-2 sm:mt-3 sm:space-y-2 sm:pl-3">
                      {comment.replies.map((reply) => (
                        <div className="text-[11px] sm:text-xs" key={reply.id}>
                          <p className="text-frame-muted">{reply.author?.name || reply.guestReviewer?.name || "Guest"}</p>
                          <p className="mt-0.5 text-frame-text sm:mt-1">{reply.body}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-1.5 flex gap-1.5 sm:mt-2 sm:gap-2">
                    <input
                      className="frame-input min-w-0 flex-1 !py-1 text-[11px] sm:!py-1.5 sm:text-xs"
                      placeholder="Reply"
                      value={replyBodies[comment.id] ?? ""}
                      onChange={(event) => setReplyBodies((current) => ({ ...current, [comment.id]: event.target.value }))}
                    />
                    <button
                      className="frame-btn-primary !px-2 !py-1 text-[11px] sm:!py-1.5 sm:text-xs"
                      disabled={loading || !(replyBodies[comment.id] ?? "").trim()}
                      onClick={() => submitReply(comment.id)}
                      type="button"
                    >
                      Reply
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <form className="space-y-2 border-t border-frame-border bg-frame-panel-elevated p-3 sm:space-y-3 sm:p-4" onSubmit={handleCreateComment}>
              <div className="flex items-center justify-between text-[11px] text-frame-muted sm:text-xs">
                <span className="frame-time-pill text-[11px] sm:text-xs">@{formatTimestamp(Number(commentTimeSeconds) || 0)}</span>
                <button className="text-frame-accent hover:underline" onClick={useCurrentVideoTime} type="button">
                  Use playhead
                </button>
              </div>
              <textarea
                className="frame-input min-h-16 text-xs sm:min-h-20 sm:text-sm"
                placeholder="Leave a comment at this time…"
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
              />
              <input className="sr-only" min="0" step="0.01" type="number" value={commentTimeSeconds} onChange={(event) => setCommentTimeSeconds(event.target.value)} />
              <button className="frame-btn-primary w-full text-xs sm:text-sm" disabled={loading || !commentBody.trim()} type="submit">
                Add comment
              </button>
            </form>

          </aside>
        ) : null}
      </div>
    </div>
  );
}

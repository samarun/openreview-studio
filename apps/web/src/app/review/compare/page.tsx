"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "../../../components/auth-gate";
import { ReviewScrubber } from "../../../components/review-core/review-scrubber";
import { ReviewPlayer, type ReviewPlayerHandle } from "../../../components/review-player";
import { apiRequest, formatTimestamp } from "../../../lib/api";
import { isTimeWithinAnnotationRange } from "../../../lib/annotation-visibility";
import { commentAuthor } from "../../../lib/comment-utils";
import { clampCompareTime, syncFollowerVideo } from "../../../lib/compare-sync";
import { drawAnnotation } from "../../../lib/draw-annotation";
import type { AnnotationData, Asset, AssetVersion, ReviewComment } from "../../../lib/types";

const LEFT_MARKER_COLOR = "#60a5fa";
const RIGHT_MARKER_COLOR = "#4ade80";
const ACTIVE_TIME_TOLERANCE = 0.5;

function clampToVersion(version: AssetVersion, seconds: number) {
  const max = version.durationSeconds && version.durationSeconds > 0 ? version.durationSeconds : seconds;
  return Math.min(Math.max(0, seconds), max);
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function CompareContent({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const leftId = searchParams.get("left");
  const rightId = searchParams.get("right");
  const [left, setLeft] = useState<AssetVersion | null>(null);
  const [right, setRight] = useState<AssetVersion | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [message, setMessage] = useState("");
  const [scrubberTime, setScrubberTime] = useState(0);
  const [scrubberPlaying, setScrubberPlaying] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const leftRef = useRef<ReviewPlayerHandle | null>(null);
  const rightRef = useRef<ReviewPlayerHandle | null>(null);
  const leftVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightVideoRef = useRef<HTMLVideoElement | null>(null);
  const rightDurationRef = useRef(0);

  const [leftComments, setLeftComments] = useState<ReviewComment[]>([]);
  const [rightComments, setRightComments] = useState<ReviewComment[]>([]);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  const [leftAnnotation, setLeftAnnotation] = useState<AnnotationData | null>(null);
  const [rightAnnotation, setRightAnnotation] = useState<AnnotationData | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!leftId || !rightId) return;

    apiRequest<{ left: AssetVersion; right: AssetVersion; asset: Asset }>(
      `/review/compare?left=${leftId}&right=${rightId}`,
      {},
      token
    )
      .then((result) => {
        setLeft(result.left);
        setRight(result.right);
        setAsset(result.asset);
        rightDurationRef.current = result.right.durationSeconds ?? 0;
        setScrubberTime(0);
        setScrubberPlaying(false);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load comparison."));
  }, [leftId, rightId, token]);

  useEffect(() => {
    if (!leftId) return;
    apiRequest<ReviewComment[]>(`/review/${leftId}/comments`, {}, token)
      .then(setLeftComments)
      .catch(() => setLeftComments([]));
  }, [leftId, token]);

  useEffect(() => {
    if (!rightId) return;
    apiRequest<ReviewComment[]>(`/review/${rightId}/comments`, {}, token)
      .then(setRightComments)
      .catch(() => setRightComments([]));
  }, [rightId, token]);

  const allComments = useMemo(
    () => [...leftComments, ...rightComments],
    [leftComments, rightComments]
  );

  const markerColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const c of leftComments) colors[c.id] = LEFT_MARKER_COLOR;
    for (const c of rightComments) colors[c.id] = RIGHT_MARKER_COLOR;
    return colors;
  }, [leftComments, rightComments]);

  const leftDuration = left?.durationSeconds ?? 0;
  const rightDuration = right?.durationSeconds ?? 0;
  const syncDuration =
    syncEnabled && leftDuration > 0 && rightDuration > 0
      ? Math.min(leftDuration, rightDuration)
      : Math.max(leftDuration, rightDuration, 1);

  rightDurationRef.current = rightDuration;

  const handleLeftVideo = useCallback((video: HTMLVideoElement | null) => {
    leftVideoRef.current = video;
  }, []);

  const handleRightVideo = useCallback((video: HTMLVideoElement | null) => {
    rightVideoRef.current = video;
  }, []);

  const resetSync = useCallback(() => {
    leftRef.current?.pause();
    rightRef.current?.pause();
    leftRef.current?.setCurrentTime(0);
    rightRef.current?.setCurrentTime(0);
    const rightVideo = rightVideoRef.current;
    if (rightVideo) rightVideo.playbackRate = 1;
    setScrubberTime(0);
    setScrubberPlaying(false);
  }, []);

  useEffect(() => {
    if (!syncEnabled || !left || !right) return;
    const timer = window.setTimeout(resetSync, 100);
    return () => window.clearTimeout(timer);
  }, [syncEnabled, left?.id, right?.id, resetSync]);

  useEffect(() => {
    if (!syncEnabled || !left || !right) return;

    let frame = 0;
    let lastUiAt = 0;

    const tick = () => {
      const master = leftVideoRef.current;
      const follower = rightVideoRef.current;

      if (master && follower && follower.readyState >= HTMLMediaElement.HAVE_METADATA) {
        const state = syncFollowerVideo(master, follower, rightDurationRef.current);
        const now = performance.now();
        if (now - lastUiAt > 120) {
          lastUiAt = now;
          setScrubberTime(state.currentTime);
          setScrubberPlaying(state.playing);
        }
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      const follower = rightVideoRef.current;
      if (follower) follower.playbackRate = 1;
    };
  }, [syncEnabled, left?.id, right?.id]);

  // Draw left annotation overlay
  useEffect(() => {
    if (leftCanvasRef.current) {
      drawAnnotation(leftCanvasRef.current, leftAnnotation, []);
    }
  }, [leftAnnotation]);

  // Draw right annotation overlay
  useEffect(() => {
    if (rightCanvasRef.current) {
      drawAnnotation(rightCanvasRef.current, rightAnnotation, []);
    }
  }, [rightAnnotation]);

  // Clear annotation when time moves out of range
  useEffect(() => {
    if (!selectedCommentId || !selectedSide) return;
    const comments = selectedSide === "left" ? leftComments : rightComments;
    const comment = comments.find((c) => c.id === selectedCommentId);
    if (!comment?.annotationJson) return;
    if (!isTimeWithinAnnotationRange(scrubberTime, comment)) {
      setSelectedCommentId(null);
      setSelectedSide(null);
      setLeftAnnotation(null);
      setRightAnnotation(null);
    }
  }, [scrubberTime, selectedCommentId, selectedSide, leftComments, rightComments]);

  function seekBoth(seconds: number) {
    const target = clampCompareTime(seconds, syncDuration);
    if (left) leftRef.current?.setCurrentTime(clampToVersion(left, target));
    if (right) rightRef.current?.setCurrentTime(clampToVersion(right, target));

    const follower = rightVideoRef.current;
    if (follower) follower.playbackRate = 1;

    const playing = leftRef.current?.isPlaying() ?? false;
    setScrubberTime(target);
    setScrubberPlaying(playing);

    if (playing) {
      void rightVideoRef.current?.play().catch(() => undefined);
    }
  }

  function toggleMasterPlayback() {
    const master = leftVideoRef.current;
    const follower = rightVideoRef.current;
    if (!master) return;

    if (!master.paused) {
      master.pause();
      follower?.pause();
      if (follower) follower.playbackRate = 1;
      setScrubberPlaying(false);
      return;
    }

    void master.play().then(() => {
      if (syncEnabled && follower) {
        follower.currentTime = clampToVersion(right!, clampCompareTime(master.currentTime, rightDurationRef.current));
        follower.playbackRate = 1;
        void follower.play().catch(() => undefined);
      }
      setScrubberPlaying(true);
    });
  }

  function selectComment(comment: ReviewComment, side: "left" | "right") {
    if (selectedCommentId === comment.id) {
      setSelectedCommentId(null);
      setSelectedSide(null);
      setLeftAnnotation(null);
      setRightAnnotation(null);
      return;
    }

    seekBoth(comment.timeSeconds);
    setSelectedCommentId(comment.id);
    setSelectedSide(side);

    if (comment.annotationJson) {
      if (side === "left") {
        setLeftAnnotation(comment.annotationJson);
        setRightAnnotation(null);
      } else {
        setRightAnnotation(comment.annotationJson);
        setLeftAnnotation(null);
      }
    } else {
      setLeftAnnotation(null);
      setRightAnnotation(null);
    }
  }

  function isNearCurrentTime(comment: ReviewComment) {
    return Math.abs(comment.timeSeconds - scrubberTime) <= ACTIVE_TIME_TOLERANCE;
  }

  if (!leftId || !rightId) {
    return <p className="text-frame-muted">Select two versions from an asset page to compare.</p>;
  }

  const authQuery = `token=${encodeURIComponent(token)}`;

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <header className="mb-4 border-b border-frame-border pb-4 sm:mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-frame-muted">Side-by-side compare</p>
            <h1 className="mt-1 text-xl font-semibold text-frame-text sm:text-2xl">{asset?.name ?? "Loading…"}</h1>
            <p className="mt-1 hidden text-sm text-frame-muted sm:block">
              {syncEnabled
                ? "Play from the left player — both videos stay in sync."
                : "Each player is independent."}
            </p>
            {left && right ? (
              <p className="mt-1 hidden text-xs text-frame-muted md:block">
                Durations: v{left.versionNumber} {left.durationSeconds ? formatDuration(left.durationSeconds) : "—"} · v
                {right.versionNumber} {right.durationSeconds ? formatDuration(right.durationSeconds) : "—"}
                {syncEnabled && leftDuration > 0 && rightDuration > 0 ? ` · Sync window ${formatDuration(syncDuration)}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`rounded-lg px-3 py-2 text-sm font-medium sm:px-4 ${syncEnabled ? "bg-frame-accent text-white" : "frame-btn-secondary"}`}
              onClick={() => setSyncEnabled((value) => !value)}
              type="button"
            >
              {syncEnabled ? "Synced" : "Independent"}
            </button>
            {syncEnabled ? (
              <button className="frame-btn-secondary !px-3 text-xs sm:text-sm" onClick={resetSync} type="button">
                Reset
              </button>
            ) : null}
            {asset ? (
              <Link className="frame-btn-secondary !px-3 text-xs sm:text-sm" href={`/assets/${asset.id}`}>
                Back
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {message ? (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{message}</p>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid flex-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {left ? (
              <div className="frame-panel flex flex-col overflow-hidden p-0">
                <p className="border-b border-frame-border px-4 py-2 text-sm text-frame-muted">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: LEFT_MARKER_COLOR }} />
                  Version {left.versionNumber} (master — use this player)
                </p>
                <div className="relative aspect-video w-full bg-black">
                  <div className="absolute inset-0">
                    <ReviewPlayer
                      authQuery={authQuery}
                      layout="fill"
                      mediaBasePath="/media/proxies"
                      mode="preview"
                      onVideoElement={handleLeftVideo}
                      playbackRole="independent"
                      ref={leftRef}
                      version={left}
                    />
                  </div>
                  {leftAnnotation ? (
                    <canvas
                      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                      ref={leftCanvasRef}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            {right ? (
              <div className="frame-panel flex flex-col overflow-hidden p-0">
                <p className="border-b border-frame-border px-4 py-2 text-sm text-frame-muted">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: RIGHT_MARKER_COLOR }} />
                  Version {right.versionNumber} (follows left when synced)
                </p>
                <div className="relative aspect-video w-full bg-black">
                  <div className="absolute inset-0">
                    <ReviewPlayer
                      authQuery={authQuery}
                      hideControls={syncEnabled}
                      layout="fill"
                      mediaBasePath="/media/proxies"
                      mode="preview"
                      onVideoElement={handleRightVideo}
                      playbackRole="independent"
                      ref={rightRef}
                      version={right}
                    />
                  </div>
                  {rightAnnotation ? (
                    <canvas
                      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                      ref={rightCanvasRef}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {syncEnabled && left && right ? (
            <div className="border-t border-frame-border bg-frame-panel">
              <div className="flex items-center gap-2 px-4 pt-2">
                <button className="frame-btn-secondary !px-3 !py-1.5 text-xs" onClick={toggleMasterPlayback} type="button">
                  {scrubberPlaying ? "Pause both" : "Play both"}
                </button>
                <span className="flex items-center gap-1.5 text-[11px] text-frame-muted">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: LEFT_MARKER_COLOR }} />
                  v{left.versionNumber}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-frame-muted">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: RIGHT_MARKER_COLOR }} />
                  v{right.versionNumber}
                </span>
              </div>
              <ReviewScrubber
                comments={allComments}
                currentTime={scrubberTime}
                durationSeconds={syncDuration}
                markerColors={markerColors}
                onSeek={seekBoth}
              />
            </div>
          ) : null}
        </div>

        {/* Comments sidebar */}
        {left && right ? (
          <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-frame-border bg-frame-panel xl:w-80">
            <div className="flex items-center justify-between border-b border-frame-border px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-frame-muted">Comments</span>
              <span className="text-[11px] text-frame-muted">
                {leftComments.length + rightComments.length} total
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {leftComments.length === 0 && rightComments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-frame-border p-6 text-center text-sm text-frame-muted">
                  No comments on either version.
                </p>
              ) : null}

              {leftComments.length > 0 ? (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-frame-muted">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: LEFT_MARKER_COLOR }} />
                    Version {left.versionNumber}
                  </p>
                  {leftComments.map((comment) => (
                    <CompareCommentCard
                      key={comment.id}
                      comment={comment}
                      color={LEFT_MARKER_COLOR}
                      isActive={isNearCurrentTime(comment)}
                      isSelected={selectedCommentId === comment.id}
                      onSelect={() => selectComment(comment, "left")}
                    />
                  ))}
                </div>
              ) : null}

              {rightComments.length > 0 ? (
                <div className={leftComments.length > 0 ? "mt-4" : undefined}>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-frame-muted">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: RIGHT_MARKER_COLOR }} />
                    Version {right.versionNumber}
                  </p>
                  {rightComments.map((comment) => (
                    <CompareCommentCard
                      key={comment.id}
                      comment={comment}
                      color={RIGHT_MARKER_COLOR}
                      isActive={isNearCurrentTime(comment)}
                      isSelected={selectedCommentId === comment.id}
                      onSelect={() => selectComment(comment, "right")}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function CompareCommentCard({
  comment,
  color,
  isActive,
  isSelected,
  onSelect,
}: {
  comment: ReviewComment;
  color: string;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const borderColor = isSelected
    ? color
    : isActive
      ? `${color}80`
      : undefined;

  return (
    <article
      className={`mb-2 cursor-pointer rounded-lg border p-3 transition-colors ${
        isSelected
          ? "bg-frame-panel-elevated"
          : isActive
            ? "bg-frame-panel-elevated/50"
            : "border-frame-border bg-frame-panel hover:bg-frame-panel-elevated/30"
      }`}
      onClick={onSelect}
      style={borderColor ? { borderColor } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          className="frame-time-pill"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          type="button"
        >
          {formatTimestamp(comment.timeSeconds)}
        </button>
        <span className="truncate text-xs text-frame-muted">{commentAuthor(comment)}</span>
      </div>
      <p className="mt-1.5 text-sm text-frame-text">{comment.body}</p>
      {comment.annotationJson ? (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px]" style={{ color }}>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {isSelected ? "Hide drawing" : "Show drawing"}
        </span>
      ) : null}
      {comment.resolvedAt ? (
        <span className="mt-1 inline-block text-[11px] text-emerald-400">Resolved</span>
      ) : null}
    </article>
  );
}

export default function ComparePage() {
  return (
    <AuthGate>
      {(token) => (
        <Suspense fallback={<p className="text-frame-muted">Loading comparison…</p>}>
          <CompareContent token={token} />
        </Suspense>
      )}
    </AuthGate>
  );
}

"use client";

import { PointerEvent, useRef } from "react";
import { formatTimestamp } from "../../lib/api";
import type { ReviewComment } from "../../lib/types";

type ReviewScrubberProps = {
  durationSeconds: number;
  currentTime: number;
  comments: ReviewComment[];
  onSeek: (seconds: number) => void;
  /** Optional map from comment ID to marker dot/range CSS color. Defaults to amber-300. */
  markerColors?: Record<string, string>;
};

export function ReviewScrubber({ durationSeconds, currentTime, comments, onSeek, markerColors }: ReviewScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const duration = durationSeconds > 0 ? durationSeconds : 1;

  function seekFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  function handleTrackPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);

    const handleMove = (moveEvent: globalThis.PointerEvent) => seekFromClientX(moveEvent.clientX);
    const handleUp = (upEvent: globalThis.PointerEvent) => {
      try {
        if (target.hasPointerCapture(upEvent.pointerId)) {
          target.releasePointerCapture(upEvent.pointerId);
        }
      } catch {
        // Pointer capture may already have been released.
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  return (
    <div className="relative z-20 border-t border-frame-border bg-frame-panel px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-frame-muted">
        <span>{formatTimestamp(currentTime)}</span>
        <span>{formatTimestamp(duration)}</span>
      </div>
      <div
        className="relative h-8 cursor-pointer touch-none select-none"
        onPointerDown={handleTrackPointerDown}
        ref={trackRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        tabIndex={0}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 5 : 1;
          if (event.key === "ArrowLeft") onSeek(Math.max(0, currentTime - step));
          if (event.key === "ArrowRight") onSeek(Math.min(duration, currentTime + step));
        }}
      >
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-frame-border" />
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-frame-accent"
          style={{ width: `${progress}%` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-frame-accent shadow-md"
          style={{ left: `${progress}%` }}
        />
        {comments.map((comment) => {
          const endSeconds = comment.annotationJson?.endSeconds;
          const hasRange = typeof endSeconds === "number" && endSeconds > comment.timeSeconds;
          const left = Math.min(100, Math.max(0, (comment.timeSeconds / duration) * 100));
          const width = hasRange
            ? Math.min(100 - left, Math.max(0, ((endSeconds - comment.timeSeconds) / duration) * 100))
            : 0;
          const dotColor = markerColors?.[comment.id] ?? "#fcd34d";
          const rangeColor = markerColors?.[comment.id] ? `${markerColors[comment.id]}59` : "rgb(252 211 77 / 0.35)";

          return (
            <span key={comment.id}>
              {hasRange ? (
                <span
                  className="pointer-events-none absolute top-1/2 z-10 h-1 -translate-y-1/2 rounded-full"
                  style={{ left: `${left}%`, width: `${width}%`, backgroundColor: rangeColor }}
                />
              ) : null}
              <button
                aria-label={`Comment at ${formatTimestamp(comment.timeSeconds)}`}
                className="absolute top-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black"
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(comment.timeSeconds);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                style={{ left: `${left}%`, backgroundColor: dotColor }}
                type="button"
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

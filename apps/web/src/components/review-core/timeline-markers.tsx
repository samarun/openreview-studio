"use client";

import { formatTimestamp } from "../../lib/api";
import type { ReviewComment } from "../../lib/types";

export function TimelineMarkers({
  comments,
  durationSeconds,
  onJump
}: {
  comments: ReviewComment[];
  durationSeconds?: number | null;
  onJump: (seconds: number) => void;
}) {
  if (comments.length === 0) return null;

  const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : Math.max(...comments.map((c) => c.timeSeconds), 1);

  return (
    <div className="relative mx-4 mb-3 h-2 rounded-full bg-frame-border">
      {comments.map((comment) => (
        <button
          aria-label={`Jump to comment at ${formatTimestamp(comment.timeSeconds)}`}
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-frame-accent ring-2 ring-black"
          key={comment.id}
          onClick={() => onJump(comment.timeSeconds)}
          style={{ left: `${Math.min(100, Math.max(0, (comment.timeSeconds / duration) * 100))}%` }}
          type="button"
        />
      ))}
    </div>
  );
}

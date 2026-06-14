"use client";

import { formatTimestamp } from "../../lib/api";
import type { ReviewComment } from "../../lib/types";

function commentAuthor(comment: ReviewComment) {
  return comment.author?.name || comment.author?.email || comment.guestReviewer?.name || comment.guestReviewer?.email || "Guest reviewer";
}

function replyAuthor(reply: ReviewComment["replies"][number]) {
  return reply.author?.name || reply.author?.email || reply.guestReviewer?.name || "Guest";
}

type CommentListProps = {
  comments: ReviewComment[];
  loading?: boolean;
  replyBodies: Record<string, string>;
  onReplyBodyChange: (commentId: string, value: string) => void;
  onSubmitReply?: (commentId: string) => void;
  onToggleResolved?: (comment: ReviewComment) => void;
  onShowAnnotation?: (comment: ReviewComment) => void;
  activeAnnotationCommentId?: string | null;
  onJumpToTime?: (seconds: number) => void;
  canResolve?: boolean;
  canReply?: boolean;
};

export function CommentList({
  comments,
  loading,
  replyBodies,
  onReplyBodyChange,
  onSubmitReply,
  onToggleResolved,
  onShowAnnotation,
  activeAnnotationCommentId,
  onJumpToTime,
  canResolve = false,
  canReply = false
}: CommentListProps) {
  if (comments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-frame-border p-6 text-center text-sm text-frame-muted">
        No comments yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <article
          className={`rounded-lg border p-3 ${comment.resolvedAt ? "border-emerald-500/30 bg-emerald-500/5" : "border-frame-border bg-frame-panel-elevated"}`}
          key={comment.id}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {onJumpToTime ? (
                <button className="frame-time-pill" onClick={() => onJumpToTime(comment.timeSeconds)} type="button">
                  {formatTimestamp(comment.timeSeconds)}
                </button>
              ) : (
                <span className="text-sm font-semibold text-frame-accent">{formatTimestamp(comment.timeSeconds)}</span>
              )}
              {comment.resolvedAt ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  Resolved
                </span>
              ) : null}
            </div>
            <span className="text-xs text-frame-muted">{commentAuthor(comment)}</span>
          </div>
          <p className="mt-2 text-sm text-frame-text">{comment.body}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {comment.annotationJson && onShowAnnotation ? (
              <button
                className={`text-xs hover:underline ${activeAnnotationCommentId === comment.id ? "font-semibold text-frame-text" : "text-frame-accent"}`}
                onClick={() => onShowAnnotation(comment)}
                type="button"
              >
                {activeAnnotationCommentId === comment.id ? "Hide drawing" : "Show drawing"}
              </button>
            ) : null}
            {canResolve && onToggleResolved ? (
              <button className="text-xs text-frame-muted hover:text-frame-text" disabled={loading} onClick={() => onToggleResolved(comment)} type="button">
                {comment.resolvedAt ? "Reopen" : "Resolve"}
              </button>
            ) : null}
          </div>

          {comment.replies.length > 0 ? (
            <div className="mt-3 space-y-2 border-l border-frame-border pl-3">
              {comment.replies.map((reply) => (
                <div className="text-xs" key={reply.id}>
                  <p className="text-frame-muted">{replyAuthor(reply)}</p>
                  <p className="mt-1 text-frame-text">{reply.body}</p>
                </div>
              ))}
            </div>
          ) : null}

          {canReply && onSubmitReply ? (
            <div className="mt-2 flex gap-2">
              <input
                className="frame-input min-w-0 flex-1 !py-1.5 text-xs"
                placeholder="Reply"
                value={replyBodies[comment.id] ?? ""}
                onChange={(event) => onReplyBodyChange(comment.id, event.target.value)}
              />
              <button
                className="frame-btn-primary !px-2 !py-1.5 text-xs"
                disabled={loading || !(replyBodies[comment.id] ?? "").trim()}
                onClick={() => onSubmitReply(comment.id)}
                type="button"
              >
                Reply
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

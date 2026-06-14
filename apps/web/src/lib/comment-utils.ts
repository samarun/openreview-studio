import type { ReviewComment } from "./types";

export function commentAuthor(comment: ReviewComment) {
  return comment.author?.name || comment.author?.email || comment.guestReviewer?.name || comment.guestReviewer?.email || "Guest reviewer";
}

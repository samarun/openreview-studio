import type { AnnotationData, ReviewComment } from "./types";

const DEFAULT_POINT_TOLERANCE = 0.35;

export function annotationEndSeconds(comment: Pick<ReviewComment, "timeSeconds" | "annotationJson">): number {
  const end = comment.annotationJson?.endSeconds;
  if (typeof end === "number" && end >= comment.timeSeconds) {
    return end;
  }
  return comment.timeSeconds + DEFAULT_POINT_TOLERANCE;
}

export function isTimeWithinAnnotationRange(
  currentTime: number,
  comment: Pick<ReviewComment, "timeSeconds" | "annotationJson">,
  tolerance = DEFAULT_POINT_TOLERANCE
) {
  const start = comment.timeSeconds;
  const end = comment.annotationJson?.endSeconds;
  if (typeof end === "number" && end > start) {
    return currentTime >= start && currentTime <= end;
  }
  return Math.abs(currentTime - start) <= tolerance;
}

export function mergeAnnotationEnd(
  annotation: AnnotationData | null,
  endSeconds: number | null | undefined
): AnnotationData | null {
  if (!annotation) return null;
  if (endSeconds == null || !Number.isFinite(endSeconds)) return annotation;
  return { ...annotation, endSeconds: Math.max(endSeconds, 0) };
}

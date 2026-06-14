"use client";

import { PointerEvent, useCallback, useState } from "react";
import { ANNOTATION_COLOR, AnnotationTool, pointFromCanvasEvent } from "../../lib/annotations";
import type { AnnotationData, AnnotationPath, AnnotationPoint, AnnotationShape } from "../../lib/types";

export function useAnnotationDrawing() {
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("freehand");
  const [drawing, setDrawing] = useState(false);
  const [shapeStart, setShapeStart] = useState<AnnotationPoint | null>(null);
  const [draftPaths, setDraftPaths] = useState<AnnotationPath[]>([]);
  const [draftShapes, setDraftShapes] = useState<AnnotationShape[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationData | null>(null);

  const clearOverlay = useCallback(() => {
    setDraftPaths([]);
    setDraftShapes([]);
    setActiveAnnotation(null);
  }, []);

  const startAnnotationPath = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!annotationMode) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      setDrawing(true);
      setActiveAnnotation(null);
      const point = pointFromCanvasEvent(event);

      if (annotationTool === "freehand") {
        setDraftPaths((paths) => [...paths, { kind: "freehand", color: ANNOTATION_COLOR, points: [point] }]);
        return;
      }

      setShapeStart(point);
    },
    [annotationMode, annotationTool]
  );

  const extendAnnotationPath = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!drawing || !annotationMode) return;

      if (annotationTool === "freehand") {
        const point = pointFromCanvasEvent(event);
        setDraftPaths((paths) =>
          paths.map((path, index) => (index === paths.length - 1 ? { ...path, points: [...path.points, point] } : path))
        );
      }
    },
    [annotationMode, annotationTool, drawing]
  );

  const finishAnnotationPath = useCallback(
    (event?: PointerEvent<HTMLCanvasElement>) => {
      if (drawing && annotationTool !== "freehand" && shapeStart && event) {
        const end = pointFromCanvasEvent(event);
        const text = annotationTool === "text" ? window.prompt("Annotation text")?.trim() : undefined;

        if (annotationTool !== "text" || text) {
          setDraftShapes((shapes) => [
            ...shapes,
            {
              kind: annotationTool as Exclude<AnnotationTool, "freehand">,
              color: ANNOTATION_COLOR,
              start: shapeStart,
              end,
              text
            }
          ]);
        }
      }

      setDrawing(false);
      setShapeStart(null);
    },
    [annotationTool, drawing, shapeStart]
  );

  const annotationPayload =
    draftPaths.length > 0 || draftShapes.length > 0 ? { type: "annotation" as const, paths: draftPaths, shapes: draftShapes } : undefined;

  return {
    annotationMode,
    setAnnotationMode,
    annotationTool,
    setAnnotationTool,
    draftPaths,
    draftShapes,
    activeAnnotation,
    setActiveAnnotation,
    clearOverlay,
    startAnnotationPath,
    extendAnnotationPath,
    finishAnnotationPath,
    annotationPayload,
    resetDrafts: () => {
      setDraftPaths([]);
      setDraftShapes([]);
    }
  };
}

import type { AnnotationData, AnnotationPath, AnnotationPoint } from "./types";

export function drawAnnotation(
  canvas: HTMLCanvasElement,
  annotation: AnnotationData | null,
  draftPaths: AnnotationPath[]
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  context.scale(scale, scale);
  context.clearRect(0, 0, rect.width, rect.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 3;

  const drawLine = (start: AnnotationPoint, end: AnnotationPoint) => {
    context.beginPath();
    context.moveTo(start.x * rect.width, start.y * rect.height);
    context.lineTo(end.x * rect.width, end.y * rect.height);
    context.stroke();
  };

  for (const shape of annotation?.shapes ?? []) {
    context.strokeStyle = shape.color;
    context.fillStyle = shape.color;
    const x = shape.start.x * rect.width;
    const y = shape.start.y * rect.height;
    const w = (shape.end.x - shape.start.x) * rect.width;
    const h = (shape.end.y - shape.start.y) * rect.height;

    if (shape.kind === "rectangle") context.strokeRect(x, y, w, h);
    if (shape.kind === "circle") {
      context.beginPath();
      context.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      context.stroke();
    }
    if (shape.kind === "arrow") {
      drawLine(shape.start, shape.end);
      const angle = Math.atan2(h, w);
      const headLength = 14;
      context.beginPath();
      context.moveTo(shape.end.x * rect.width, shape.end.y * rect.height);
      context.lineTo(shape.end.x * rect.width - headLength * Math.cos(angle - Math.PI / 6), shape.end.y * rect.height - headLength * Math.sin(angle - Math.PI / 6));
      context.moveTo(shape.end.x * rect.width, shape.end.y * rect.height);
      context.lineTo(shape.end.x * rect.width - headLength * Math.cos(angle + Math.PI / 6), shape.end.y * rect.height - headLength * Math.sin(angle + Math.PI / 6));
      context.stroke();
    }
    if (shape.kind === "text" && shape.text) {
      context.font = "16px sans-serif";
      context.fillText(shape.text, x, y);
    }
  }

  for (const path of [...(annotation?.paths ?? []), ...draftPaths]) {
    if (path.points.length < 2) {
      continue;
    }

    const firstPoint = path.points[0];

    if (!firstPoint) {
      continue;
    }

    context.strokeStyle = path.color;
    context.beginPath();
    context.moveTo(firstPoint.x * rect.width, firstPoint.y * rect.height);

    for (const point of path.points.slice(1)) {
      context.lineTo(point.x * rect.width, point.y * rect.height);
    }

    context.stroke();
  }
}

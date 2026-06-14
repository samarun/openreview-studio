"use client";

type AnnotationTool = "freehand" | "rectangle" | "circle" | "arrow" | "text";

type ReviewToolbarProps = {
  annotationMode: boolean;
  annotationTool: AnnotationTool;
  onToggleDraw: () => void;
  onToolChange: (tool: AnnotationTool) => void;
  onPrevFrame: () => void;
  onNextFrame: () => void;
  onUseCurrentTime: () => void;
  onClearOverlay: () => void;
  onMarkRangeStart?: () => void;
  onMarkRangeEnd?: () => void;
  rangeStartLabel?: string;
  rangeEndLabel?: string;
};

export function ReviewToolbar({
  annotationMode,
  annotationTool,
  onToggleDraw,
  onToolChange,
  onPrevFrame,
  onNextFrame,
  onUseCurrentTime,
  onClearOverlay,
  onMarkRangeStart,
  onMarkRangeEnd,
  rangeStartLabel,
  rangeEndLabel
}: ReviewToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-frame-border bg-frame-panel px-4 py-2">
      <button
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${annotationMode ? "bg-frame-accent text-white" : "border border-frame-border text-frame-text hover:bg-white/5"}`}
        onClick={onToggleDraw}
        type="button"
      >
        ✎ Draw
      </button>
      <select
        className="rounded-lg border border-frame-border bg-frame-panel-elevated px-2 py-1.5 text-xs text-frame-text"
        onChange={(event) => onToolChange(event.target.value as AnnotationTool)}
        value={annotationTool}
      >
        <option value="freehand">Pen</option>
        <option value="arrow">Arrow</option>
        <option value="rectangle">Rectangle</option>
        <option value="circle">Circle</option>
        <option value="text">Text</option>
      </select>
      <div className="mx-1 h-5 w-px bg-frame-border" />
      <button className="frame-btn-secondary !px-2 !py-1.5 text-xs" onClick={onPrevFrame} type="button">
        ◀ Frame
      </button>
      <button className="frame-btn-secondary !px-2 !py-1.5 text-xs" onClick={onNextFrame} type="button">
        Frame ▶
      </button>
      <button className="frame-btn-secondary !px-2 !py-1.5 text-xs" onClick={onUseCurrentTime} type="button">
        @ Current time
      </button>
      {onMarkRangeStart ? (
        <button className="frame-btn-secondary !px-2 !py-1.5 text-xs" onClick={onMarkRangeStart} type="button" title="Mark annotation range start">
          Range start{rangeStartLabel ? `: ${rangeStartLabel}` : ""}
        </button>
      ) : null}
      {onMarkRangeEnd ? (
        <button className="frame-btn-secondary !px-2 !py-1.5 text-xs" onClick={onMarkRangeEnd} type="button" title="Mark annotation range end">
          Range end{rangeEndLabel ? `: ${rangeEndLabel}` : ""}
        </button>
      ) : null}
      <button className="frame-btn-secondary !px-2 !py-1.5 text-xs" onClick={onClearOverlay} type="button">
        Clear
      </button>
    </div>
  );
}

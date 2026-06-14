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
    <div className="flex flex-wrap items-center gap-1 border-t border-frame-border bg-frame-panel px-1.5 py-1.5 sm:gap-2 sm:px-4 sm:py-2">
      <button
        className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs ${annotationMode ? "bg-frame-accent text-white" : "border border-frame-border text-frame-text hover:bg-white/5"}`}
        onClick={onToggleDraw}
        type="button"
      >
        <span className="sm:hidden">✎</span>
        <span className="hidden sm:inline">✎ Draw</span>
      </button>
      <select
        className="rounded-md border border-frame-border bg-frame-panel-elevated px-1.5 py-1 text-[11px] text-frame-text sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-xs"
        onChange={(event) => onToolChange(event.target.value as AnnotationTool)}
        value={annotationTool}
      >
        <option value="freehand">Pen</option>
        <option value="arrow">Arrow</option>
        <option value="rectangle">Rect</option>
        <option value="circle">Circle</option>
        <option value="text">Text</option>
      </select>
      <div className="mx-0.5 hidden h-4 w-px bg-frame-border sm:block" />
      <button className="frame-btn-secondary !min-h-0 !px-1.5 !py-1 text-[11px] sm:!px-2 sm:!py-1.5 sm:text-xs" onClick={onPrevFrame} type="button">
        ◀
      </button>
      <button className="frame-btn-secondary !min-h-0 !px-1.5 !py-1 text-[11px] sm:!px-2 sm:!py-1.5 sm:text-xs" onClick={onNextFrame} type="button">
        ▶
      </button>
      <button className="frame-btn-secondary !min-h-0 !px-1.5 !py-1 text-[11px] sm:!px-2 sm:!py-1.5 sm:text-xs" onClick={onUseCurrentTime} type="button">
        <span className="hidden sm:inline">@ Current time</span>
        <span className="sm:hidden">@ Time</span>
      </button>
      {onMarkRangeStart ? (
        <button className="hidden frame-btn-secondary !px-2 !py-1.5 text-xs sm:inline-flex" onClick={onMarkRangeStart} type="button" title="Mark annotation range start">
          Range start{rangeStartLabel ? `: ${rangeStartLabel}` : ""}
        </button>
      ) : null}
      {onMarkRangeEnd ? (
        <button className="hidden frame-btn-secondary !px-2 !py-1.5 text-xs sm:inline-flex" onClick={onMarkRangeEnd} type="button" title="Mark annotation range end">
          Range end{rangeEndLabel ? `: ${rangeEndLabel}` : ""}
        </button>
      ) : null}
      <button className="frame-btn-secondary !min-h-0 !px-1.5 !py-1 text-[11px] sm:!px-2 sm:!py-1.5 sm:text-xs" onClick={onClearOverlay} type="button">
        Clear
      </button>
    </div>
  );
}

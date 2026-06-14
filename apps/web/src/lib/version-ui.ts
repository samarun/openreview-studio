export function versionStatusLabel(status: string) {
  if (status === "READY") return "Ready";
  if (status === "FAILED") return "Failed";
  if (status === "PROCESSING") return "Processing";
  if (status === "UPLOADED") return "Queued";
  return status;
}

export function versionStatusClass(status: string) {
  if (status === "READY") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "FAILED") return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  if (status === "PROCESSING") return "border-frame-accent/40 bg-frame-accent/10 text-indigo-200";
  return "border-amber-500/40 bg-amber-500/10 text-amber-200";
}

export function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

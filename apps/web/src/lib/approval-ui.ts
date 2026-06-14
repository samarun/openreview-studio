import { rollupApprovalStatus as rollupApprovalStatusShared } from "@openreview/shared";
import type { Approval, ApprovalStatus } from "./types";

export function rollupApprovalStatus(approvals: Array<Pick<Approval, "status">>) {
  return rollupApprovalStatusShared(approvals);
}

export const approvalStatusOptions: { value: ApprovalStatus; label: string; tone: string }[] = [
  { value: "PENDING", label: "Needs review", tone: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  { value: "CHANGES_REQUESTED", label: "In progress", tone: "bg-frame-accent/15 text-indigo-200 border-frame-accent/30" },
  { value: "APPROVED", label: "Approved", tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" }
];

export function approvalLabel(status: ApprovalStatus | undefined) {
  return approvalStatusOptions.find((option) => option.value === status)?.label ?? "Needs review";
}

export function versionProcessingLabel(status: string) {
  if (status === "READY") return "Ready";
  if (status === "FAILED") return "Failed";
  if (status === "PROCESSING") return "Processing";
  return "Uploaded";
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api";
import { approvalLabel, rollupApprovalStatus } from "../lib/approval-ui";
import { resolveOrganizationId } from "../lib/org";
import type { ApprovalStatus, Asset, Folder, OrgMember, Project, ProjectMember, ReviewShareLink, User } from "../lib/types";
import type { UploadController, UploadProgress } from "../lib/upload";
import { createUploadController, uploadOriginalFile } from "../lib/upload";
import { AssetGridCard } from "./frame/asset-grid-card";
import { ShareLinkPanel } from "./frame/share-link-panel";
import { UploadProgressBar } from "./frame/upload-progress-bar";

function latestVersion(asset: Asset) {
  return [...asset.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

function assetApprovalStatus(asset: Asset): ApprovalStatus {
  const version = latestVersion(asset);
  return rollupApprovalStatus(version?.approvals ?? []);
}

export function ProjectDetail({ projectId, token, user }: { projectId: string; token: string; user: User }) {
  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderName, setFolderName] = useState("New folder");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [assetName, setAssetName] = useState("Rough Cut v1");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadController, setUploadController] = useState<UploadController | null>(null);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareVersionId, setShareVersionId] = useState<string | null>(null);
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [shareInviteEmail, setShareInviteEmail] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareLinks, setShareLinks] = useState<ReviewShareLink[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const [membersPanelOpen, setMembersPanelOpen] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [addMemberUserId, setAddMemberUserId] = useState("");

  const organizationId = resolveOrganizationId(user.memberships ?? []);
  const currentMembership = orgMembers.find((m) => m.user.id === user.id);
  const isAdmin = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";

  async function archiveAsset(assetId: string) {
    if (!confirm("Archive this asset?")) return;

    try {
      await apiRequest(`/assets/${assetId}/archive`, { method: "PATCH", body: JSON.stringify({ archived: true }) }, token);
      setProject(await apiRequest<Project>(`/projects/${projectId}`, {}, token));
      setMessage("Asset archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive asset.");
    }
  }

  async function loadProject() {
    const [nextProject, nextFolders] = await Promise.all([
      apiRequest<Project>(`/projects/${projectId}`, {}, token),
      apiRequest<Folder[]>(`/projects/${projectId}/folders`, {}, token)
    ]);
    setProject(nextProject);
    setFolders(nextFolders);
  }

  async function loadProjectMembers() {
    setProjectMembers(await apiRequest<ProjectMember[]>(`/projects/${projectId}/members`, {}, token));
  }

  async function loadOrgMembers() {
    if (!organizationId) return;
    setOrgMembers(await apiRequest<OrgMember[]>(`/organizations/${organizationId}/members`, {}, token));
  }

  async function addProjectMember() {
    if (!addMemberUserId) return;
    try {
      await apiRequest(`/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: addMemberUserId })
      }, token);
      setAddMemberUserId("");
      await loadProjectMembers();
      setMessage("Member added to project.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add member.");
    }
  }

  async function removeProjectMember(userId: string) {
    if (!confirm("Remove this member from the project?")) return;
    try {
      await apiRequest(`/projects/${projectId}/members/${userId}`, { method: "DELETE" }, token);
      await loadProjectMembers();
      setMessage("Member removed from project.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove member.");
    }
  }

  useEffect(() => {
    loadProject().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load project."));
    loadProjectMembers().catch(() => undefined);
    loadOrgMembers().catch(() => undefined);
  }, [projectId, token]);

  const visibleAssets = useMemo(() => {
    if (!project) return [];
    if (!selectedFolderId) return project.assets;
    if (selectedFolderId === "uncategorized") {
      return project.assets.filter((asset) => !asset.folderId);
    }

    return project.assets.filter((asset) => asset.folderId === selectedFolderId);
  }, [project, selectedFolderId]);

  async function moveAssetToFolder(assetId: string, folderId: string | null) {
    try {
      await apiRequest(`/assets/${assetId}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId })
      }, token);
      await loadProject();
      setMessage(folderId ? "Asset moved to folder." : "Asset removed from folder.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to move asset.");
    }
  }

  async function renameFolder(folderId: string) {
    const name = renameFolderValue.trim();
    if (!name) return;

    try {
      await apiRequest(`/folders/${folderId}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      }, token);
      setRenamingFolderId(null);
      await loadProject();
      setMessage("Folder renamed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to rename folder.");
    }
  }

  async function deleteFolder(folderId: string) {
    if (!confirm("Delete this folder? Assets will stay in the project.")) return;

    try {
      await apiRequest(`/folders/${folderId}`, { method: "DELETE" }, token);
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      await loadProject();
      setMessage("Folder deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete folder.");
    }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest("/folders", {
        method: "POST",
        body: JSON.stringify({ projectId, name: folderName })
      }, token);
      await loadProject();
      setMessage("Folder created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create folder.");
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!assetFile) {
      setMessage("Choose a video file first.");
      return;
    }

    setUploading(true);
    setMessage("");
    const ctrl = createUploadController();
    setUploadController(ctrl);
    setUploadProgress({ percent: 0, bytesUploaded: 0, bytesTotal: assetFile.size, currentPart: null, totalParts: null, speed: null, etaSeconds: null });

    try {
      const originalKey = await uploadOriginalFile({
        apiRequest: (path, options) => apiRequest(path, options, token),
        projectId,
        file: assetFile,
        onProgress: setUploadProgress,
        controller: ctrl,
      });

      await apiRequest<Asset>("/assets", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          name: assetName,
          originalKey,
          folderId: selectedFolderId && selectedFolderId !== "uncategorized" ? selectedFolderId : undefined
        })
      }, token);

      setAssetFile(null);
      setUploadProgress(null);
      await loadProject();
      setMessage("Upload started — processing will begin shortly.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadController(null);
    }
  }

  async function loadShareLinks(assetVersionId: string) {
    setShareLinks(await apiRequest<ReviewShareLink[]>(`/review/${assetVersionId}/share-links`, {}, token));
  }

  function openSharePanel(asset: Asset) {
    const version = latestVersion(asset);
    if (!version) {
      setMessage("Upload a version before sharing for review.");
      return;
    }

    setShareVersionId(version.id);
    setShareUrl("");
    setSharePanelOpen(true);
    void loadShareLinks(version.id);
  }

  async function createShareLink() {
    if (!shareVersionId) return;

    setShareLoading(true);
    setMessage("");

    try {
      const link = await apiRequest<{ token: string }>(`/review/${shareVersionId}/share-links`, {
        method: "POST",
        body: JSON.stringify({
          password: sharePassword || undefined,
          expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : undefined,
          inviteEmail: shareInviteEmail || undefined
        })
      }, token);
      setShareUrl(`${window.location.origin}/share/${link.token}`);
      setSharePassword("");
      setShareInviteEmail("");
      await loadShareLinks(shareVersionId);
      setMessage("Share link created — copy and send to reviewers.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create share link.");
    } finally {
      setShareLoading(false);
    }
  }

  async function revokeShareLink(shareLinkId: string) {
    if (!shareVersionId || !confirm("Revoke this share link?")) return;

    setShareLoading(true);
    try {
      await apiRequest(`/share-links/${shareLinkId}/revoke`, {
        method: "PATCH",
        body: JSON.stringify({ revoked: true })
      }, token);
      await loadShareLinks(shareVersionId);
      setMessage("Share link revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke share link.");
    } finally {
      setShareLoading(false);
    }
  }

  async function restoreShareLink(shareLinkId: string) {
    if (!shareVersionId) return;

    setShareLoading(true);
    try {
      await apiRequest(`/share-links/${shareLinkId}/revoke`, {
        method: "PATCH",
        body: JSON.stringify({ revoked: false })
      }, token);
      await loadShareLinks(shareVersionId);
      setMessage("Share link restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to restore share link.");
    } finally {
      setShareLoading(false);
    }
  }

  if (!project) {
    return <p className="text-frame-muted">Loading project...</p>;
  }

  return (
    <div>
      <header className="mb-4 flex flex-col gap-3 border-b border-frame-border pb-4 sm:mb-6 sm:gap-4 sm:pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Link className="text-xs text-frame-accent hover:underline sm:text-sm" href="/dashboard">
            ← All projects
          </Link>
          <h2 className="mt-1.5 text-lg font-semibold sm:mt-2 sm:text-2xl">{project.name}</h2>
          <p className="text-xs text-frame-muted sm:text-sm">{project.organization.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isAdmin ? (
            <button
              className="frame-btn-secondary"
              onClick={() => setMembersPanelOpen(!membersPanelOpen)}
              type="button"
            >
              <span className="sm:hidden">Members{projectMembers.length > 0 ? ` (${projectMembers.length})` : ""}</span>
              <span className="hidden sm:inline">Members{projectMembers.length > 0 ? ` (${projectMembers.length})` : ""}</span>
            </button>
          ) : null}
          <a className="frame-btn-primary" href="#upload">
            <span className="sm:hidden">+ Upload</span>
            <span className="hidden sm:inline">+ Upload</span>
          </a>
          <button
            className={`frame-btn-secondary !px-2 sm:!px-3 ${view === "grid" ? "border-frame-accent text-frame-accent" : ""}`}
            onClick={() => setView("grid")}
            title="Grid view"
            type="button"
          >
            <svg className="inline-block h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button
            className={`frame-btn-secondary !px-2 sm:!px-3 ${view === "list" ? "border-frame-accent text-frame-accent" : ""}`}
            onClick={() => setView("list")}
            title="List view"
            type="button"
          >
            <svg className="inline-block h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            <span className="hidden sm:inline">List</span>
          </button>
        </div>
      </header>

      {message ? (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">{message}</p>
      ) : null}

      {membersPanelOpen && isAdmin ? (
        <section className="mb-6 frame-panel p-3 sm:mb-8 sm:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-frame-muted sm:text-sm">Project members</h3>
          <p className="mt-1 text-xs text-frame-muted sm:text-sm">
            {projectMembers.length === 0
              ? "No explicit members — all organization members can see this project."
              : "Only these members (plus Owners/Admins) can access this project."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <select
              className="frame-input max-w-xs"
              value={addMemberUserId}
              onChange={(e) => setAddMemberUserId(e.target.value)}
            >
              <option value="">Select member to add…</option>
              {orgMembers
                .filter((m) => !projectMembers.some((pm) => pm.userId === m.user.id))
                .map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name || m.user.email} ({m.role})
                  </option>
                ))}
            </select>
            <button
              className="frame-btn-primary"
              disabled={!addMemberUserId}
              onClick={() => void addProjectMember()}
              type="button"
            >
              Add
            </button>
          </div>

          {projectMembers.length > 0 ? (
            <div className="mt-4 space-y-2">
              {projectMembers.map((pm) => (
                <div className="flex items-center justify-between rounded-lg border border-frame-border bg-frame-panel-elevated px-4 py-3" key={pm.id}>
                  <div>
                    <p className="text-sm font-medium">{pm.user.name || pm.user.email}</p>
                    <p className="text-xs text-frame-muted">{pm.user.email}</p>
                  </div>
                  <button
                    className="rounded-lg border border-rose-300/30 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-300/10"
                    onClick={() => void removeProjectMember(pm.userId)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mb-6 frame-panel p-3 sm:mb-8 sm:p-5" id="upload">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-frame-muted sm:text-sm">Upload for review</h3>
        <p className="mt-1 text-xs text-frame-muted sm:text-sm">
          Upload a rough cut (like Premiere&apos;s &quot;Upload active sequence&quot;) — then share a link for comments and drawings.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleUpload}>
          <label className="block text-sm text-frame-muted">
            Asset name
            <input className="frame-input mt-1" onChange={(event) => setAssetName(event.target.value)} value={assetName} />
          </label>
          <label className="block text-sm text-frame-muted">
            Video file
            <input
              accept="video/*"
              className="frame-input mt-1"
              onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <div className="md:col-span-2">
            <button className="frame-btn-primary" disabled={uploading || !assetFile} type="submit">
              {uploading ? "Uploading…" : "Upload to project"}
            </button>
            {uploadProgress !== null ? (
              <UploadProgressBar progress={uploadProgress} controller={uploadController ?? undefined} />
            ) : null}
          </div>
        </form>
      </section>

      <section className="mb-4 frame-panel p-3 sm:mb-6 sm:p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-frame-muted sm:text-sm">Folders</h3>
        <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
          <button
            className={`rounded-lg border px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm ${selectedFolderId === null ? "border-frame-accent text-frame-accent" : "border-frame-border bg-frame-panel-elevated"}`}
            onClick={() => setSelectedFolderId(null)}
            type="button"
          >
            All · {project.assets.length}
          </button>
          <button
            className={`rounded-lg border px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm ${selectedFolderId === "uncategorized" ? "border-frame-accent text-frame-accent" : "border-frame-border bg-frame-panel-elevated"}`}
            onClick={() => setSelectedFolderId("uncategorized")}
            type="button"
          >
            Uncategorized · {project.assets.filter((asset) => !asset.folderId).length}
          </button>
          {folders.map((folder) => (
            <div className="flex items-center gap-1" key={folder.id}>
              {renamingFolderId === folder.id ? (
                <form
                  className="flex gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void renameFolder(folder.id);
                  }}
                >
                  <input
                    autoFocus
                    className="frame-input !py-1 text-sm"
                    onChange={(event) => setRenameFolderValue(event.target.value)}
                    value={renameFolderValue}
                  />
                  <button className="frame-btn-secondary !px-2 !py-1 text-xs" type="submit">
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <button
                    className={`rounded-lg border px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm ${selectedFolderId === folder.id ? "border-frame-accent text-frame-accent" : "border-frame-border bg-frame-panel-elevated"}`}
                    onClick={() => setSelectedFolderId(folder.id)}
                    type="button"
                  >
                    {folder.name} · {project.assets.filter((asset) => asset.folderId === folder.id).length}
                  </button>
                  <button
                    className="rounded-lg border border-frame-border px-1.5 py-1.5 text-[11px] text-frame-muted hover:text-frame-text sm:px-2 sm:py-2 sm:text-xs"
                    onClick={() => {
                      setRenamingFolderId(folder.id);
                      setRenameFolderValue(folder.name);
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-lg border border-frame-border px-1.5 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/10 sm:px-2 sm:py-2 sm:text-xs"
                    onClick={() => void deleteFolder(folder.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={createFolder}>
            <input className="frame-input max-w-xs" value={folderName} onChange={(event) => setFolderName(event.target.value)} />
            <button className="frame-btn-secondary" type="submit">
              New folder
            </button>
          </form>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-frame-muted">Assets</h3>
          <span className="text-xs text-frame-muted">{visibleAssets.length} shown</span>
        </div>

        {project.assets.length === 0 ? (
          <div className="frame-panel flex flex-col items-center justify-center border-dashed p-6 text-center sm:p-12">
            <p className="text-base font-medium sm:text-lg">Upload your first asset</p>
            <p className="mt-2 max-w-md text-xs text-frame-muted sm:text-sm">
              Drop videos into this project, share a review link, and collect timecoded comments with drawings.
            </p>
            <a className="frame-btn-primary mt-6" href="#upload">
              Upload now
            </a>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleAssets.map((asset) => (
              <AssetGridCard
                approvalStatus={assetApprovalStatus(asset)}
                asset={asset}
                folders={folders}
                key={asset.id}
                onArchive={() => archiveAsset(asset.id)}
                onMoveToFolder={(folderId) => void moveAssetToFolder(asset.id, folderId)}
                onShare={() => openSharePanel(asset)}
                token={token}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAssets.map((asset) => {
              const latest = latestVersion(asset);
              return (
                <div className="frame-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={asset.id}>
                  <div className="min-w-0">
                    <Link className="font-medium hover:text-frame-accent" href={latest ? `/review/${latest.id}` : `/assets/${asset.id}`}>
                      {asset.name}
                    </Link>
                    <p className="text-xs text-frame-muted">
                      {asset.versions.length} versions · {approvalLabel(assetApprovalStatus(asset))}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="frame-btn-secondary !py-1.5 text-xs" onClick={() => openSharePanel(asset)} type="button">
                      Share
                    </button>
                    <Link className="frame-btn-secondary !py-1.5 text-xs" href={`/assets/${asset.id}`}>
                      Details
                    </Link>
                    {latest ? (
                      <Link className="frame-btn-primary !py-1.5 text-xs" href={`/review/${latest.id}`}>
                        Review
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ShareLinkPanel
        loading={shareLoading}
        onClose={() => setSharePanelOpen(false)}
        onCreate={() => void createShareLink()}
        onExpiresChange={setShareExpiresAt}
        onInviteChange={setShareInviteEmail}
        onPasswordChange={setSharePassword}
        onRestore={(id) => void restoreShareLink(id)}
        onRevoke={(id) => void revokeShareLink(id)}
        open={sharePanelOpen}
        shareExpiresAt={shareExpiresAt}
        shareInviteEmail={shareInviteEmail}
        shareLinks={shareLinks}
        sharePassword={sharePassword}
        shareUrl={shareUrl}
      />
    </div>
  );
}

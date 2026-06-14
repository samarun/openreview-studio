"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api";
import { useReviewEvents } from "../lib/use-review-events";
import { formatDuration } from "../lib/version-ui";
import type { Asset, AssetVersion, Project } from "../lib/types";
import type { UploadController, UploadProgress } from "../lib/upload";
import { createUploadController, uploadOriginalFile } from "../lib/upload";
import { UploadProgressBar } from "./frame/upload-progress-bar";
import { VersionStackRow } from "./frame/version-stack-row";
import { ReviewPlayer } from "./review-player";

export function AssetDetail({ assetId, token }: { assetId: string; token: string }) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadController, setUploadController] = useState<UploadController | null>(null);
  const [compareLeft, setCompareLeft] = useState("");
  const [compareRight, setCompareRight] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  async function loadAsset() {
    const nextAsset = await apiRequest<Asset & { project: Project }>(`/assets/${assetId}`, {}, token);
    setAsset(nextAsset);
    setProject(nextAsset.project);
  }

  useEffect(() => {
    loadAsset().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load asset."));
  }, [assetId, token]);

  const processingVersion = asset?.versions.find((version) => version.status === "UPLOADED" || version.status === "PROCESSING");

  useReviewEvents(
    processingVersion ? `/review/${processingVersion.id}/events` : null,
    (event) => {
      if (event.type !== "version.status") return;
      const status = event.payload as AssetVersion;
      setAsset((current) => {
        if (!current) return current;
        return {
          ...current,
          versions: current.versions.map((version) => (version.id === status.id ? { ...version, ...status } : version))
        };
      });
    },
    Boolean(processingVersion),
    token
  );

  const sortedVersions = useMemo(() => {
    if (!asset) return [];
    return [...asset.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  }, [asset]);

  const previewVersion = useMemo(() => {
    if (!asset) return null;
    if (selectedVersionId) {
      const picked = asset.versions.find((v) => v.id === selectedVersionId);
      if (picked) return picked;
    }
    return (
      sortedVersions.find((version) => version.status === "READY" && (version.proxyKey || version.hlsManifestKey)) ??
      sortedVersions[0] ??
      null
    );
  }, [asset, selectedVersionId, sortedVersions]);

  useEffect(() => {
    if (previewVersion && !selectedVersionId) {
      setSelectedVersionId(previewVersion.id);
    }
  }, [previewVersion, selectedVersionId]);

  useEffect(() => {
    if (!asset || sortedVersions.length < 2) return;
    const oldest = sortedVersions[sortedVersions.length - 1];
    const newest = sortedVersions[0];
    if (!oldest || !newest) return;
    setCompareLeft((current) => current || oldest.id);
    setCompareRight((current) => current || newest.id);
  }, [asset?.id, sortedVersions]);

  async function handleUploadVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || !asset || !versionFile) {
      setMessage("Choose a video file first.");
      return;
    }

    setLoading(true);
    setMessage("");
    const ctrl = createUploadController();
    setUploadController(ctrl);
    setUploadProgress({ percent: 0, bytesUploaded: 0, bytesTotal: versionFile.size, currentPart: null, totalParts: null, speed: null, etaSeconds: null });

    try {
      const originalKey = await uploadOriginalFile({
        apiRequest: (path, options) => apiRequest(path, options, token),
        projectId: project.id,
        file: versionFile,
        onProgress: setUploadProgress,
        controller: ctrl,
      });
      await apiRequest<AssetVersion>(`/assets/${asset.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ originalKey })
      }, token);

      setVersionFile(null);
      setUploadProgress(null);
      await loadAsset();
      setMessage("New version uploaded and queued for processing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload version.");
    } finally {
      setLoading(false);
      setUploadController(null);
    }
  }

  async function archiveVersion(versionId: string) {
    if (!confirm("Archive this version?")) return;

    setLoading(true);
    setMessage("");

    try {
      await apiRequest(`/versions/${versionId}/archive`, { method: "PATCH", body: JSON.stringify({ archived: true }) }, token);
      await loadAsset();
      setMessage("Version archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive version.");
    } finally {
      setLoading(false);
    }
  }

  if (!asset || !project) {
    return <p className="text-frame-muted">Loading asset…</p>;
  }

  const activeId = selectedVersionId ?? previewVersion?.id;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <header className="mb-6 flex flex-col gap-4 border-b border-frame-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link className="text-sm text-frame-accent hover:underline" href={`/projects/${project.id}`}>
            ← {project.name}
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold text-frame-text">{asset.name}</h1>
          <p className="mt-1 text-sm text-frame-muted">
            {sortedVersions.length} version{sortedVersions.length === 1 ? "" : "s"}
            {previewVersion?.durationSeconds ? ` · ${formatDuration(previewVersion.durationSeconds)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {sortedVersions.length >= 2 && compareLeft && compareRight ? (
            <Link
              className="frame-btn-secondary"
              href={`/review/compare?left=${compareLeft}&right=${compareRight}`}
              title="Compare two versions side by side with synced playback"
            >
              Side by side
            </Link>
          ) : null}
          {previewVersion?.status === "READY" ? (
            <Link className="frame-btn-primary" href={`/review/${previewVersion.id}`}>
              Open review
            </Link>
          ) : null}
        </div>
      </header>

      {message ? (
        <p className="mb-4 rounded-lg border border-frame-accent/30 bg-frame-accent/10 px-4 py-2 text-sm text-indigo-100">
          {message}
        </p>
      ) : null}

      <div className="grid flex-1 gap-6 md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_340px]">
        <section className="flex min-w-0 flex-col">
          <div className="frame-panel overflow-hidden bg-black p-0">
            {previewVersion && (previewVersion.proxyKey || previewVersion.hlsManifestKey) ? (
              <ReviewPlayer
                authQuery={`token=${encodeURIComponent(token)}`}
                layout="aspect"
                mediaBasePath="/media/proxies"
                mode="preview"
                version={previewVersion}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center bg-black text-frame-muted">
                {previewVersion ? "Processing this version…" : "Upload a version to get started."}
              </div>
            )}
          </div>
          {previewVersion ? (
            <p className="mt-2 text-xs text-frame-muted">
              Previewing v{previewVersion.versionNumber} · Select another version in the stack
            </p>
          ) : null}

          <div className="mt-6 frame-panel p-4">
            <h3 className="text-sm font-semibold text-frame-text">Side-by-side compare</h3>
            <p className="mt-1 text-xs text-frame-muted">
              Watch two versions next to each other with synced playback and comment overlays.
            </p>
            {sortedVersions.length >= 2 ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
                <label className="text-xs text-frame-muted">
                  Left
                  <select
                    className="frame-input mt-1"
                    value={compareLeft}
                    onChange={(event) => setCompareLeft(event.target.value)}
                  >
                    <option value="">Select</option>
                    {sortedVersions.map((version) => (
                      <option key={version.id} value={version.id}>
                        v{version.versionNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-frame-muted">
                  Right
                  <select
                    className="frame-input mt-1"
                    value={compareRight}
                    onChange={(event) => setCompareRight(event.target.value)}
                  >
                    <option value="">Select</option>
                    {sortedVersions.map((version) => (
                      <option key={version.id} value={version.id}>
                        v{version.versionNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <Link
                  className="frame-btn-secondary col-span-2 text-center sm:col-span-1"
                  href={compareLeft && compareRight ? `/review/compare?left=${compareLeft}&right=${compareRight}` : "#"}
                  onClick={(event) => {
                    if (!compareLeft || !compareRight) event.preventDefault();
                  }}
                >
                  Open side by side
                </Link>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-frame-border px-4 py-3 text-sm text-frame-muted">
                Upload another version to enable side-by-side compare.
              </p>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <form className="frame-panel p-4" onSubmit={handleUploadVersion}>
            <h3 className="text-sm font-semibold text-frame-text">Upload version</h3>
            <p className="mt-1 text-xs text-frame-muted">Add a new cut to this asset&apos;s version stack</p>
            <label className="mt-4 block">
              <span className="sr-only">Video file</span>
              <input
                className="frame-input file:mr-3 file:rounded-md file:border-0 file:bg-frame-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                type="file"
                accept="video/*"
                onChange={(event) => setVersionFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {uploadProgress !== null ? (
              <UploadProgressBar progress={uploadProgress} controller={uploadController ?? undefined} />
            ) : null}
            <button className="frame-btn-primary mt-4 w-full" disabled={loading || !versionFile} type="submit">
              Upload
            </button>
          </form>

          <div className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-frame-muted">Version stack</h3>
            <div className="space-y-2 overflow-y-auto pr-1">
              {sortedVersions.map((version, index) => {
                const olderVersion = sortedVersions[index + 1];
                const compareHref =
                  olderVersion?.status === "READY" && version.status === "READY"
                    ? `/review/compare?left=${olderVersion.id}&right=${version.id}`
                    : undefined;

                return (
                  <VersionStackRow
                    active={version.id === activeId}
                    compareHref={compareHref}
                    key={version.id}
                    loading={loading}
                    onArchive={() => archiveVersion(version.id)}
                    onSelect={() => setSelectedVersionId(version.id)}
                    version={version}
                  />
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

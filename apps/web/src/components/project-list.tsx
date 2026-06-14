"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { resolveOrganizationId } from "../lib/org";
import type { Asset, AuditLog, Project, User } from "../lib/types";
import type { UploadController, UploadProgress } from "../lib/upload";
import { createUploadController, uploadOriginalFile } from "../lib/upload";
import { UploadProgressBar } from "./frame/upload-progress-bar";

type SearchResults = { projects: Project[]; assets: Array<Asset & { project: Project }> };

function ProjectListContent({ token, user }: { token: string; user: User }) {
  const searchParams = useSearchParams();
  const searchTerm = searchParams.get("q")?.trim() ?? "";
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("New Review Project");
  const [assetName, setAssetName] = useState("Rough Cut v1");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadController, setUploadController] = useState<UploadController | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [activity, setActivity] = useState<AuditLog[]>([]);

  const organizationId = resolveOrganizationId(user.memberships ?? []);

  async function loadProjects() {
    const nextProjects = await apiRequest<Project[]>("/projects", {}, token);
    setProjects(nextProjects);
    setSelectedProjectId((current) => current || nextProjects[0]?.id || "");
  }

  useEffect(() => {
    loadProjects().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load projects."));
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    apiRequest<AuditLog[]>(`/organizations/${organizationId}/audit-logs`, {}, token)
      .then(setActivity)
      .catch(() => setActivity([]));
  }, [organizationId, token]);

  useEffect(() => {
    if (!searchTerm) {
      setSearchResults(null);
      return;
    }

    const query = new URLSearchParams({ q: searchTerm });
    if (organizationId) query.set("organizationId", organizationId);

    apiRequest<SearchResults>(`/search?${query.toString()}`, {}, token)
      .then(setSearchResults)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Search failed."));
  }, [organizationId, searchTerm, token]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const organizationId = resolveOrganizationId(user.memberships ?? []);

    if (!organizationId) {
      setMessage("Your account is not attached to an organization.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const project = await apiRequest<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName, organizationId })
      }, token);

      await loadProjects();
      setSelectedProjectId(project.id);
      setMessage("Project created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create project.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProjectId) {
      setMessage("Create or select a project first.");
      return;
    }

    setLoading(true);
    setMessage("");

    if (!assetFile) {
      setMessage("Choose a video file first.");
      setLoading(false);
      return;
    }

    const ctrl = createUploadController();
    setUploadController(ctrl);
    setUploadProgress({ percent: 0, bytesUploaded: 0, bytesTotal: assetFile.size, currentPart: null, totalParts: null, speed: null, etaSeconds: null });

    try {
      const originalKey = await uploadOriginalFile({
        apiRequest: (path, options) => apiRequest(path, options, token),
        projectId: selectedProjectId,
        file: assetFile,
        onProgress: setUploadProgress,
        controller: ctrl,
      });

      await apiRequest<Asset>("/assets", {
        method: "POST",
        body: JSON.stringify({ projectId: selectedProjectId, name: assetName, originalKey })
      }, token);

      setAssetFile(null);
      setUploadProgress(null);
      await loadProjects();
      setMessage("Asset created and queued for processing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create asset.");
    } finally {
      setLoading(false);
      setUploadController(null);
    }
  }

  async function archiveProject(projectId: string) {
    if (!confirm("Archive this project? It will be hidden from active lists.")) return;

    setLoading(true);
    setMessage("");

    try {
      await apiRequest(`/projects/${projectId}/archive`, { method: "PATCH", body: JSON.stringify({ archived: true }) }, token);
      await loadProjects();
      setMessage("Project archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive project.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-frame-muted">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold">Projects</h2>
          <p className="mt-1 text-sm text-frame-muted">Upload assets, share review links, and track approvals.</p>
        </div>
        <button className="frame-btn-secondary" onClick={() => loadProjects()} type="button">
          Refresh
        </button>
      </header>

      {message ? <p className="mb-6 rounded-lg border border-frame-accent/30 bg-frame-accent/10 px-4 py-3 text-sm text-indigo-100">{message}</p> : null}

      {searchTerm && searchResults ? (
        <section className="mb-8 frame-panel p-5">
          <h3 className="text-xl font-semibold">Search results for “{searchTerm}”</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-slate-400">Projects</p>
              <ul className="mt-2 space-y-2">
                {searchResults.projects.length === 0 ? <li className="text-sm text-slate-500">No matching projects.</li> : null}
                {searchResults.projects.map((project) => (
                  <li key={project.id}>
                    <Link className="text-cyan-200 hover:text-cyan-100" href={`/projects/${project.id}`}>
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm text-slate-400">Assets</p>
              <ul className="mt-2 space-y-2">
                {searchResults.assets.length === 0 ? <li className="text-sm text-slate-500">No matching assets.</li> : null}
                {searchResults.assets.map((asset) => (
                  <li key={asset.id}>
                    <Link className="text-cyan-200 hover:text-cyan-100" href={`/assets/${asset.id}`}>
                      {asset.name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{asset.project.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {activity.length > 0 ? (
        <section className="mb-8 frame-panel p-5">
          <h3 className="text-xl font-semibold">Recent activity</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {activity.slice(0, 8).map((entry) => (
              <li className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3" key={entry.id}>
                <span className="font-medium text-slate-100">{entry.action}</span>
                <span className="ml-2 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                {entry.actorUser ? <span className="ml-2 text-slate-400">· {entry.actorUser.name || entry.actorUser.email}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <form className="frame-panel p-5" onSubmit={handleCreateProject}>
            <h3 className="text-sm font-semibold">Create project</h3>
            <label className="mt-4 block text-sm text-frame-muted">
              Project name
              <input className="frame-input mt-2" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            </label>
            <button className="frame-btn-primary mt-4 w-full" disabled={loading} type="submit">
              Create project
            </button>
          </form>

          <form className="frame-panel p-5" onSubmit={handleCreateAsset}>
            <h3 className="text-sm font-semibold">Upload asset</h3>
            <p className="mt-1 text-xs text-frame-muted">Upload video to your project workspace</p>
            <label className="mt-4 block text-sm text-frame-muted">
              Project
              <select className="frame-input mt-2" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm text-frame-muted">
              Asset name
              <input className="frame-input mt-2" value={assetName} onChange={(event) => setAssetName(event.target.value)} />
            </label>
            <label className="mt-4 block text-sm text-frame-muted">
              Video file
              <input className="frame-input mt-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-frame-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" type="file" accept="video/*" onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)} />
            </label>
            {uploadProgress !== null ? (
              <UploadProgressBar progress={uploadProgress} controller={uploadController ?? undefined} />
            ) : null}
            <button className="frame-btn-primary mt-4 w-full" disabled={loading || projects.length === 0} type="submit">
              Upload
            </button>
          </form>
        </aside>

        <section className="frame-panel p-5">
          <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-frame-muted">Projects</h3>
          {projects.length === 0 ? <div className="rounded-lg border border-dashed border-frame-border p-8 text-center text-frame-muted">No projects yet.</div> : null}
          <div className="space-y-4">
            {projects.map((project) => (
              <article className="frame-panel p-5" key={project.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <Link className="text-lg font-semibold hover:text-frame-accent" href={`/projects/${project.id}`}>{project.name}</Link>
                    <p className="text-sm text-frame-muted">{project.organization.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-sm text-slate-300">{project.assets.length} assets</span>
                    <button className="rounded-lg border border-rose-300/30 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-300/10" disabled={loading} onClick={() => archiveProject(project.id)} type="button">Archive</button>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {project.assets.map((asset) => (
                    <Link className="rounded-lg border border-frame-border bg-frame-panel-elevated px-4 py-3 text-sm text-frame-text hover:border-frame-accent/40" href={`/assets/${asset.id}`} key={asset.id}>
                      {asset.name} · {asset.versions.length} version{asset.versions.length === 1 ? "" : "s"}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProjectList(props: { token: string; user: User }) {
  return (
    <Suspense fallback={<p className="text-slate-400">Loading dashboard...</p>}>
      <ProjectListContent {...props} />
    </Suspense>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { setAuthToken } from "../lib/auth";
import { resolveOrganizationId } from "../lib/org";
import type { OrganizationShareLink, User } from "../lib/types";

type Member = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";
  user: { id: string; email: string; name: string | null };
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actorUser: { id: string; email: string; name: string | null } | null;
};

export function SettingsPanel({ token, user }: { token: string; user: User }) {
  const organizationId = resolveOrganizationId(user.memberships ?? []);
  const [members, setMembers] = useState<Member[]>([]);
  const [profileName, setProfileName] = useState(user.name ?? "");
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "REVIEWER">("MEMBER");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [shareLinks, setShareLinks] = useState<OrganizationShareLink[]>([]);
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#67e8f9");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const currentOrganization = user.memberships?.find((membership) => membership.organization.id === organizationId)?.organization;

  async function loadMembers() {
    if (!organizationId) return;
    setMembers(await apiRequest<Member[]>(`/organizations/${organizationId}/members`, {}, token));
  }

  async function loadAuditLogs() {
    if (!organizationId) return;
    setAuditLogs(await apiRequest<AuditLog[]>(`/organizations/${organizationId}/audit-logs`, {}, token));
  }

  async function loadShareLinks() {
    if (!organizationId) return;
    setShareLinks(await apiRequest<OrganizationShareLink[]>(`/organizations/${organizationId}/share-links`, {}, token));
  }

  useEffect(() => {
    loadMembers().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load members."));
    loadAuditLogs().catch(() => undefined);
    loadShareLinks().catch(() => undefined);
  }, [organizationId, token]);

  useEffect(() => {
    if (!currentOrganization) return;
    setBrandName(currentOrganization.name);
    setLogoUrl(currentOrganization.logoUrl ?? "");
    setBrandColor(currentOrganization.brandColor ?? "#67e8f9");
  }, [currentOrganization?.id]);

  async function updateBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;

    setLoading(true);
    setMessage("");

    try {
      await apiRequest(`/organizations/${organizationId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: brandName,
          logoUrl: logoUrl.trim() || null,
          brandColor: brandColor || null
        })
      }, token);
      setMessage("Organization branding updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update branding.");
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const result = await apiRequest<{ token: string; user: Pick<User, "id" | "email" | "name"> }>("/me", {
        method: "PATCH",
        body: JSON.stringify({ name: profileName.trim() || null, email: profileEmail })
      }, token);
      setAuthToken(result.token);
      setProfileName(result.user.name ?? "");
      setProfileEmail(result.user.email);
      setMessage("Profile updated. Refreshing the page will show the updated shell identity.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update profile.");
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await apiRequest("/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      }, token);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setLoading(false);
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;

    try {
      setLoading(true);
      await apiRequest(`/organizations/${organizationId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, name: inviteName || undefined, role: inviteRole })
      }, token);
      setInviteEmail("");
      setInviteName("");
      await loadMembers();
      await loadAuditLogs();
      setMessage("Member invited.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite member.");
    } finally {
      setLoading(false);
    }
  }

  async function updateRole(member: Member, role: Member["role"]) {
    if (!organizationId || member.role === role) return;

    setLoading(true);
    setMessage("");

    try {
      await apiRequest(`/organizations/${organizationId}/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role })
      }, token);
      await loadMembers();
      await loadAuditLogs();
      setMessage("Member role updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update member role.");
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(member: Member) {
    if (!organizationId || !confirm(`Remove ${member.user.email} from this organization?`)) return;

    setLoading(true);
    setMessage("");

    try {
      await apiRequest(`/organizations/${organizationId}/members/${member.id}`, { method: "DELETE" }, token);
      await loadMembers();
      await loadAuditLogs();
      setMessage("Member removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove member.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Administration</p>
        <h2 className="mt-2 text-3xl font-semibold">Settings</h2>
        <p className="mt-1 text-slate-400">Workspace settings and organization details.</p>
      </header>

      {message ? <p className="mb-6 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">{message}</p> : null}

      <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-xl font-semibold">Share page branding</h3>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={updateBranding}>
          <label className="block text-sm text-slate-300 md:col-span-2">
            Organization name
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" value={brandName} onChange={(event) => setBrandName(event.target.value)} />
          </label>
          <label className="block text-sm text-slate-300 md:col-span-2">
            Logo URL
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} />
          </label>
          <label className="block text-sm text-slate-300">
            Brand color
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} />
          </label>
          <div className="flex items-end">
            <button className="rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60" disabled={loading} type="submit">Save branding</button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-xl font-semibold">Account</h3>
          <form className="mt-4 space-y-3" onSubmit={updateProfile}>
            <label className="block text-sm text-slate-300">
              Name
              <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </label>
            <label className="block text-sm text-slate-300">
              Email
              <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2" type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
            </label>
            <button className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60" disabled={loading || !profileEmail} type="submit">Update profile</button>
          </form>
          <form className="mt-6 space-y-3 border-t border-white/10 pt-5" onSubmit={changePassword}>
            <h4 className="font-semibold">Change password</h4>
            <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2" placeholder="Current password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            <input className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2" minLength={8} placeholder="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <button className="w-full rounded-xl border border-white/15 px-4 py-3 font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-60" disabled={loading || !currentPassword || newPassword.length < 8} type="submit">Change password</button>
          </form>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-xl font-semibold">Organizations</h3>
          <div className="mt-4 space-y-3">
            {user.memberships?.map((membership) => (
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4" key={membership.organization.id}>
                <p className="font-medium">{membership.organization.name}</p>
                <p className="mt-1 text-sm text-slate-400">{membership.organization.slug}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
          <h3 className="text-xl font-semibold">Members</h3>
          <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_160px_auto]" onSubmit={inviteMember}>
            <input className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2" placeholder="Email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            <input className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2" placeholder="Name optional" value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            <select className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "ADMIN" | "MEMBER" | "REVIEWER")}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="REVIEWER">Reviewer</option>
            </select>
            <button className="rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60" disabled={loading || !inviteEmail} type="submit">Invite</button>
          </form>
          <div className="mt-5 space-y-3">
            {members.map((member) => (
              <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4 md:flex-row md:items-center md:justify-between" key={member.id}>
                <div>
                  <p className="font-medium">{member.user.name || member.user.email}</p>
                  <p className="text-sm text-slate-400">{member.user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-cyan-300 focus:ring-2" disabled={loading} value={member.role} onChange={(event) => updateRole(member, event.target.value as Member["role"])}>
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="REVIEWER">Reviewer</option>
                  </select>
                  <button className="rounded-xl border border-rose-300/30 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-300/10 disabled:opacity-60" disabled={loading} onClick={() => removeMember(member)} type="button">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Share links</h3>
              <p className="mt-1 text-sm text-slate-400">Recent review links across projects in this organization.</p>
            </div>
            <button className="rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-200 hover:bg-white/10" onClick={() => loadShareLinks().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load share links."))} type="button">Refresh</button>
          </div>
          <div className="mt-5 space-y-3">
            {shareLinks.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-slate-400">No share links yet.</p> : null}
            {shareLinks.map((link) => (
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4" key={link.id}>
                <p className="font-medium text-slate-100">
                  {link.projectName}
                  {link.assetName ? ` · ${link.assetName}` : ""}
                  {link.versionNumber ? ` · v${link.versionNumber}` : ""}
                </p>
                <p className="mt-1 truncate text-sm text-cyan-200">
                  {typeof window === "undefined" ? `/share/${link.token}` : `${window.location.origin}/share/${link.token}`}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {link.passwordProtected ? "Password protected" : "Open"} · {link.revokedAt ? "Revoked" : link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleString()}` : "No expiry"}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Audit log</h3>
              <p className="mt-1 text-sm text-slate-400">Recent administrative and review activity.</p>
            </div>
            <button className="rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-200 hover:bg-white/10" onClick={() => loadAuditLogs().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load audit logs."))} type="button">Refresh</button>
          </div>
          <div className="mt-5 space-y-3">
            {auditLogs.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-slate-400">No audit events available.</p> : null}
            {auditLogs.map((entry) => (
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4" key={entry.id}>
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <p className="font-medium text-slate-100">{entry.action}</p>
                  <time className="text-sm text-slate-500">{new Date(entry.createdAt).toLocaleString()}</time>
                </div>
                <p className="mt-1 text-sm text-slate-400">{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}</p>
                <p className="mt-1 text-sm text-slate-500">Actor: {entry.actorUser?.name || entry.actorUser?.email || "System"}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

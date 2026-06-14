const ORG_STORAGE_KEY = "openreview.selectedOrganizationId";

export function getSelectedOrganizationId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ORG_STORAGE_KEY);
}

export function setSelectedOrganizationId(organizationId: string) {
  localStorage.setItem(ORG_STORAGE_KEY, organizationId);
}

export function resolveOrganizationId(memberships: Array<{ organization: { id: string } }>) {
  const stored = getSelectedOrganizationId();
  if (stored && memberships.some((membership) => membership.organization.id === stored)) {
    return stored;
  }

  const first = memberships[0]?.organization.id;
  if (first) setSelectedOrganizationId(first);
  return first ?? null;
}

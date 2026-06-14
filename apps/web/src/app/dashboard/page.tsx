"use client";

import { AuthGate } from "../../components/auth-gate";
import { ProjectList } from "../../components/project-list";

export default function DashboardPage() {
  return <AuthGate>{(token, user) => <ProjectList token={token} user={user} />}</AuthGate>;
}

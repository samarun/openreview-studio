"use client";

import { useParams } from "next/navigation";
import { AuthGate } from "../../../components/auth-gate";
import { ProjectDetail } from "../../../components/project-detail";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();

  return <AuthGate>{(token, user) => <ProjectDetail projectId={params.projectId} token={token} user={user} />}</AuthGate>;
}

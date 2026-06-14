"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AuthGate } from "../../../components/auth-gate";
import { ReviewPanel } from "../../../components/review-panel";

function ReviewPageContent() {
  const params = useParams<{ assetVersionId: string }>();
  const searchParams = useSearchParams();
  const presenterMode = searchParams.get("presenter") === "1";

  return (
    <AuthGate bare>
      {(token) => (
        <ReviewPanel assetVersionId={params.assetVersionId} presenterMode={presenterMode} token={token} />
      )}
    </AuthGate>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-black text-slate-300">Loading review...</main>}>
      <ReviewPageContent />
    </Suspense>
  );
}

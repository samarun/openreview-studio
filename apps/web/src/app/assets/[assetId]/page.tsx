"use client";

import { useParams } from "next/navigation";
import { AssetDetail } from "../../../components/asset-detail";
import { AuthGate } from "../../../components/auth-gate";

export default function AssetPage() {
  const params = useParams<{ assetId: string }>();

  return <AuthGate>{(token) => <AssetDetail assetId={params.assetId} token={token} />}</AuthGate>;
}

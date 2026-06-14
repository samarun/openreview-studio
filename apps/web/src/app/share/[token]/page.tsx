"use client";

import { useParams } from "next/navigation";
import { PublicShareReview } from "../../../components/public-share-review";

export default function SharePage() {
  const params = useParams<{ token: string }>();

  return <PublicShareReview token={params.token} />;
}

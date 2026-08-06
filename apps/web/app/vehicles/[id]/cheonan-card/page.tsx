"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageLoader } from "../../../../components/PageLoader";

/** 북마크·이전 링크 호환: /cheonan-card → /stations?tab=cheonan */
export default function CheonanCardRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/vehicles/${params.id}/stations?tab=cheonan`);
  }, [params.id, router]);

  return <PageLoader />;
}

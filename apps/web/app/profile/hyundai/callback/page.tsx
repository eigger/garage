"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { PageLoader } from "../../../../components/PageLoader";

// 현대 로그인(1단계)과 개인정보 제공 동의(2단계) 둘 다 이 페이지로 돌아온다 —
// 로그인은 ?code=&state=, 동의는 ?userId=&state=로 구분된다. 둘 다 서버 API를
// 호출해 마무리한 뒤 /profile로 돌아가 결과를 토스트로 보여준다.
export default function HyundaiCallbackPage() {
  return (
    <Suspense fallback={null}>
      <HyundaiCallbackInner />
    </Suspense>
  );
}

function HyundaiCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useSettings();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const code = searchParams.get("code");
      const userId = searchParams.get("userId");
      const state = searchParams.get("state");
      const errCode = searchParams.get("errCode");

      if (errCode) {
        router.replace("/profile?hyundai=error");
        return;
      }

      if (code) {
        const redirectUri = `${window.location.origin}/profile/hyundai/callback`;
        const res = await apiFetch("/api/hyundai/link", {
          method: "POST",
          body: JSON.stringify({ code, redirectUri }),
        });
        router.replace(res.ok ? "/profile?hyundai=linked" : "/profile?hyundai=error");
        return;
      }

      if (userId && state) {
        const res = await apiFetch("/api/hyundai/consent/complete", {
          method: "POST",
          body: JSON.stringify({ userId, state }),
        });
        router.replace(res.ok ? "/profile?hyundai=consented" : "/profile?hyundai=error");
        return;
      }

      router.replace("/profile?hyundai=error");
    })();
  }, [searchParams, router]);

  return <PageLoader label={t("hyundaiLinking")} />;
}

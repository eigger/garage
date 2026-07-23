import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { loadScript } from "./loadSdk";

// history 페이지가 트립마다 동시에(await 없이) reverseGeocode -> loadKakaoMaps -> loadScript를
// 호출하면서, 두 번째 이후 호출이 "스크립트 태그가 이미 DOM에 있다"는 것만 보고 아직 로드가
// 끝나지 않은 스크립트를 로드 완료로 착각해 곧장 통과시키던 버그를 재현/검증한다.
type FakeScript = {
  id: string;
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove: () => void;
};

function installFakeDom() {
  const created: FakeScript[] = [];
  const elements = new Map<string, FakeScript>();

  (globalThis as unknown as { document: unknown }).document = {
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: (_tag: string) => {
      const el: FakeScript = {
        id: "",
        src: "",
        onload: null,
        onerror: null,
        remove: () => elements.delete(el.id),
      };
      created.push(el);
      return el;
    },
    head: {
      appendChild: (el: FakeScript) => {
        elements.set(el.id, el);
      },
    },
  };

  return created;
}

describe("loadScript concurrent-call dedupe", () => {
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = originalDocument;
  });

  it("shares one in-flight promise across concurrent calls and doesn't resolve until the real onload fires", async () => {
    const created = installFakeDom();

    let resolved1 = false;
    let resolved2 = false;
    const p1 = loadScript("https://example.com/sdk.js", "concurrent-sdk").then(() => {
      resolved1 = true;
    });
    // second caller arrives before the first script has actually finished loading —
    // this is exactly what happens when multiple trip cards geocode at once.
    const p2 = loadScript("https://example.com/sdk.js", "concurrent-sdk").then(() => {
      resolved2 = true;
    });

    // only one <script> tag should ever be created for this id
    expect(created.length).toBe(1);

    // let any pending microtasks flush — neither call should have resolved yet,
    // because the real script hasn't loaded
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved1).toBe(false);
    expect(resolved2).toBe(false);

    created[0].onload?.();
    await p1;
    await p2;
    expect(resolved1).toBe(true);
    expect(resolved2).toBe(true);
  });

  it("clears the cache on error so a later call can retry", async () => {
    const created = installFakeDom();

    await expect(
      (async () => {
        const p = loadScript("https://example.com/sdk.js", "retry-sdk");
        created[0].onerror?.();
        await p;
      })(),
    ).rejects.toThrow();

    // a fresh attempt after the failure should create a new script tag, not reuse a dead promise
    const p2 = loadScript("https://example.com/sdk.js", "retry-sdk");
    expect(created.length).toBe(2);
    created[1].onload?.();
    await expect(p2).resolves.toBeUndefined();
  });
});

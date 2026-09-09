import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { linkOrCopy } from "./backup.js";

/**
 * 백업 작업 디렉터리는 UPLOAD_DIR 안이라 늘 같은 파일시스템이다. 복사하면 백업 한 번이
 * 원본만큼의 디스크를 더 먹는다 — 사진이 쌓인 인스턴스에서 그게 그대로 문제가 된다.
 */
describe("linkOrCopy", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garage-backup-"));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("links instead of copying the bytes", async () => {
    const source = path.join(dir, "receipt.jpg");
    const dest = path.join(dir, "staged.jpg");
    await writeFile(source, "receipt-bytes");

    await linkOrCopy(source, dest);

    const a = await stat(source);
    const b = await stat(dest);
    expect(b.ino).toBe(a.ino);
    expect(b.nlink).toBe(2);
    expect(await readFile(dest, "utf8")).toBe("receipt-bytes");
  });

  // 링크가 안 되는 환경에서도 백업은 돼야 한다 — 자리가 이미 차 있으면 link는 실패한다
  it("falls back to copying when the link cannot be made", async () => {
    const source = path.join(dir, "receipt.jpg");
    const dest = path.join(dir, "taken.jpg");
    await writeFile(source, "receipt-bytes");
    await writeFile(dest, "something-else");

    await linkOrCopy(source, dest);

    expect(await readFile(dest, "utf8")).toBe("receipt-bytes");
    const b = await stat(dest);
    expect(b.nlink).toBe(1);
  });
});

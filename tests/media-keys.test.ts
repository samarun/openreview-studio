import assert from "node:assert/strict";
import { test } from "node:test";
import {
  keysMatchProxyStorage,
  proxyStorageKeyCandidates,
  resolveProxyStorageKey
} from "../apps/api/src/lib/utils.ts";

test("proxyStorageKeyCandidates includes legacy and normalized keys", () => {
  assert.deepEqual(proxyStorageKeyCandidates("demo/rough-cut.mp4"), [
    "demo/rough-cut.mp4",
    "proxies/demo/rough-cut.mp4"
  ]);
  assert.deepEqual(proxyStorageKeyCandidates("proxies/demo/rough-cut.mp4"), [
    "proxies/demo/rough-cut.mp4",
    "demo/rough-cut.mp4"
  ]);
});

test("resolveProxyStorageKey returns the stored key", () => {
  const version = {
    proxyKey: "proxies/demo/rough-cut.mp4",
    hlsManifestKey: "proxies/demo/rough-cut/index.m3u8",
    thumbnailKey: "proxies/demo/rough-cut/thumb.jpg"
  };

  assert.equal(resolveProxyStorageKey(version, "demo/rough-cut.mp4"), "proxies/demo/rough-cut.mp4");
  assert.equal(resolveProxyStorageKey(version, "demo/rough-cut/thumb.jpg"), "proxies/demo/rough-cut/thumb.jpg");
  assert.ok(keysMatchProxyStorage(version.proxyKey, "demo/rough-cut.mp4"));
});

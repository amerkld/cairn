import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";

// jsdom lacks ResizeObserver; cmdk (and Radix in some cases) calls it. A
// no-op implementation is enough — tests don't exercise reactive sizing.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom doesn't implement Element.scrollIntoView; cmdk calls it when the
// active item changes. Stub as a no-op.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {
    /* no-op in jsdom */
  };
}

// jsdom's Blob/File lacks arrayBuffer; polyfill via FileReader (which jsdom does
// implement). `Response(blob)` would be simpler but jsdom's Blob is missing
// `.stream()`, which the Response constructor needs.
const polyfillArrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsArrayBuffer(this);
  });
};
if (typeof Blob !== "undefined") {
  Blob.prototype.arrayBuffer = polyfillArrayBuffer;
}
if (typeof File !== "undefined") {
  File.prototype.arrayBuffer = polyfillArrayBuffer;
}

// Ensure every test starts with a clean Tauri IPC surface; individual tests
// register per-command handlers with mockIPC.
beforeEach(() => {
  mockIPC(() => {
    throw new Error(
      "Unmocked Tauri invoke. Register a handler with mockIPC before calling.",
    );
  });
});

afterEach(() => {
  cleanup();
  clearMocks();
  vi.restoreAllMocks();
});

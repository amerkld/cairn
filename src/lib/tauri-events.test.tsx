import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTrayNavigate, type TrayNavigatePayload } from "./tauri-events";

// Capture the callback registered via `listen` so the test can drive it
// synchronously. Mocking `@tauri-apps/api/event` at the module level keeps
// tests from depending on Tauri's internal event-plugin wiring.
let registeredHandler:
  | ((event: { payload: TrayNavigatePayload; id: number; event: string }) => void)
  | null = null;
const unlistenSpy = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, handler: (evt: unknown) => void) => {
    registeredHandler = handler as typeof registeredHandler;
    return unlistenSpy;
  }),
}));

beforeEach(() => {
  registeredHandler = null;
  unlistenSpy.mockClear();
});

describe("useTrayNavigate", () => {
  it("subscribes to tray:navigate and forwards the payload", async () => {
    const calls: TrayNavigatePayload[] = [];
    const handler = (payload: TrayNavigatePayload) => calls.push(payload);

    renderHook(() => useTrayNavigate(handler));

    // Wait for the async listen() promise to resolve and register the callback.
    await waitFor(() => expect(registeredHandler).not.toBeNull());

    registeredHandler!({
      id: 1,
      event: "tray:navigate",
      payload: { target: "captures" },
    });
    registeredHandler!({
      id: 2,
      event: "tray:navigate",
      payload: { target: "project", path: "/vault/Projects/Alpha" },
    });

    expect(calls).toEqual([
      { target: "captures" },
      { target: "project", path: "/vault/Projects/Alpha" },
    ]);
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() => useTrayNavigate(() => undefined));
    await waitFor(() => expect(registeredHandler).not.toBeNull());
    unmount();
    await waitFor(() => expect(unlistenSpy).toHaveBeenCalledTimes(1));
  });
});

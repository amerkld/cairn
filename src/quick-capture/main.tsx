/**
 * Entry point for the floating Quick Capture window. Intentionally minimal:
 * a QueryClient, a ReactDOM root, and the page. Do not import AppShell,
 * routing, the watcher, or anything else that belongs to the main window —
 * this tree should stay lightweight so the window can open instantly.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickCapturePage } from "./QuickCapturePage";
import "../index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <QuickCapturePage />
    </QueryClientProvider>
  </React.StrictMode>,
);

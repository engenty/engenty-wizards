import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { PublicApp, StudioApp } from "./App";
import { BASE, STUDIO } from "./lib/base";
import "./lib/theme";
import "./styles/app.css";

// The desktop app's window is marked: there, what can be clicked keeps the arrow, as apps do.
if ("engentyDesktop" in window) {
  document.documentElement.dataset.desktop = "";
}

// The studio has its own router below `/studio`; the public pages (`/w`, `/s`) have theirs at the
// root. A page never moves from one to the other without loading.
const path = window.location.pathname;
const studio = path === STUDIO || path.startsWith(`${STUDIO}/`);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={studio ? STUDIO : BASE}>
        {studio ? <StudioApp /> : <PublicApp />}
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

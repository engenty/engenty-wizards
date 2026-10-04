import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { BASE } from "./lib/base";
import "./lib/theme";
import "./styles/app.css";

// The desktop app's window is marked: there, what can be clicked keeps the arrow, as apps do.
if ("engentyDesktop" in window) {
  document.documentElement.dataset.desktop = "";
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={BASE}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

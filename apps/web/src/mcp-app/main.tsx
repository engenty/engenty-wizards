import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/app.css";
import { t } from "../lib/i18n";
import { Fallback, FlowApp } from "./FlowApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fallback
      fallback={
        <p className="p-4 text-ink-2 text-sm" style={{ minHeight: 120 }}>
          {t("flowApp.broken")}
        </p>
      }
    >
      <FlowApp />
    </Fallback>
  </StrictMode>,
);

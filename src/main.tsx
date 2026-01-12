import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "./components/theme-provider";
import { SettingsProvider } from "./components/settings-provider";
import "./lib/i18n";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <SettingsProvider>
        <BrowserRouter>
          <App />
          <Toaster />
        </BrowserRouter>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

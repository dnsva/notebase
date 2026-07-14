// notebase web — entry point. Wires up routing (hash-based: zero GitHub
// Pages configuration) and app-wide data, then mounts the shell.
import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AppDataProvider } from "./data/appData.jsx";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </HashRouter>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App.jsx";
import { initTheme } from "./hooks/useTheme";

function syncAppViewportHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
}

syncAppViewportHeight();
initTheme();
window.addEventListener("resize", syncAppViewportHeight);
window.addEventListener("orientationchange", syncAppViewportHeight);
window.visualViewport?.addEventListener("resize", syncAppViewportHeight);
window.visualViewport?.addEventListener("scroll", syncAppViewportHeight);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

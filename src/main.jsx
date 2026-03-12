import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GardenCalendar from "./GardenCalendar.jsx";

window.__VITE_PROXY_URL__ = import.meta.env.VITE_PROXY_URL || "";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GardenCalendar />
  </StrictMode>
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GardenCalendar from "./GardenCalendar.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GardenCalendar />
  </StrictMode>
);

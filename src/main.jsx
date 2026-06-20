import React from "react";
import { createRoot } from "react-dom/client";
import VerdantGrid from "./VerdantGrid.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <VerdantGrid />
  </React.StrictMode>
);

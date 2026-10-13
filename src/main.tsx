import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { browserPath } from "./lib/router";
import "./styles/global.css";
import "./styles/calendar.css";
import "./styles/gallery.css";
import "./styles/effects.css";
import "./styles/navigation.css";
import "./styles/themes.css";
import "./styles/private-gallery.css";
import "./styles/gallery-collections.css";
import "./styles/gallery-admin.css";
import "./styles/visitors.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App initialPath={root.dataset.prerenderedPath ?? browserPath()} />
  </StrictMode>
);
if (root.children.length) hydrateRoot(root, app);
else createRoot(root).render(app);

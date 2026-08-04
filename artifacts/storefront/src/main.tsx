import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Palette generated from BRAND_COLOR_* / BRAND_FONT_* env; loaded after
// index.css so it overrides the fallback :root block declared there.
import "virtual:brand-palette.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

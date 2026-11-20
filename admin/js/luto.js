// Lazo negro sobre el logo del panel: solo lo ve la persona a la que se le concedió una excepcionalidad de
// actividad por el fallecimiento de un familiar, durante 48 h (GET /api/me/luto). Nadie más lo ve.
(function () {
  "use strict";
  const LAZO_SVG = "<svg class=\"luto-lazo\" viewBox=\"1 -3 30 49\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"lutoG\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3a3a41\"/><stop offset=\"1\" stop-color=\"#060607\"/></linearGradient></defs><g fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g stroke=\"#fff\" stroke-width=\"7.4\" opacity=\".96\"><path d=\"M16 22C6 14 4.5 5.5 10 3 13.5 1.4 16 4.4 16 7.6 16 4.4 18.5 1.4 22 3 27.5 5.5 26 14 16 22Z\"/><path d=\"M16 22C14 29 11.5 35 9 41\"/><path d=\"M16 22C18 29 20.5 35 23 41\"/></g><g stroke=\"url(#lutoG)\" stroke-width=\"4.6\"><path d=\"M16 22C6 14 4.5 5.5 10 3 13.5 1.4 16 4.4 16 7.6 16 4.4 18.5 1.4 22 3 27.5 5.5 26 14 16 22Z\"/><path d=\"M16 22C14 29 11.5 35 9 41\"/><path d=\"M16 22C18 29 20.5 35 23 41\"/></g><path d=\"M9.4 5.2C7.6 7.6 8.2 12 12.4 16.2\" stroke=\"#fff\" stroke-opacity=\".3\" stroke-width=\"1\"/></g></svg>";
  const LAZO_CSS = ".luto-logo{position:relative;display:inline-flex;flex:none}.luto-lazo{position:absolute;left:-14px;bottom:-14px;width:58%;min-width:20px;max-width:40px;height:auto;transform:scaleX(-1) rotate(12deg);transform-origin:50% 60%;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));pointer-events:none;animation:lutoEntra .7s cubic-bezier(.2,.9,.3,1.2) both}@keyframes lutoEntra{from{opacity:0;transform:scaleX(-1) rotate(12deg) translateY(-6px) scale(.6)}to{opacity:1;transform:scaleX(-1) rotate(12deg) translateY(0) scale(1)}}@media(prefers-reduced-motion:reduce){.luto-lazo{animation:none}}";
  async function pintar() {
    try {
      if (typeof apiFetch !== "function") return;
      const r = await apiFetch("/api/me/luto");
      if (!r || !r.luto) return;
      const img = document.querySelector(".brand-admin img");
      if (!img || img.parentNode.classList.contains("luto-logo")) return;
      if (!document.getElementById("lutoCss")) {
        const st = document.createElement("style");
        st.id = "lutoCss";
        st.textContent = LAZO_CSS;
        document.head.appendChild(st);
      }
      const w = document.createElement("span");
      w.className = "luto-logo";
      w.title = "Un abrazo muy fuerte de parte de todo el equipo";
      img.parentNode.insertBefore(w, img);
      w.appendChild(img);
      w.insertAdjacentHTML("beforeend", LAZO_SVG);
    } catch (e) { /* sin lazo */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar); else pintar();
})();

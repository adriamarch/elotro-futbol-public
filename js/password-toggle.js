// Añade un botón de "ojo" a todos los campos de contraseña de la página
// para poder ver/ocultar lo que se ha escrito, sin tener que tocar cada
// formulario uno por uno: basta con incluir este script y llamar a
// inicializarTogglesPassword() después de que el HTML del formulario ya
// esté en el DOM (funciona tanto con inputs que ya estaban en la página
// como con los que se generan luego, por eso se puede llamar más de una
// vez sin problema: los campos ya envueltos se ignoran).
function inicializarTogglesPassword(raiz = document) {
  raiz.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.toggleOjo) return; // ya tiene el ojito, no se duplica
    input.dataset.toggleOjo = "1";

    const wrap = document.createElement("div");
    wrap.className = "campo-password-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-toggle-password";
    btn.setAttribute("aria-label", "Mostrar contraseña");
    btn.tabIndex = -1; // no interrumpe el tabulado entre campos del formulario
    btn.innerHTML = iconoOjo(false);
    wrap.appendChild(btn);

    btn.addEventListener("click", () => {
      const verla = input.type === "password";
      input.type = verla ? "text" : "password";
      btn.innerHTML = iconoOjo(verla);
      btn.classList.toggle("mostrando", verla);
      btn.setAttribute("aria-label", verla ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  });
}

function iconoOjo(abierto) {
  return abierto
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a15.6 15.6 0 0 1-3.4 4.3M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.4 0 2.7-.3 3.8-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
}

document.addEventListener("DOMContentLoaded", () => inicializarTogglesPassword());

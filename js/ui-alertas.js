(function(){if(window.EOF&&window.EOF._alertasCargadas)return;const b={exito:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',error:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="9"/></svg>',pregunta:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 9a2.5 2.5 0 0 1 4.9.75c0 1.5-2.15 2.1-2.4 3.4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'};function k(){if(document.getElementById("eof-alertas-css"))return;const e=document.createElement("style");e.id="eof-alertas-css",e.textContent=`
.eof-toast-contenedor{position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column-reverse;gap:10px;max-width:360px;width:calc(100% - 40px);pointer-events:none;}
.eof-toast{pointer-events:auto;background:var(--tarjeta,#fff);border-radius:var(--radio,8px);box-shadow:var(--sombra,0 4px 18px rgba(12,27,46,.18));padding:13px 14px;display:flex;align-items:flex-start;gap:10px;border-left:4px solid var(--celeste,#5bb8e8);font-family:var(--font-text,Arial,sans-serif);font-size:.87rem;color:var(--texto,#1a1c22);transform:translateX(120%);opacity:0;transition:transform .3s ease,opacity .3s ease;}
.eof-toast-visible{transform:translateX(0);opacity:1;}
.eof-toast-saliendo{opacity:0;transform:translateX(30px);}
.eof-toast-exito{border-left-color:#1c8a4b;}
.eof-toast-error{border-left-color:var(--rojo,#d1132e);}
.eof-toast-info{border-left-color:var(--celeste,#5bb8e8);}
.eof-toast-icono{width:19px;height:19px;flex-shrink:0;margin-top:1px;}
.eof-toast-icono svg{width:100%;height:100%;}
.eof-toast-exito .eof-toast-icono{color:#1c8a4b;}
.eof-toast-error .eof-toast-icono{color:var(--rojo,#d1132e);}
.eof-toast-info .eof-toast-icono{color:var(--celeste,#5bb8e8);}
.eof-toast-texto{flex:1;line-height:1.42;padding-top:1px;}
.eof-toast-cerrar{background:none;border:none;font-size:1.15rem;line-height:.8;color:#9aa0ab;cursor:pointer;padding:0 0 0 4px;}
.eof-toast-cerrar:hover{color:var(--marino,#0c1b2e);}
.eof-modal-overlay{position:fixed;inset:0;background:rgba(8,16,28,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:100000;padding:20px;opacity:0;transition:opacity .18s ease;overscroll-behavior:contain;}
.eof-modal-overlay.eof-modal-visible{opacity:1;}
.eof-modal-caja{position:relative;background:var(--tarjeta,#fff);color:var(--texto,#0c1b2e);border-radius:18px;box-shadow:0 28px 70px rgba(8,16,28,.4),0 0 0 1px rgba(127,127,127,.14);max-width:420px;width:100%;max-height:90vh;max-height:90dvh;overflow-y:auto;overscroll-behavior:contain;padding:30px 26px 24px;text-align:center;transform:translateY(8px) scale(.96);transition:transform .2s cubic-bezier(.2,.8,.2,1);font-family:var(--font-text,Arial,sans-serif);}
.eof-modal-caja::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--rojo,#d1132e),var(--celeste,#5bb8e8));border-radius:18px 18px 0 0;pointer-events:none;}
.eof-modal-overlay.eof-modal-visible .eof-modal-caja{transform:none;}
.eof-modal-icono{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;}
.eof-modal-icono svg{width:26px;height:26px;}
.eof-modal-icono-info,.eof-modal-icono-pregunta{background:#e6f4fb;color:var(--celeste,#5bb8e8);box-shadow:0 0 0 6px rgba(91,184,232,.1);}
.eof-modal-icono-error{background:#fbe7ea;color:var(--rojo,#d1132e);box-shadow:0 0 0 6px rgba(209,19,46,.08);}
.eof-modal-icono-exito{background:#e5f5ec;color:#1c8a4b;box-shadow:0 0 0 6px rgba(28,138,75,.1);}
.eof-modal-mensaje{font-size:.95rem;color:var(--texto,#0c1b2e);line-height:1.55;margin-bottom:22px;white-space:pre-line;overflow-wrap:anywhere;}
.eof-modal-input{width:100%;box-sizing:border-box;min-height:44px;padding:11px 14px;border:1.5px solid var(--borde,#ccc);border-radius:10px;font-size:.9rem;margin-bottom:20px;font-family:inherit;background:var(--fondo,#fff);color:var(--texto,#1a1c22);transition:border-color .16s ease,box-shadow .16s ease;}
.eof-modal-input:focus{outline:none;border-color:var(--celeste,#5bb8e8);box-shadow:0 0 0 3px rgba(91,184,232,.22);}
.eof-modal-email .eof-modal-input{margin-bottom:6px;}
.eof-modal-input-error{border-color:var(--rojo,#d1132e)!important;box-shadow:0 0 0 3px rgba(209,19,46,.14)!important;}
.eof-modal-email-error{display:none;color:var(--rojo,#d1132e);font-size:.8rem;text-align:left;margin:0 0 14px;line-height:1.4;}
.eof-modal-preguntar-html{max-width:640px;text-align:left;}
.eof-modal-preguntar-html .eof-modal-mensaje{text-align:left;}
.eof-modal-textarea{resize:vertical;min-height:200px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;line-height:1.45;}
.eof-modal-botones{display:flex;gap:10px;justify-content:center;}
.eof-btn{flex:1;min-height:44px;padding:11px 14px;border-radius:10px;border:none;font-size:.87rem;font-weight:600;cursor:pointer;font-family:var(--font-text,Arial,sans-serif);transition:background .15s,transform .12s;}
.eof-btn:active{transform:translateY(1px);}
.eof-btn:focus-visible{outline:2px solid var(--celeste,#5bb8e8);outline-offset:2px;}
.eof-btn-secundario{background:var(--gris-claro,#eef1f5);color:var(--texto-suave,#5a6270);}
.eof-btn-secundario:hover{background:var(--borde,#e2e6eb);}
.eof-btn-primario{background:var(--marino,#0c1b2e);color:#fff;}
.eof-btn-primario:hover{background:var(--marino2,#152b46);}
.eof-btn-peligro{background:var(--rojo,#d1132e);color:#fff;}
.eof-btn-peligro:hover{background:var(--rojo-oscuro,#9c0e23);}
[data-theme="dark"] .eof-modal-overlay{background:rgba(0,0,0,.66);}
[data-theme="dark"] .eof-modal-caja{box-shadow:0 28px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);}
[data-theme="dark"] .eof-modal-icono-info,[data-theme="dark"] .eof-modal-icono-pregunta{background:rgba(91,184,232,.16);}
[data-theme="dark"] .eof-modal-icono-error{background:rgba(209,19,46,.2);color:#ff7a8c;}
[data-theme="dark"] .eof-modal-icono-exito{background:rgba(28,138,75,.2);color:#4ade80;}
[data-theme="dark"] .eof-btn-primario{background:var(--celeste,#5bb8e8);color:#0c1b2e;}
[data-theme="dark"] .eof-btn-primario:hover{background:var(--celeste-claro,#a8dcf5);}
@media (prefers-reduced-motion:reduce){.eof-modal-overlay,.eof-modal-caja{transition:none;}}
@media(max-width:480px){
  .eof-toast-contenedor{left:12px;right:12px;bottom:12px;max-width:none;}
  .eof-modal-caja{padding:26px 18px 20px;}
  .eof-modal-botones{flex-direction:column-reverse;}
}
`,document.head.appendChild(e)}function C(){let e=document.getElementById("eof-toast-contenedor");return e||(e=document.createElement("div"),e.id="eof-toast-contenedor",e.className="eof-toast-contenedor",document.body.appendChild(e)),e}const m=new Set,x=[];let h=!1;function w(){if(h)return;h=!0;const e=()=>{if(m.size){h=!1;return}const t=x.shift();if(!t){h=!1;return}try{t()}catch{}setTimeout(e,450)};setTimeout(e,350)}function L(e){m.add(e)}function j(e){m.delete(e)&&!m.size&&x.length&&w()}function S(){return!m.size&&!x.length?Promise.resolve():new Promise(e=>{x.push(e),m.size||w()})}function E(e,t="info",i=4500){if(m.has("celebracion"))return x.push(()=>E(e,t,i)),()=>{};k();const c=C(),o=document.createElement("div");o.className=`eof-toast eof-toast-${t}`,o.innerHTML=`<span class="eof-toast-icono">${b[t]||b.info}</span><span class="eof-toast-texto"></span><button type="button" class="eof-toast-cerrar" aria-label="Cerrar">&times;</button>`,o.querySelector(".eof-toast-texto").textContent=e,c.appendChild(o),requestAnimationFrame(()=>o.classList.add("eof-toast-visible"));let a;const r=()=>{clearTimeout(a),o.classList.remove("eof-toast-visible"),o.classList.add("eof-toast-saliendo"),setTimeout(()=>o.remove(),250)};return o.querySelector(".eof-toast-cerrar").addEventListener("click",r),a=setTimeout(r,i),r}function v(e){k();const t=document.createElement("div");t.className="eof-modal-overlay";const i=document.createElement("div");return i.className=`eof-modal-caja ${e||""}`,i.setAttribute("role","alertdialog"),i.setAttribute("aria-modal","true"),t.appendChild(i),document.body.appendChild(t),requestAnimationFrame(()=>t.classList.add("eof-modal-visible")),{overlay:t,caja:i}}function p(e){e.classList.remove("eof-modal-visible"),setTimeout(()=>e.remove(),200)}function q(e,t={}){return new Promise(i=>{const{overlay:c,caja:o}=v("eof-modal-alerta"),a=t.tipo||"info";o.innerHTML=`
        <div class="eof-modal-icono eof-modal-icono-${a}">${b[a]||b.info}</div>
        <p class="eof-modal-mensaje"></p>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`,o.querySelector(".eof-modal-mensaje").textContent=e;const r=o.querySelector(".eof-btn-primario");r.textContent=t.textoBoton||"Entendido";const s=()=>{p(c),i()};r.addEventListener("click",s),setTimeout(()=>r.focus(),50)})}function T(e,t={}){return new Promise(i=>{const{overlay:c,caja:o}=v("eof-modal-confirmar"),a=t.tipo||"pregunta";o.innerHTML=`
        <div class="eof-modal-icono eof-modal-icono-${a}">${b[a]||b.pregunta}</div>
        <p class="eof-modal-mensaje"></p>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario"></button>
          <button type="button" class="eof-btn ${t.peligroso?"eof-btn-peligro":"eof-btn-primario"}"></button>
        </div>`,o.querySelector(".eof-modal-mensaje").textContent=e;const[r,s]=o.querySelectorAll(".eof-btn");r.textContent=t.textoCancelar||"Cancelar",s.textContent=t.textoConfirmar||"Confirmar";const l=n=>{p(c),document.removeEventListener("keydown",d),i(n)};r.addEventListener("click",()=>l(!1)),s.addEventListener("click",()=>l(!0)),c.addEventListener("click",n=>{n.target===c&&l(!1)});function d(n){n.key==="Escape"&&l(!1)}document.addEventListener("keydown",d),setTimeout(()=>s.focus(),50)})}function M(e,t="",i={}){return new Promise(c=>{const{overlay:o,caja:a}=v("eof-modal-preguntar");a.innerHTML=`
        <p class="eof-modal-mensaje"></p>
        <input type="text" class="eof-modal-input" autocomplete="off" />
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`,a.querySelector(".eof-modal-mensaje").textContent=e;const r=a.querySelector(".eof-modal-input");r.value=t||"",i.placeholder&&(r.placeholder=i.placeholder),i.soloLectura&&(r.readOnly=!0);const s=a.querySelector(".eof-btn-primario");s.textContent=i.textoConfirmar||"Aceptar";const l=n=>{p(o),document.removeEventListener("keydown",d),c(n)};a.querySelector(".eof-btn-secundario").addEventListener("click",()=>l(null)),s.addEventListener("click",()=>l(r.value.trim())),r.addEventListener("keydown",n=>{n.key==="Enter"&&(n.preventDefault(),l(r.value.trim()))});function d(n){n.key==="Escape"&&l(null)}document.addEventListener("keydown",d),o.addEventListener("click",n=>{n.target===o&&l(null)}),setTimeout(()=>{r.focus(),i.soloLectura&&r.select()},50)})}function z(e,t="",i={}){return new Promise(c=>{const{overlay:o,caja:a}=v("eof-modal-preguntar eof-modal-preguntar-html");a.innerHTML=`
        <p class="eof-modal-mensaje"></p>
        <textarea class="eof-modal-input eof-modal-textarea" autocomplete="off" rows="12"></textarea>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`,a.querySelector(".eof-modal-mensaje").textContent=e;const r=a.querySelector(".eof-modal-textarea");r.value=t||"";const s=a.querySelector(".eof-btn-primario");s.textContent=i.textoConfirmar||"Aceptar";const l=n=>{p(o),document.removeEventListener("keydown",d),c(n)};a.querySelector(".eof-btn-secundario").addEventListener("click",()=>l(null)),s.addEventListener("click",()=>l(r.value.trim()));function d(n){n.key==="Escape"&&l(null)}document.addEventListener("keydown",d),o.addEventListener("click",n=>{n.target===o&&l(null)}),setTimeout(()=>{r.focus()},50)})}function A(e,t={}){return new Promise(i=>{const{overlay:c,caja:o}=v("eof-modal-preguntar");o.innerHTML=`
        <p class="eof-modal-mensaje"></p>
        <input type="text" class="eof-modal-input eof-modal-input-texto" autocomplete="off" placeholder="Texto del enlace" />
        <input type="text" class="eof-modal-input eof-modal-input-url" autocomplete="off" placeholder="URL (https://...)" />
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`,o.querySelector(".eof-modal-mensaje").textContent=e;const a=o.querySelector(".eof-modal-input-texto"),r=o.querySelector(".eof-modal-input-url");a.value=t.texto||"",r.value=t.url||"";const s=o.querySelector(".eof-btn-primario");s.textContent="Aceptar";const l=f=>{p(c),document.removeEventListener("keydown",n),i(f)},d=()=>{const f=r.value.trim();if(!f){r.focus();return}l({texto:a.value.trim(),url:f})};o.querySelector(".eof-btn-secundario").addEventListener("click",()=>l(null)),s.addEventListener("click",d),[a,r].forEach(f=>{f.addEventListener("keydown",g=>{g.key==="Enter"&&(g.preventDefault(),d())})});function n(f){f.key==="Escape"&&l(null)}document.addEventListener("keydown",n),c.addEventListener("click",f=>{f.target===c&&l(null)}),setTimeout(()=>{(a.value?r:a).focus()},50)})}function O(e,t={}){return new Promise(i=>{const{overlay:c,caja:o}=v("eof-modal-preguntar eof-modal-email");o.innerHTML=`
        <p class="eof-modal-mensaje"></p>
        <input type="email" class="eof-modal-input" autocomplete="email" inputmode="email" />
        <p class="eof-modal-email-error" role="alert"></p>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`,o.querySelector(".eof-modal-mensaje").textContent=e;const a=o.querySelector(".eof-modal-input"),r=o.querySelector(".eof-modal-email-error");t.placeholder&&(a.placeholder=t.placeholder);const s=o.querySelector(".eof-btn-primario"),l=o.querySelector(".eof-btn-secundario");s.textContent=t.textoConfirmar||"Guardar",l.textContent=t.textoCancelar||"Cancelar";const d=u=>{r.textContent=u,r.style.display=u?"block":"none",a.classList.toggle("eof-modal-input-error",!!u)};let n=!1;const f=()=>{p(c),document.removeEventListener("keydown",y),i(!1)},g=async()=>{if(n)return;const u=a.value.trim();if(!u||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)){d("Introduce un correo electrónico válido."),a.focus();return}d(""),n=!0,s.disabled=!0,s.textContent="Guardando…";try{t.onEnviar&&await t.onEnviar(u),p(c),document.removeEventListener("keydown",y),i(!0)}catch(H){d(H.message||"No se ha podido guardar el correo."),a.focus()}finally{n=!1,s.disabled=!1,s.textContent=t.textoConfirmar||"Guardar"}};l.addEventListener("click",f),s.addEventListener("click",g),a.addEventListener("keydown",u=>{u.key==="Enter"&&(u.preventDefault(),g())}),a.addEventListener("input",()=>d(""));function y(u){u.key==="Escape"&&f()}document.addEventListener("keydown",y),c.addEventListener("click",u=>{u.target===c&&f()}),setTimeout(()=>a.focus(),50)})}window.EOF=window.EOF||{},Object.assign(window.EOF,{toast:E,rachaBloquear:L,rachaLiberar:j,esperarRacha:S,confirmar:T,preguntar:M,preguntarEnlace:A,preguntarHTML:z,preguntarEmail:O,alertaModal:q,_inyectarCss:k,_alertasCargadas:!0})})();

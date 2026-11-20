(function(){
"use strict";
var tabs=[].slice.call(document.querySelectorAll("#insTabs button")),ids=tabs.map(function(b){return b.dataset.d}),pendiente=null;
function mostrar(d,fijar){
  if(ids.indexOf(d)<0)d="iphone";
  tabs.forEach(function(b){var on=b.dataset.d===d;b.setAttribute("aria-selected",on?"true":"false");b.tabIndex=on?0:-1;var p=document.getElementById("ins-"+b.dataset.d);if(p)p.hidden=!on;});
  if(fijar){try{history.replaceState(null,"","#"+d);}catch(e){}}
}
function detectar(){
  var u=navigator.userAgent||"",p=navigator.platform||"";
  if(/iPad/.test(u)||(p==="MacIntel"&&navigator.maxTouchPoints>1))return"ipad";
  if(/iPhone|iPod/.test(u))return"iphone";
  if(/Android/.test(u))return"android";
  if(/Win/.test(p))return"windows";
  if(/Mac/.test(p))return"mac";
  return"android";
}
tabs.forEach(function(b,i){
  b.addEventListener("click",function(){mostrar(b.dataset.d,true);});
  b.addEventListener("keydown",function(e){var n=(e.key==="ArrowRight"||e.key==="ArrowDown")?1:(e.key==="ArrowLeft"||e.key==="ArrowUp")?-1:0;if(!n)return;e.preventDefault();var t=tabs[(i+n+tabs.length)%tabs.length];t.focus();mostrar(t.dataset.d,true);});
});
var h=(location.hash||"").slice(1);
mostrar(ids.indexOf(h)>=0?h:detectar(),false);
window.addEventListener("hashchange",function(){var x=location.hash.slice(1);if(ids.indexOf(x)>=0)mostrar(x,false);});

var btn=document.getElementById("insInstalar"),ya=document.getElementById("insYa");
var standalone=false;
try{standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;}catch(e){}
if(standalone&&ya)ya.hidden=false;
window.addEventListener("beforeinstallprompt",function(e){
  e.preventDefault();pendiente=e;if(btn&&!standalone)btn.hidden=false;
});
if(btn)btn.addEventListener("click",function(){
  if(!pendiente)return;
  pendiente.prompt();
  pendiente.userChoice.then(function(){pendiente=null;btn.hidden=true;}).catch(function(){});
});
window.addEventListener("appinstalled",function(){if(btn)btn.hidden=true;if(ya)ya.hidden=false;});

var cp=document.getElementById("insCopiar");
if(cp)cp.addEventListener("click",function(){
  var url="https://elotrofutbol.media/instalar",txt=cp.textContent;
  function ok(){cp.textContent="Enlace copiado";setTimeout(function(){cp.textContent=txt;},1800);}
  try{navigator.clipboard.writeText(url).then(ok,ok);}catch(e){ok();}
});
})();

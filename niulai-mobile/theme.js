(() => {
  'use strict';
  const system=matchMedia('(prefers-color-scheme: dark)');
  let preference='system';
  try { const saved=JSON.parse(localStorage.getItem('niulai-muyu:v1')||'{}');if(['system','light','dark'].includes(saved?.theme))preference=saved.theme; } catch {}
  function paint(){
    const dark=preference==='dark'||(preference==='system'&&system.matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    const chrome=document.querySelector('meta[name="theme-color"]');if(chrome)chrome.content=dark?'#302722':'#E7DFD2';
    const status=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(status)status.content=dark?'black-translucent':'default';
  }
  system.addEventListener('change',()=>{if(preference==='system')paint();});
  window.niulaiTheme=Object.freeze({set(value){preference=['system','light','dark'].includes(value)?value:'system';paint();}});
  paint();
})();

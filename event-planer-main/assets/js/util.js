(function(){
  "use strict";
  window.$ = (sel)=>document.querySelector(sel);
  window.el = function(tag, cls, text){
    const n=document.createElement(tag);
    if(cls) n.className=cls;
    if(text!==undefined && text!==null) n.textContent=String(text);
    return n;
  };
  window.toMin = (hhmm)=>{
    const s=String(hhmm||"0:0").trim();
    const m=s.match(/^(\d{1,2}):(\d{2})$/); if(!m) return 0;
    const h=parseInt(m[1],10)||0, mi=parseInt(m[2],10)||0;
    return h*60+mi;
  };
  window.toHHMM = (mins)=>{
    const v=Math.max(0, parseInt(mins||0,10)||0);
    const h=String(Math.floor(v/60)).padStart(2,"0");
    const m=String(v%60).padStart(2,"0");
    return h+":"+m;
  };
})();

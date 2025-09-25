(function(){
  "use strict";
  const clienteMeta={id:"CLIENTE",nombre:"Cliente",rol:"CLIENTE"};
  function showOnly(id){
    ["clienteView","catalogView","resultView"].forEach(v=>{ const n=document.getElementById(v); if(n) n.style.display=(v===id)?"":"none"; });
  }
  function personTabs(){
    const tabs=document.getElementById("personTabs");
    if(!tabs) return;
    tabs.innerHTML="";
    const mk=(p,isActive)=>{
      const b=el("button","tab"+(isActive?" active":""), p.nombre);
      b.dataset.pid=p.id;
      b.onclick=()=>{
        showOnly("clienteView");
        state.project.view.lastTab=p.id;
        renderClient();
        personTabs();
      };
      tabs.appendChild(b);
    };
    const activeId = (state.project.view.lastTab==="CLIENTE"||state.project.view.lastTab==="cliente") ? "CLIENTE" : state.project.view.lastTab;
    mk(clienteMeta, activeId==="CLIENTE");
    (state.staff||[]).forEach(s=> mk(s, activeId===s.id));
  }
  let statusTimer=null;
  function renderStatus(){
    const t=state.project.updatedAt?new Date(state.project.updatedAt).toLocaleTimeString():"nunca";
    const elSt=document.getElementById("status"); if(elSt) elSt.textContent="Guardado "+t+" • "+(state.project.nombre||"");
  }
  function flashStatus(msg,ms=2500){
    const elSt=document.getElementById("status"); if(!elSt) return;
    clearTimeout(statusTimer);
    elSt.textContent=msg;
    statusTimer=setTimeout(()=>{ renderStatus(); }, ms);
  }
  window.flashStatus = flashStatus;
  setOnTouched(renderStatus);

  window.renderClient = window.renderClient || function(){};
  const renderStaffList=()=>{
    const box=document.getElementById("staffList"); if(!box) return; box.innerHTML=""; box.className="stafflist";
    state.staff.forEach(p=>{
      const chip=el("div","staffchip");
      const nameEl = el("span",null,p.nombre);
      nameEl.style.cursor="pointer";
      nameEl.onclick=()=>{
        showOnly("clienteView");
        state.project.view.lastTab=p.id;
        renderClient();
        personTabs();
      };
      chip.appendChild(nameEl);
      const del=el("button","del","X"); del.title="Eliminar"; del.onclick=()=>{ if((state.sessions?.[p.id]||[]).length){ alert("No se puede eliminar: tiene acciones."); return; } state.staff=state.staff.filter(x=>x.id!==p.id); touch(); personTabs(); renderClient(); renderStaffList(); };
      chip.appendChild(del); box.appendChild(chip);
    });
  };

  function openCatalog(which){
    showOnly("catalogView");
    const cont=document.getElementById("catalogView"); cont.innerHTML="";
    cont.appendChild(el("h3",null,"Catálogos"));
    if(which==="loc") openCatLoc(cont);
    if(which==="task") openCatTask(cont);
    if(which==="mat") openCatMat(cont);
    if(which==="veh") openCatVeh(cont);
  }

  function renderResults(tab){
    showOnly("resultView");
    const g=document.getElementById("ganttView"), m=document.getElementById("matsView"), c=document.getElementById("mapCanvas");
    g.style.display=m.style.display=c.style.display="none";
    if(tab==="gantt"){
      g.style.display=""; g.innerHTML="";
      const subt=el("div","subtabs"); const views=["Gantt","Tarjeta","Resumen"]; let active=state.project.view.subGantt||"Gantt";
      const setA=(v)=>{ active=v; state.project.view.subGantt=v; touch(); draw(); };
      views.forEach(v=>{ const b=el("button","subtab"+(v===active?" active":""),v); b.onclick=()=>setA(v); subt.appendChild(b); });
      g.appendChild(subt); const host=el("div"); g.appendChild(host);
      function draw(){
        host.innerHTML="";
        const persons=[clienteMeta,...state.staff];
        if(active==="Gantt") buildGantt(host,persons);
        if(active==="Tarjeta") buildCards(host,persons);
        if(active==="Resumen") buildSummary(host,persons);
        Array.from(subt.children).forEach(b=>b.classList.toggle("active", b.textContent===active));
      }
      draw();
    }
    if(tab==="mats"){ m.style.display=""; renderMateriales(m); const b=el("button","btn small","Exportar CSV"); b.onclick=exportCSV; m.prepend(b); }
    if(tab==="map"){ c.style.display=""; setupMap(c); }
  }

  function rehydrateSelects(){
    const catVisible = (document.getElementById("catalogView")?.style.display!=="none");
    if(catVisible) return;
    renderClient();
  }

  function wire(){
    const $id=(x)=>document.getElementById(x);
    const o=$id("openFile"); if(o) o.onchange=(e)=>{ const f=e.target.files?.[0]; if(f) importJSONFile(f,()=>{ ensureDefaults(); ensureLinkFields(); personTabs(); renderClient(); renderStatus(); renderStaffList(); }); };
    const nb=$id("newBtn"); if(nb) nb.onclick=()=>{ localStorage.clear(); location.reload(); };
    const sb=$id("saveBtn"); if(sb) sb.onclick=exportJSON;

    const pN=$id("pNombre"), pF=$id("pFecha"), pT=$id("pTz");
    if(pN) pN.oninput=(e)=>{ state.project.nombre=e.target.value; touch(); };
    if(pF) pF.oninput=(e)=>{ state.project.fecha=e.target.value; touch(); };
    if(pT) pT.oninput=(e)=>{ state.project.tz=e.target.value; touch(); };

    const addS=$id("addStaff"), newS=$id("newStaff");
    if(addS) addS.onclick=()=>{ const n=(newS?.value||"").trim(); if(!n) return; const id="P_"+(state.staff.length+1); state.staff.push({id,nombre:n,rol:"STAFF"}); if(newS) newS.value=""; touch(); personTabs(); renderClient(); renderStaffList(); };

    const c1=$id("catLoc"), c2=$id("catTask"), c3=$id("catMat"), c4=$id("catVeh");
    if(c1) c1.onclick=()=>openCatalog("loc");
    if(c2) c2.onclick=()=>openCatalog("task");
    if(c3) c3.onclick=()=>openCatalog("mat");
    if(c4) c4.onclick=()=>openCatalog("veh");

    const r1=$id("resGantt"), r2=$id("resMats"), r3=$id("resMap");
    if(r1) r1.onclick=()=>renderResults("gantt");
    if(r2) r2.onclick=()=>renderResults("mats");
    if(r3) r3.onclick=()=>renderResults("map");

    document.addEventListener("catalogs-changed",rehydrateSelects);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const raw=localStorage.getItem("eventplan.autosave"); if(raw){ const obj=JSON.parse(raw); if(obj&&obj.project) Object.assign(state,obj); }
    }catch(e){}
    ensureDefaults(); ensureLinkFields();
    const pN=document.getElementById("pNombre"); if(pN) pN.value=state.project.nombre||"";
    const pF=document.getElementById("pFecha"); if(pF) pF.value=state.project.fecha||"";
    const pT=document.getElementById("pTz"); if(pT) pT.value=state.project.tz||"Europe/Madrid";
    personTabs(); renderClient(); renderStatus(); renderStaffList(); wire();
    showOnly("clienteView");
  });
})();


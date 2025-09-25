(function(){
  "use strict";
  const root = window;
  if(typeof root.ACTION_TYPE_TRANSPORT === "undefined") root.ACTION_TYPE_TRANSPORT = "TRANSPORTE";
  if(typeof root.ACTION_TYPE_NORMAL === "undefined") root.ACTION_TYPE_NORMAL = "NORMAL";
  // Estado básico
  if(!root.state){
    root.state = {
      project:{ nombre:"Proyecto", fecha:"", tz:"Europe/Madrid", updatedAt:"", view:{ lastTab:"CLIENTE", subGantt:"Gantt", selectedIndex:{} } },
      locations:[], taskTypes:[], materialTypes:[], vehicles:[], staff:[],
      sessions:{ CLIENTE:[] }, horaInicial:{}, localizacionInicial:{}
    };
  }
  // Autosave
  let _onTouched=null;
  window.setOnTouched = (cb)=>{ _onTouched = cb; };
  window.touch = ()=>{
    state.project.updatedAt = new Date().toISOString();
    try{ localStorage.setItem("eventplan.autosave", JSON.stringify(state)); }catch(e){}
    try{ if(_onTouched) _onTouched(); }catch(e){}
  };
  window.exportJSON = ()=>{
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=(state.project.nombre||"eventplan")+".eventplan.json"; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),60000);
  };
  window.importJSONFile = (file,done)=>{
    const fr=new FileReader();
    fr.onload=()=>{ try{ const obj=JSON.parse(fr.result); if(obj&&typeof obj==="object"){ Object.assign(state,obj); } }catch(e){} ensureDefaults(); if(done) done(); };
    fr.readAsText(file,"utf-8");
  };
  window.ensureDefaults = ()=>{
    const st=state;
    st.taskTypes=st.taskTypes||[]; st.locations=st.locations||[]; st.materialTypes=st.materialTypes||[];
    st.taskTypes.forEach(t=>{
      const isTransport=t.id===root.EP_IDS?.TRANSP;
      if(typeof t.tipo==="undefined") t.tipo = isTransport?root.ACTION_TYPE_TRANSPORT:root.ACTION_TYPE_NORMAL;
      if(typeof t.quien==="undefined") t.quien = t.locked?"SISTEMA":"CLIENTE";
      if(!t.color){
        t.color = t.tipo===root.ACTION_TYPE_TRANSPORT?"#22d3ee":"#60a5fa";
      }
    });
    st.vehicles=st.vehicles||[]; st.staff=st.staff||[]; st.sessions=st.sessions||{CLIENTE:[]};
    st.horaInicial=st.horaInicial||{}; st.localizacionInicial=st.localizacionInicial||{};
    st.project=st.project||{nombre:"Proyecto",fecha:"",tz:"Europe/Madrid",updatedAt:"",view:{}}; st.project.view=st.project.view||{};
    st.project.view.lastTab=st.project.view.lastTab||"CLIENTE"; st.project.view.subGantt=st.project.view.subGantt||"Gantt"; st.project.view.selectedIndex=st.project.view.selectedIndex||{};
    if(!st.sessions.CLIENTE) st.sessions.CLIENTE=[];
    Object.keys(st.sessions).forEach(pid=>{
      const list=st.sessions[pid]||[];
      if(list.length && typeof st.localizacionInicial[pid]==="undefined"){
        st.localizacionInicial[pid]=list[0]?.locationId||null;
      }
    });
    try{ ensureSeedsCore(); }catch(e){}
  };

  // === Fuente de verdad de IDs y semillas (idempotente) ===
  (function EP_CORE_SEEDS(){
    try{
      root.EP_IDS = root.EP_IDS || {};
      if(!root.EP_IDS.TRANSP) root.EP_IDS.TRANSP="TASK_TRANSP";
      if(!root.EP_IDS.MONT)   root.EP_IDS.MONT  ="TASK_MONTAGE";
      if(!root.EP_IDS.DESM)   root.EP_IDS.DESM  ="TASK_DESMONT";
      if(typeof root.TASK_TRANSP   === "undefined") root.TASK_TRANSP   = root.EP_IDS.TRANSP;
      if(typeof root.TASK_MONTAGE  === "undefined") root.TASK_MONTAGE  = root.EP_IDS.MONT;
      if(typeof root.TASK_DESMONT  === "undefined") root.TASK_DESMONT  = root.EP_IDS.DESM;

      window.ensureSeedsCore = function(){
        const st=state;
        st.taskTypes=st.taskTypes||[]; st.vehicles=st.vehicles||[];
        const upsert=(arr,obj)=>{ const i=arr.findIndex(x=>x.id===obj.id); if(i<0) arr.push(obj); else { const t=arr[i]; t.nombre=t.nombre||obj.nombre; if(obj.color) t.color=t.color||obj.color; t.locked=true; } };
        upsert(st.taskTypes,{id:root.EP_IDS.TRANSP,nombre:"Transporte",color:"#22d3ee",locked:true});
        upsert(st.taskTypes,{id:root.EP_IDS.MONT,  nombre:"Montaje",   color:"#a3e635",locked:true});
        upsert(st.taskTypes,{id:root.EP_IDS.DESM,  nombre:"Desmontaje",color:"#f59e0b",locked:true});
        upsert(st.vehicles, {id:"V_WALK",nombre:"Caminando",locked:true});
        const order=id=>({[root.EP_IDS.TRANSP]:0,[root.EP_IDS.MONT]:1,[root.EP_IDS.DESM]:2}[id]??9);
        st.taskTypes=st.taskTypes.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).sort((a,b)=>order(a.id)-order(b.id)||(a.nombre||"").localeCompare(b.nombre||""));
        st.vehicles=st.vehicles.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).sort((a,b)=>(a.id==="V_WALK"?-1:0)-(b.id==="V_WALK"?-1:0)||(a.nombre||"").localeCompare(b.nombre||""));
      };
      ensureSeedsCore();
    }catch(e){}
  })();
})();

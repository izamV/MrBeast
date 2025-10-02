(function(){
  "use strict";
  const root = window;
  if(typeof root.ACTION_TYPE_TRANSPORT === "undefined") root.ACTION_TYPE_TRANSPORT = "TRANSPORTE";
  if(typeof root.ACTION_TYPE_NORMAL === "undefined") root.ACTION_TYPE_NORMAL = "NORMAL";
  const DAY_MAX_MIN = 23*60 + 55;
  const clampMinuteValue = (value)=> Math.max(0, Math.min(DAY_MAX_MIN, value));
  const parseMinuteValue = (value)=>{
    if(Number.isFinite(value)) return clampMinuteValue(Math.round(Number(value)));
    if(typeof value === "string"){
      const trimmed=value.trim();
      if(!trimmed) return null;
      const hhmm=trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if(hhmm){
        const hours=parseInt(hhmm[1],10)||0;
        const minutes=parseInt(hhmm[2],10)||0;
        return clampMinuteValue(hours*60+minutes);
      }
      const numeric=Number(trimmed);
      if(Number.isFinite(numeric)) return clampMinuteValue(Math.round(numeric));
    }
    return null;
  };
  const parsePositiveNumber = (value)=>{
    if(typeof value === "number" && Number.isFinite(value) && value>0) return value;
    if(typeof value === "string"){
      const normalized=value.trim().replace(/,/g,".");
      if(!normalized) return null;
      const num=Number(normalized);
      if(Number.isFinite(num) && num>0) return num;
    }
    return null;
  };
  // Estado básico
  if(!root.state){
    root.state = {
      project:{ nombre:"Proyecto", fecha:"", tz:"Europe/Madrid", updatedAt:"", view:{ lastTab:"CLIENTE", subGantt:"Gantt", selectedIndex:{} } },
      integrations:{},
      locations:[
        { id:"L_STAGE", nombre:"Escenario principal", lat:"41.3870", lng:"2.1701" },
        { id:"L_STORAGE", nombre:"Almacén central", lat:"41.3865", lng:"2.1698" },
        { id:"L_GREEN", nombre:"Sala verde", lat:"41.3872", lng:"2.1705" },
        { id:"L_HALL", nombre:"Hall invitados", lat:"41.3869", lng:"2.1700" }
      ],
      taskTypes:[
        { id:"T_MAIN_EVENT", nombre:"Evento principal", color:"#2563eb", locked:false },
        { id:"T_PREPARATION", nombre:"Preparación", color:"#a855f7", locked:false },
        { id:"T_PARALLEL_SUPPORT", nombre:"Soporte paralelo", color:"#14b8a6", locked:false },
        { id:"T_POST_EVENT", nombre:"Post evento", color:"#f97316", locked:false }
      ],
      materialTypes:[
        { id:"MT_AUDIO", nombre:"Audio" },
        { id:"MT_LIGHTS", nombre:"Iluminación" },
        { id:"MT_CATERING", nombre:"Catering" }
      ],
      vehicles:[],
      staff:[
        { id:"ST_STAGE", nombre:"Equipo escenario", rol:"STAFF" },
        { id:"ST_CATERING", nombre:"Equipo catering", rol:"STAFF" }
      ],
      sessions:{
        CLIENTE:[
          {
            id:"TASK_MAIN_SHOW",
            structureRelation:"milestone",
            actionName:"Show principal",
            taskTypeId:"T_MAIN_EVENT",
            startMin:600,
            endMin:720,
            durationMin:120,
            locationId:"L_STAGE",
            materiales:[
              { materialTypeId:"MT_AUDIO", cantidad:4 },
              { materialTypeId:"MT_LIGHTS", cantidad:20 }
            ],
            assignedStaffIds:["ST_STAGE"],
            locked:true
          },
          {
            id:"TASK_PRE_RECEIVE",
            structureParentId:"TASK_MAIN_SHOW",
            structureRelation:"pre",
            actionName:"Recepción de materiales",
            taskTypeId:"TASK_MONTAGE",
            durationMin:60,
            limitEarlyMin:480,
            limitLateMin:540,
            limitEarlyMinEnabled:true,
            limitLateMinEnabled:true,
            locationId:"L_STORAGE",
            materiales:[],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_PRE_SETUP",
            structureParentId:"TASK_PRE_RECEIVE",
            structureRelation:"pre",
            actionName:"Montaje de estructura",
            taskTypeId:"TASK_MONTAGE",
            durationMin:45,
            limitEarlyMinEnabled:false,
            limitLateMinEnabled:false,
            locationId:"L_STAGE",
            materiales:[],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_PRE_TEST",
            structureParentId:"TASK_PRE_SETUP",
            structureRelation:"pre",
            actionName:"Pruebas de sonido",
            taskTypeId:"TASK_MONTAGE",
            durationMin:30,
            limitEarlyMinEnabled:false,
            limitLateMinEnabled:false,
            locationId:"L_STAGE",
            materiales:[{ materialTypeId:"MT_AUDIO", cantidad:2 }],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_PARALLEL_STREAM",
            structureParentId:"TASK_MAIN_SHOW",
            structureRelation:"post",
            actionName:"Cobertura streaming final",
            taskTypeId:"T_PARALLEL_SUPPORT",
            durationMin:60,
            limitEarlyMin:720,
            limitLateMin:900,
            limitEarlyMinEnabled:true,
            limitLateMinEnabled:true,
            locationId:"L_GREEN",
            materiales:[],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_PARALLEL_VIP",
            structureParentId:"TASK_MAIN_SHOW",
            structureRelation:"parallel",
            actionName:"Atención invitados VIP",
            taskTypeId:"T_PARALLEL_SUPPORT",
            durationMin:120,
            limitEarlyMin:600,
            limitLateMin:780,
            limitEarlyMinEnabled:true,
            limitLateMinEnabled:true,
            locationId:"L_HALL",
            materiales:[{ materialTypeId:"MT_CATERING", cantidad:30 }],
            assignedStaffIds:["ST_CATERING"]
          },
          {
            id:"TASK_POST_CLEAR",
            structureParentId:"TASK_MAIN_SHOW",
            structureRelation:"post",
            actionName:"Desmontaje y limpieza",
            taskTypeId:"TASK_DESMONT",
            durationMin:45,
            limitEarlyMin:720,
            limitLateMin:900,
            limitEarlyMinEnabled:true,
            limitLateMinEnabled:true,
            locationId:"L_STAGE",
            materiales:[],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_POST_REPORT",
            structureParentId:"TASK_POST_CLEAR",
            structureRelation:"post",
            actionName:"Informe final",
            taskTypeId:"T_POST_EVENT",
            durationMin:30,
            limitEarlyMinEnabled:false,
            limitLateMinEnabled:false,
            locationId:"L_GREEN",
            materiales:[],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_MAIN_DINNER",
            structureRelation:"milestone",
            actionName:"Cena VIP",
            taskTypeId:"T_MAIN_EVENT",
            startMin:900,
            endMin:1050,
            durationMin:150,
            locationId:"L_HALL",
            materiales:[{ materialTypeId:"MT_CATERING", cantidad:50 }],
            assignedStaffIds:["ST_CATERING"],
            locked:true
          },
          {
            id:"TASK_PRE_MENU",
            structureParentId:"TASK_MAIN_DINNER",
            structureRelation:"pre",
            actionName:"Preparación del menú",
            taskTypeId:"TASK_MONTAGE",
            durationMin:90,
            limitEarlyMin:540,
            limitLateMin:810,
            limitEarlyMinEnabled:true,
            limitLateMinEnabled:true,
            locationId:"L_GREEN",
            materiales:[{ materialTypeId:"MT_CATERING", cantidad:20 }],
            assignedStaffIds:["ST_CATERING"]
          },
          {
            id:"TASK_PRE_BRIEFING",
            structureParentId:"TASK_PRE_MENU",
            structureRelation:"pre",
            actionName:"Briefing de sala",
            taskTypeId:"TASK_MONTAGE",
            durationMin:30,
            limitEarlyMinEnabled:false,
            limitLateMinEnabled:false,
            locationId:"L_HALL",
            materiales:[],
            assignedStaffIds:["ST_CATERING"]
          },
          {
            id:"TASK_PRE_DECOR",
            structureParentId:"TASK_PRE_BRIEFING",
            structureRelation:"pre",
            actionName:"Decoración final",
            taskTypeId:"TASK_MONTAGE",
            durationMin:45,
            limitEarlyMinEnabled:false,
            limitLateMinEnabled:false,
            locationId:"L_HALL",
            materiales:[],
            assignedStaffIds:["ST_CATERING"]
          },
          {
            id:"TASK_PARALLEL_MEDIA",
            structureParentId:"TASK_MAIN_DINNER",
            structureRelation:"parallel",
            actionName:"Cobertura fotográfica",
            taskTypeId:"T_PARALLEL_SUPPORT",
            durationMin:120,
            limitEarlyMin:900,
            limitEarlyMinEnabled:true,
            limitLateMinEnabled:false,
            locationId:"L_HALL",
            materiales:[],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_POST_TAKEDOWN",
            structureParentId:"TASK_MAIN_DINNER",
            structureRelation:"post",
            actionName:"Recogida del montaje",
            taskTypeId:"TASK_DESMONT",
            durationMin:60,
            limitEarlyMin:1050,
            limitLateMin:1200,
            limitEarlyMinEnabled:true,
            limitLateMinEnabled:true,
            locationId:"L_HALL",
            materiales:[],
            assignedStaffIds:["ST_STAGE"]
          },
          {
            id:"TASK_POST_PAYMENT",
            structureParentId:"TASK_POST_TAKEDOWN",
            structureRelation:"post",
            actionName:"Cierre con proveedores",
            taskTypeId:"T_POST_EVENT",
            durationMin:30,
            limitEarlyMinEnabled:false,
            limitLateMinEnabled:false,
            locationId:"L_STORAGE",
            materiales:[],
            assignedStaffIds:["ST_CATERING"]
          }
        ]
      },
      horaInicial:{ CLIENTE:540 },
      localizacionInicial:{ CLIENTE:"L_STAGE" }
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
    const DEFAULT_VEHICLE_SPEED_KMPH=45;
    st.vehicles.forEach(v=>{
      const parsed=parsePositiveNumber(v.speedKmph);
      if(v.id==="V_WALK"){
        v.speedKmph = parsed ?? 4;
      }else if(parsed!=null){
        v.speedKmph = parsed;
      }else if(typeof v.speedKmph === "undefined"){
        v.speedKmph = DEFAULT_VEHICLE_SPEED_KMPH;
      }else{
        delete v.speedKmph;
      }
    });
    st.horaInicial=st.horaInicial||{}; st.localizacionInicial=st.localizacionInicial||{};
    Object.keys(st.horaInicial).forEach(pid=>{
      const parsed=parseMinuteValue(st.horaInicial[pid]);
      if(parsed==null) delete st.horaInicial[pid];
      else st.horaInicial[pid]=parsed;
    });
    st.scheduleMeta=st.scheduleMeta||{};
    if(typeof st.scheduleMeta.generatedAt==="undefined") st.scheduleMeta.generatedAt=null;
    st.scheduleMeta.warningsByStaff=st.scheduleMeta.warningsByStaff||{};
    st.scheduleMeta.globalWarnings=st.scheduleMeta.globalWarnings||[];
    if(typeof st.scheduleMeta.activeStaffId==="undefined") st.scheduleMeta.activeStaffId=null;
    st.scheduleMeta.metricsByStaff=st.scheduleMeta.metricsByStaff||{};
    st.scheduleMeta.globalMetrics=st.scheduleMeta.globalMetrics||{};
    st.scheduleMeta.parameters=st.scheduleMeta.parameters||{};
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
        const upsert=(arr,obj)=>{
          const i=arr.findIndex(x=>x.id===obj.id);
          if(i<0){
            arr.push({ ...obj });
          }else{
            const t=arr[i];
            t.nombre=t.nombre||obj.nombre;
            if(obj.color) t.color=t.color||obj.color;
            if(typeof obj.speedKmph!=="undefined" && parsePositiveNumber(t.speedKmph)==null){
              t.speedKmph=obj.speedKmph;
            }
            t.locked=true;
          }
        };
        upsert(st.taskTypes,{id:root.EP_IDS.TRANSP,nombre:"Transporte",color:"#22d3ee",locked:true});
        upsert(st.taskTypes,{id:root.EP_IDS.MONT,  nombre:"Montaje",   color:"#a3e635",locked:true});
        upsert(st.taskTypes,{id:root.EP_IDS.DESM,  nombre:"Desmontaje",color:"#f59e0b",locked:true});
        upsert(st.vehicles, {id:"V_WALK",nombre:"Caminando",locked:true,speedKmph:4});
        const walk=st.vehicles.find(v=>v.id==="V_WALK");
        if(walk) walk.speedKmph = parsePositiveNumber(walk.speedKmph) ?? 4;
        const order=id=>({[root.EP_IDS.TRANSP]:0,[root.EP_IDS.MONT]:1,[root.EP_IDS.DESM]:2}[id]??9);
        st.taskTypes=st.taskTypes.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).sort((a,b)=>order(a.id)-order(b.id)||(a.nombre||"").localeCompare(b.nombre||""));
        st.vehicles=st.vehicles.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).sort((a,b)=>(a.id==="V_WALK"?-1:0)-(b.id==="V_WALK"?-1:0)||(a.nombre||"").localeCompare(b.nombre||""));
      };
      ensureSeedsCore();
    }catch(e){}
  })();
})();

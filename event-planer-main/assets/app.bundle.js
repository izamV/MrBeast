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


(function(){
  "use strict";
  const ACTION_TYPE_TRANSPORT = window.ACTION_TYPE_TRANSPORT || "TRANSPORTE";
  const ACTION_TYPE_NORMAL = window.ACTION_TYPE_NORMAL || "NORMAL";
  let __S_SEQ = 0;
  const personIds = ()=> ["CLIENTE",...(state.staff||[]).map(p=>p.id)];
  window.getPersonSessions = (pid)=>{ state.sessions[pid]=state.sessions[pid]||[]; return state.sessions[pid]; };
  window.getSelected = (pid)=> (state.project.view.selectedIndex||{})[pid] ?? null;
  window.setSelected = (pid,i)=>{ state.project.view.selectedIndex[state.project.view.lastTab||pid]=i; touch(); };

  function durationOf(s){ return Math.max(5, (parseInt(s.endMin||0,10)||0) - (parseInt(s.startMin||0,10)||0)); }
  function reflow(pid){
    const list=getPersonSessions(pid);
    let cur = (state.horaInicial?.[pid] ?? 9*60);
    for(let i=0;i<list.length;i++){
      const d = durationOf(list[i]);
      list[i].startMin = cur; list[i].endMin = cur + d; cur = list[i].endMin;
    }
  }
  window.addAfterIndex = (pid, idx, durMin)=>{
    const list=getPersonSessions(pid); const wasEmpty=!list.length;
    const d=Math.max(5,Math.round((parseInt(durMin||15,10)||15)/5)*5);
    const start = (idx!=null && idx>=0 && list[idx]) ? list[idx].endMin : (list.length? list[list.length-1].endMin : (state.horaInicial?.[pid]??9*60));
    const initialLoc = wasEmpty ? (state.localizacionInicial?.[pid] ?? null) : null;
    const s={ id:"S_"+(++__S_SEQ), startMin:start, endMin:start+d, taskTypeId:null, actionType:ACTION_TYPE_NORMAL, actionName:"", locationId:initialLoc, vehicleId:null, materiales:[], comentario:"", prevId:null, nextId:null, inheritFromId:null };
    list.splice((idx!=null && idx>=0)? idx+1 : list.length, 0, s);
    if(wasEmpty){
      state.localizacionInicial=state.localizacionInicial||{};
      state.localizacionInicial[pid]=s.locationId||null;
    }
    reflow(pid); recomputeLocations(pid); touch();
  };
  window.deleteAtIndex = (pid, idx)=>{
    const list=getPersonSessions(pid); if(idx<0||idx>=list.length) return;
    list.splice(idx,1); reflow(pid); recomputeLocations(pid); touch();
  };
  window.resizeSegment = (pid, idx, newDur)=>{
    const list=getPersonSessions(pid); if(!list[idx]) return;
    const d=Math.max(5,Math.round((parseInt(newDur||15,10)||15)/5)*5);
    list[idx].endMin = list[idx].startMin + d;
    reflow(pid); touch();
  };
  window.rebaseTo = (pid, startMin)=>{
    const list=getPersonSessions(pid); if(!list.length) return;
    const base=Math.max(0,parseInt(startMin||0,10)||0); const d0=durationOf(list[0]);
    list[0].startMin=base; list[0].endMin=base+d0; reflow(pid); touch();
  };

  // Localizaciones: bloqueadas excepto primera y transporte
  window.recomputeLocations = (pid)=>{
    const list=getPersonSessions(pid); let cur=null;
    for(let i=0;i<list.length;i++){
      const s=list[i];
      if(i===0 && s.actionType!==ACTION_TYPE_TRANSPORT){
        cur = s.locationId || cur;
        state.localizacionInicial=state.localizacionInicial||{};
        state.localizacionInicial[pid]=cur||null;
        continue;
      }
      if(s.actionType===ACTION_TYPE_TRANSPORT){
        // destino elegido por usuario
        cur = s.locationId || cur;
      }else{
        // no transporte: hereda
        s.locationId = cur;
      }
    }
  };

  // Vínculos
  window.ensureLinkFields = ()=>{
    personIds().forEach(pid=>{
      getPersonSessions(pid).forEach(s=>{
        if(!s.id) s.id="S_"+(++__S_SEQ);
        if(typeof s.prevId==="undefined") s.prevId=null;
        if(typeof s.nextId==="undefined") s.nextId=null;
        if(typeof s.inheritFromId==="undefined") s.inheritFromId=null;
        if(typeof s.linkPrevRole==="undefined") s.linkPrevRole=null;
        if(typeof s.linkNextRole==="undefined") s.linkNextRole=null;
        s.materiales=s.materiales||[];
        if(typeof s.actionType==="undefined") s.actionType = (s.taskTypeId===TASK_TRANSP)?ACTION_TYPE_TRANSPORT:ACTION_TYPE_NORMAL;
        if(typeof s.actionName==="undefined"){
          const fallback=state.taskTypes?.find(t=>t.id===s.taskTypeId)?.nombre || "";
          s.actionName=fallback;
        }
      });
    });
    personIds().forEach(pid=>{
      getPersonSessions(pid).forEach(s=>{
        if(s.prevId){
          const prev=findSessionById(s.prevId);
          if(prev && prev.session && prev.session.nextId===s.id && prev.session.inheritFromId===s.id){
            s.linkPrevRole="pre-main";
          }else{
            s.linkPrevRole="pre-target";
          }
        }else{
          s.linkPrevRole=null;
        }
        if(s.nextId){
          if(s.inheritFromId && s.inheritFromId===s.nextId){
            s.linkNextRole="post-target";
          }else{
            s.linkNextRole="post-main";
          }
        }else{
          s.linkNextRole=null;
        }
      });
    });
  };
  function findSessionById(sid){
    for(const pid of personIds()){
      const list=getPersonSessions(pid); const i=list.findIndex(x=>x.id===sid);
      if(i>=0) return {pid,index:i,session:list[i]};
    }
    return null;
  }
  window.findSessionById = findSessionById;
  const formatLinkMessage = (type, mainInfo, otherInfo)=>{
    if(!mainInfo || !otherInfo) return null;
    const fmt=(info)=> info.pid+" · #"+(info.index+1);
    return type==="prev" ? `PRE vinculado: ${fmt(otherInfo)} → ${fmt(mainInfo)}` : `POST vinculado: ${fmt(mainInfo)} → ${fmt(otherInfo)}`;
  };

  window.canLinkPrev = (mainId,dstId)=>{
    const A=findSessionById(mainId), B=findSessionById(dstId); if(!A||!B) return {ok:false,msg:"No encontrado"};
    const m=A.session, d=B.session;
    if(m.prevId) return {ok:false,msg:"La accion ya tiene PRE"};
    if(d.prevId||d.nextId) return {ok:false,msg:"Destino ya vinculado"};
    return {ok:true};
  };
  window.canLinkPost = (mainId,dstId)=>{
    const A=findSessionById(mainId), B=findSessionById(dstId); if(!A||!B) return {ok:false,msg:"No encontrado"};
    const m=A.session, d=B.session;
    if(m.nextId) return {ok:false,msg:"La accion ya tiene POST"};
    if(d.prevId||d.nextId) return {ok:false,msg:"Destino ya vinculado"};
    return {ok:true};
  };
  window.setPrevLink = (mainId,dstId)=>{
    const c=canLinkPrev(mainId,dstId); if(!c.ok) return c;
    const A=findSessionById(mainId), B=findSessionById(dstId); const m=A.session, d=B.session;
    d.taskTypeId = TASK_MONTAGE; d.actionType = ACTION_TYPE_NORMAL; d.materiales = (m.materiales||[]).map(x=>({materialTypeId:x.materialTypeId,cantidad:Number(x.cantidad||0)}));
    d.inheritFromId = m.id; m.prevId = d.id; d.nextId = m.id;
    m.linkPrevRole="pre-main"; d.linkNextRole="post-target";
    const msg=formatLinkMessage("prev", findSessionById(mainId), findSessionById(dstId));
    touch(); return {ok:true,msg};
  };
  window.setPostLink = (mainId,dstId)=>{
    const c=canLinkPost(mainId,dstId); if(!c.ok) return c;
    const A=findSessionById(mainId), B=findSessionById(dstId); const m=A.session, d=B.session;
    d.taskTypeId = TASK_DESMONT; d.actionType = ACTION_TYPE_NORMAL; d.materiales = []; d.inheritFromId=null;
    m.nextId = d.id; d.prevId = m.id;
    m.linkNextRole="post-main"; d.linkPrevRole="pre-target";
    const msg=formatLinkMessage("post", findSessionById(mainId), findSessionById(dstId));
    touch(); return {ok:true,msg};
  };
  window.clearPrevLink = (mainId)=>{
    const A=findSessionById(mainId); if(!A) return {ok:false,msg:"No encontrado"};
    const m=A.session; const P=findSessionById(m.prevId);
    if(P){ const s=P.session; if(s.taskTypeId===TASK_MONTAGE){ s.taskTypeId=null; s.actionType=ACTION_TYPE_NORMAL; s.materiales=[]; s.inheritFromId=null; } s.nextId=null; s.linkNextRole=null; }
    m.prevId=null; m.linkPrevRole=null; touch(); return {ok:true};
  };
  window.clearPostLink = (mainId)=>{
    const A=findSessionById(mainId); if(!A) return {ok:false,msg:"No encontrado"};
    const m=A.session; const N=findSessionById(m.nextId);
    if(N){ const s=N.session; if(s.taskTypeId===TASK_DESMONT){ s.taskTypeId=null; s.actionType=ACTION_TYPE_NORMAL; } s.prevId=null; s.linkPrevRole=null; }
    m.nextId=null; m.linkNextRole=null; touch(); return {ok:true};
  };
  window.resyncPrevMaterials = (montajeId)=>{
    const M=findSessionById(montajeId); if(!M) return {ok:false,msg:"No encontrado"};
    const s=M.session; if(s.taskTypeId!==TASK_MONTAGE || !s.nextId) return {ok:false,msg:"No es Montaje PRE"};
    const main=findSessionById(s.nextId)?.session; if(!main) return {ok:false,msg:"Sin destino"};
    s.materiales=(main.materiales||[]).map(x=>({materialTypeId:x.materialTypeId,cantidad:Number(x.cantidad||0)})); s.inheritFromId=main.id; touch(); return {ok:true};
  };
})();


(function(){
  "use strict";
  function allPersons(){ return ["CLIENTE", ...(state.staff||[]).map(s=>s.id)]; }
  function collectTotals(){
    const map=new Map();
    allPersons().forEach(pid=>{
      (state.sessions?.[pid]||[]).forEach(s=>{
        (s.materiales||[]).forEach(m=>{
          const key=m.materialTypeId;
          map.set(key,(map.get(key)||0)+Number(m.cantidad||0));
        });
      });
    });
    return map;
  }
  window.renderMateriales = (cont)=>{
    cont.innerHTML="";
    const totals=collectTotals();
    const tbl=el("table"); const thead=el("thead"); const trh=el("tr");
    ["Material","Total"].forEach(h=>trh.appendChild(el("th",null,h))); thead.appendChild(trh); tbl.appendChild(thead);
    const tb=el("tbody");
    const entries = Array.from(totals.entries());
    if(!entries.length){ const tr=el("tr"); const td=el("td"); td.colSpan=2; td.textContent="Sin materiales"; tr.appendChild(td); tb.appendChild(tr); }
    entries.forEach(([id,q])=>{
      const tr=el("tr");
      tr.appendChild(el("td",null, state.materialTypes.find(mt=>mt.id===id)?.nombre||"Material"));
      tr.appendChild(el("td",null, String(q)));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); cont.appendChild(tbl);
  };
  window.exportCSV = ()=>{
    const totals = (function(){
      const map=new Map();
      ["CLIENTE", ...(state.staff||[]).map(s=>s.id)].forEach(pid=>{
        (state.sessions?.[pid]||[]).forEach(s=>{
          (s.materiales||[]).forEach(m=>{
            map.set(m.materialTypeId,(map.get(m.materialTypeId)||0)+Number(m.cantidad||0));
          });
        });
      });
      return map;
    })();
    const rows=[["Material","Total"]];
    Array.from(totals.entries()).forEach(([id,q])=> rows.push([state.materialTypes.find(mt=>mt.id===id)?.nombre||"Material", String(q)]));
    const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv); a.download="materiales.csv"; a.click();
  };
})();


(function(){
  "use strict";

  const TILE_SIZE = 256;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 18;
  const DEFAULT_VIEW = { lat: 40.4168, lng: -3.7038, zoom: 12 };
  const SPEED_STEPS = [0.5, 1, 2, 4];
  const ACTION_TYPE_TRANSPORT = window.ACTION_TYPE_TRANSPORT || "TRANSPORTE";
  const COLOR_PALETTE = [
    "#38bdf8", "#f472b6", "#34d399", "#f97316",
    "#c084fc", "#22d3ee", "#facc15", "#fb7185",
    "#2dd4bf", "#f87171"
  ];

  const toNumber = (value)=>{
    const str = String(value ?? "").trim().replace(/,/g, ".");
    if(!str) return NaN;
    return Number(str);
  };

  const latLngToPixel = (lat, lng, zoom)=>{
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const sin = Math.sin(lat * Math.PI / 180);
    const x = (lng + 180) / 360 * scale;
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    return { x, y };
  };

  const pixelToLatLng = (x, y, zoom)=>{
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const lng = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  };

  const clampLatLng = (lat, lng)=>{
    const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
    let normLng = lng;
    if(!Number.isFinite(normLng)) normLng = 0;
    normLng = ((normLng + 180) % 360 + 360) % 360 - 180;
    return { lat: clampedLat, lng: normLng };
  };

  const toHHMM = (mins)=>{
    const v = Math.max(0, Math.round(mins));
    const h = String(Math.floor(v / 60)).padStart(2, "0");
    const m = String(v % 60).padStart(2, "0");
    return `${h}:${m}`;
  };

  const colorWithAlpha = (hex, alpha)=>{
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if(!m) return hex;
    const num = parseInt(m[1], 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const parseLocations = ()=>{
    const valid=[];
    (state.locations||[]).forEach(l=>{
      const lat = toNumber(l.lat);
      const lng = toNumber(l.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      valid.push({ id:l.id, nombre:l.nombre||l.id, lat, lng });
    });
    return valid;
  };

  const sessionLabel = (s)=>{
    const catalogName = state.taskTypes?.find(t=>t.id===s.taskTypeId)?.nombre || "";
    return (s.actionName||"").trim() || catalogName || "Sin tarea";
  };

  const buildTimeline = (locations)=>{
    const locMap = new Map(locations.map(l=>[l.id, l]));
    const persons = [{ id:"CLIENTE", nombre:"Cliente" }, ...(state.staff||[])];
    const tracks=[];
    let earliest=Infinity;
    let latest=-Infinity;

    persons.forEach((person, idx)=>{
      const sessions = (state.sessions?.[person.id]||[]).slice().sort((a,b)=> (a.startMin||0) - (b.startMin||0));
      let lastLoc=null;
      const segments=[];
      sessions.forEach(s=>{
        const start=Number(s.startMin);
        const end=Number(s.endMin);
        if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start) return;
        const dest = s.locationId ? locMap.get(s.locationId) : null;
        const isTransport = (s.actionType === ACTION_TYPE_TRANSPORT);
        let from = lastLoc || dest || null;
        let to = dest || from;
        if(isTransport){
          if(lastLoc && dest){
            from = lastLoc;
            to = dest;
          }else if(dest){
            from = dest;
            to = dest;
          }else if(lastLoc){
            from = lastLoc;
            to = lastLoc;
          }else return;
        }else{
          if(dest){
            from = dest;
            to = dest;
          }else if(!from){
            return;
          }
        }
        const label = sessionLabel(s);
        segments.push({ start, end, from, to, isTransport, session:s, label, location:dest });
        if(dest) lastLoc = dest;
        earliest = Math.min(earliest, start);
        latest = Math.max(latest, end);
      });
      if(segments.length){
        const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
        tracks.push({ id:person.id, nombre:person.nombre||person.id, color, segments });
      }
    });

    if(!Number.isFinite(earliest)) earliest=null;
    if(!Number.isFinite(latest)) latest=null;
    return { tracks, earliest, latest, locMap };
  };

  const computeInitialView = (locations, width, height)=>{
    if(!locations.length) return { center:{ lat:DEFAULT_VIEW.lat, lng:DEFAULT_VIEW.lng }, zoom:DEFAULT_VIEW.zoom };
    const lats = locations.map(l=>l.lat);
    const lngs = locations.map(l=>l.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    let zoom = DEFAULT_VIEW.zoom;
    for(let z=MAX_ZOOM; z>=MIN_ZOOM; z--){
      const nw = latLngToPixel(maxLat, minLng, z);
      const se = latLngToPixel(minLat, maxLng, z);
      const dx = Math.abs(se.x - nw.x);
      const dy = Math.abs(se.y - nw.y);
      if(dx <= width && dy <= height){
        zoom = z;
        break;
      }
    }
    return { center:{ lat:(minLat+maxLat)/2, lng:(minLng+maxLng)/2 }, zoom };
  };

  const uniqueSortedStops = (tracks)=>{
    const set=new Set();
    tracks.forEach(t=>t.segments.forEach(seg=>{ set.add(Math.round(seg.start)); set.add(Math.round(seg.end)); }));
    return [...set].sort((a,b)=>a-b);
  };

  const describeState = (track, time)=>{
    let fallback=null;
    for(const seg of track.segments){
      if(time < seg.start){
        return fallback;
      }
      if(time >= seg.start && time <= seg.end){
        if(seg.isTransport && seg.to && seg.from){
          const span = Math.max(1, seg.end - seg.start);
          const ratio = Math.min(1, Math.max(0, (time - seg.start) / span));
          const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * ratio;
          const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * ratio;
          const locName = seg.location?.nombre || seg.to.nombre || "";
          return {
            lat, lng,
            status: seg.label || "Transporte",
            location: ratio >= 0.99 ? locName : (locName ? `→ ${locName}` : ""),
            session: seg.session
          };
        }
        const lat = seg.to?.lat ?? seg.from?.lat;
        const lng = seg.to?.lng ?? seg.from?.lng;
        if(!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;
        const locName = seg.location?.nombre || seg.to?.nombre || seg.from?.nombre || "";
        return { lat, lng, status: seg.label || "", location: locName ? `en ${locName}` : "", session: seg.session };
      }
      const lat = seg.to?.lat ?? seg.from?.lat;
      const lng = seg.to?.lng ?? seg.from?.lng;
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        const locName = seg.location?.nombre || seg.to?.nombre || seg.from?.nombre || "";
        fallback = { lat, lng, status: seg.label || "", location: locName ? `en ${locName}` : "", session: seg.session };
      }
    }
    return fallback;
  };

  const projectPoint = (lat, lng, view)=>{
    const zoom = view.zoom;
    const centerPx = latLngToPixel(view.center.lat, view.center.lng, zoom);
    const pointPx = latLngToPixel(lat, lng, zoom);
    const world = TILE_SIZE * Math.pow(2, zoom);
    let dx = pointPx.x - centerPx.x;
    if(dx > world / 2) dx -= world;
    if(dx < -world / 2) dx += world;
    const dy = pointPx.y - centerPx.y;
    return { x: view.width / 2 + dx, y: view.height / 2 + dy };
  };

  window.setupMap = (cont)=>{
    if(cont._mapCleanup){ try{ cont._mapCleanup(); }catch(e){} }
    cont.innerHTML="";

    const locations = parseLocations();
    if(!locations.length){
      cont.appendChild(el("div","mini","Añade localizaciones con latitud y longitud para ver el mapa."));
      return;
    }

    const { tracks, earliest, latest } = buildTimeline(locations);
    if(!tracks.length || earliest===null || latest===null){
      cont.appendChild(el("div","mini","No hay acciones con localizaciones asignadas."));
      return;
    }

    const wrapper = el("div","map-wrapper");
    const controls = el("div","map-controls");
    const playBtn = el("button","btn small","▶ Play");
    const nextBtn = el("button","btn small","⏭"), prevBtn = el("button","btn small","⏮");
    const speedBtn = el("button","btn small","Velocidad 1x");
    const timeLabel = el("div","map-time", toHHMM(earliest));
    const slider = el("input","map-slider"); slider.type="range";

    controls.appendChild(prevBtn);
    controls.appendChild(playBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(speedBtn);
    controls.appendChild(timeLabel);
    controls.appendChild(slider);

    const mapArea = el("div","map-area");
    const canvas = document.createElement("canvas"); canvas.className="map-canvas";
    const overlay = el("div","map-overlay");
    mapArea.appendChild(canvas);
    mapArea.appendChild(overlay);

    const legend = el("div","map-legend");
    tracks.forEach(t=>{
      const item=el("div","map-legend-item");
      const swatch=el("span","map-legend-swatch"); swatch.style.background=t.color;
      item.appendChild(swatch);
      item.appendChild(el("span","map-legend-name", t.nombre||t.id));
      legend.appendChild(item);
    });

    wrapper.appendChild(controls);
    wrapper.appendChild(mapArea);
    wrapper.appendChild(legend);
    cont.appendChild(wrapper);

    const view={ center:{ lat:DEFAULT_VIEW.lat, lng:DEFAULT_VIEW.lng }, zoom:DEFAULT_VIEW.zoom, width:mapArea.clientWidth||900, height:mapArea.clientHeight||480 };
    const init = computeInitialView(locations, view.width, view.height);
    view.center = clampLatLng(init.center.lat, init.center.lng);
    view.zoom = init.zoom;

    const ctx = canvas.getContext("2d");
    const tileCache = new Map();
    let rafId=null; let playing=false; let speedIndex=1; let lastTs=null;
    const minTime = earliest;
    const maxTime = Math.max(latest, earliest+5);
    let currentTime = minTime;
    const timeStops = uniqueSortedStops(tracks);

    const personMarkers = tracks.map(track=>{
      const marker=el("div","map-marker");
      const dot=el("span","map-marker-dot"); dot.style.background=track.color;
      const info=el("div","map-marker-info");
      const nameEl=el("div","map-marker-name", track.nombre||track.id);
      const statusEl=el("div","map-marker-status","");
      const placeEl=el("div","map-marker-place","");
      info.appendChild(nameEl);
      info.appendChild(statusEl);
      info.appendChild(placeEl);
      marker.appendChild(dot);
      marker.appendChild(info);
      marker.style.display="none";
      marker._statusEl=statusEl;
      marker._placeEl=placeEl;
      marker._track=track;
      overlay.appendChild(marker);
      return marker;
    });

    const locationPins = locations.map(loc=>{
      const pin=el("div","map-location");
      pin.appendChild(el("span","map-location-dot"));
      pin.appendChild(el("span","map-location-label", loc.nombre||loc.id));
      overlay.appendChild(pin);
      return { loc, el:pin };
    });

    const resize = ()=>{
      view.width = mapArea.clientWidth || 900;
      view.height = mapArea.clientHeight || 480;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(view.width * dpr);
      canvas.height = Math.round(view.height * dpr);
      canvas.style.width = view.width+"px";
      canvas.style.height = view.height+"px";
      ctx.setTransform(dpr,0,0,dpr,0,0);
      render();
    };

    const getTile = (z,x,y)=>{
      const key = `${z}/${x}/${y}`;
      const cached = tileCache.get(key);
      if(cached){
        if(cached.ready) return cached.img;
        return null;
      }
      const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      const img = new Image();
      const entry={ img, ready:false };
      tileCache.set(key, entry);
      img.crossOrigin="anonymous";
      img.onload=()=>{ entry.ready=true; render(); };
      img.onerror=()=>{ tileCache.delete(key); };
      img.src=url;
      return null;
    };

    const drawTiles = ()=>{
      ctx.fillStyle="#0b1220";
      ctx.fillRect(0,0,view.width,view.height);
      const zoom=view.zoom;
      const centerPx=latLngToPixel(view.center.lat, view.center.lng, zoom);
      const topLeftX=centerPx.x - view.width/2;
      const topLeftY=centerPx.y - view.height/2;
      const startX=Math.floor(topLeftX / TILE_SIZE);
      const endX=Math.floor((topLeftX + view.width) / TILE_SIZE);
      const startY=Math.floor(topLeftY / TILE_SIZE);
      const endY=Math.floor((topLeftY + view.height) / TILE_SIZE);
      const tileCount = 1 << zoom;
      for(let tileX=startX; tileX<=endX; tileX++){
        for(let tileY=startY; tileY<=endY; tileY++){
          if(tileY < 0 || tileY >= tileCount) continue;
          let normX = tileX % tileCount;
          if(normX < 0) normX += tileCount;
          const img = getTile(zoom, normX, tileY);
          const dx = Math.round(tileX * TILE_SIZE - topLeftX);
          const dy = Math.round(tileY * TILE_SIZE - topLeftY);
          if(img && img.complete){
            ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    };

    const drawRoutes = ()=>{
      ctx.save();
      ctx.lineCap="round"; ctx.lineJoin="round";
      tracks.forEach(track=>{
        const pathSegments = track.segments.filter(seg=>seg.isTransport && seg.from && seg.to);
        if(!pathSegments.length) return;
        ctx.strokeStyle = colorWithAlpha(track.color, 0.7);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let drew=false;
        pathSegments.forEach(seg=>{
          const a = projectPoint(seg.from.lat, seg.from.lng, view);
          const b = projectPoint(seg.to.lat, seg.to.lng, view);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          drew=true;
        });
        if(drew) ctx.stroke();
      });
      ctx.restore();
    };

    const drawLocationDots = ()=>{
      ctx.save();
      ctx.fillStyle="rgba(148,163,184,0.75)";
      locations.forEach(loc=>{
        const p = projectPoint(loc.lat, loc.lng, view);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.restore();
    };

    const updateOverlay = ()=>{
      locationPins.forEach(pin=>{
        const pos = projectPoint(pin.loc.lat, pin.loc.lng, view);
        if(pos.x < -100 || pos.x > view.width+100 || pos.y < -100 || pos.y > view.height+100){
          pin.el.style.display="none";
        }else{
          pin.el.style.display="";
          pin.el.style.left = `${pos.x}px`;
          pin.el.style.top = `${pos.y}px`;
        }
      });
      personMarkers.forEach(marker=>{
        const track = marker._track;
        const state = describeState(track, currentTime);
        if(!state){ marker.style.display="none"; return; }
        const pos = projectPoint(state.lat, state.lng, view);
        marker.style.display="";
        marker.style.left = `${pos.x}px`;
        marker.style.top = `${pos.y}px`;
        marker._statusEl.textContent = state.status || "Sin tarea";
        marker._placeEl.textContent = state.location || "";
        if(state.session){
          const start=toHHMM(state.session.startMin);
          const end=toHHMM(state.session.endMin);
          const loc = state.location ? ` ${state.location}` : "";
          marker.title = `${track.nombre}\n${start}-${end} ${state.status}${loc}`.trim();
        }else{
          marker.title = track.nombre;
        }
      });
    };

    const render = ()=>{
      drawTiles();
      drawRoutes();
      drawLocationDots();
      updateOverlay();
    };

    const updateTimeUI = ()=>{
      slider.value = String(Math.round(currentTime));
      timeLabel.textContent = toHHMM(currentTime);
    };

    const stopAnimation = ()=>{
      if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
      playing=false; lastTs=null;
      playBtn.textContent = "▶ Play";
    };

    const stepAnimation = (ts)=>{
      if(!playing){ rafId=null; return; }
      if(lastTs==null) lastTs=ts;
      const deltaSec = (ts - lastTs) / 1000;
      lastTs = ts;
      currentTime += (deltaSec * SPEED_STEPS[speedIndex]) / 60;
      if(currentTime >= maxTime){ currentTime = maxTime; stopAnimation(); }
      updateTimeUI();
      render();
      rafId = requestAnimationFrame(stepAnimation);
    };

    playBtn.onclick=()=>{
      playing = !playing;
      if(playing){
        playBtn.textContent = "⏸ Pausa";
        rafId = requestAnimationFrame(stepAnimation);
      }else{
        stopAnimation();
      }
    };

    speedBtn.onclick=()=>{
      speedIndex = (speedIndex + 1) % SPEED_STEPS.length;
      speedBtn.textContent = `Velocidad ${SPEED_STEPS[speedIndex]}x`;
    };

    const goToStop = (dir)=>{
      const current = Math.round(currentTime);
      if(dir>0){
        const next = timeStops.find(t=>t > current);
        currentTime = next ?? minTime;
      }else{
        const reversed=[...timeStops].reverse();
        const prev = reversed.find(t=>t < current);
        currentTime = prev ?? maxTime;
      }
      stopAnimation();
      updateTimeUI();
      render();
    };

    nextBtn.onclick=()=>goToStop(1);
    prevBtn.onclick=()=>goToStop(-1);

    slider.min = String(Math.floor(minTime));
    slider.max = String(Math.ceil(maxTime));
    slider.step = 1;
    slider.value = String(Math.round(currentTime));
    slider.oninput = ()=>{
      currentTime = Number(slider.value);
      stopAnimation();
      updateTimeUI();
      render();
    };

    const startDrag = { active:false, pointerId:null, origin:null };

    mapArea.addEventListener("pointerdown", (ev)=>{
      startDrag.active=true;
      startDrag.pointerId=ev.pointerId;
      startDrag.origin={ x:ev.clientX, y:ev.clientY, center:{...view.center} };
      mapArea.setPointerCapture(ev.pointerId);
      mapArea.classList.add("panning");
    });
    mapArea.addEventListener("pointermove", (ev)=>{
      if(!startDrag.active || startDrag.pointerId!==ev.pointerId) return;
      const dx = ev.clientX - startDrag.origin.x;
      const dy = ev.clientY - startDrag.origin.y;
      const centerPx = latLngToPixel(startDrag.origin.center.lat, startDrag.origin.center.lng, view.zoom);
      const newPx = { x: centerPx.x - dx, y: centerPx.y - dy };
      const raw = pixelToLatLng(newPx.x, newPx.y, view.zoom);
      view.center = clampLatLng(raw.lat, raw.lng);
      render();
    });
    const endDrag = (ev)=>{
      if(startDrag.active && (!ev || startDrag.pointerId===ev.pointerId)){
        startDrag.active=false;
        mapArea.classList.remove("panning");
        if(ev) mapArea.releasePointerCapture(ev.pointerId);
      }
    };
    mapArea.addEventListener("pointerup", endDrag);
    mapArea.addEventListener("pointercancel", endDrag);
    mapArea.addEventListener("pointerleave", (ev)=>{ if(startDrag.active) endDrag(ev); });

    mapArea.addEventListener("wheel", (ev)=>{
      ev.preventDefault();
      const delta = Math.sign(ev.deltaY);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom - delta));
      if(newZoom === view.zoom) return;
      const rect = mapArea.getBoundingClientRect();
      const point = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      const before = latLngToPixel(view.center.lat, view.center.lng, view.zoom);
      const offset = { x: before.x + (point.x - view.width/2), y: before.y + (point.y - view.height/2) };
      const focusLatLng = pixelToLatLng(offset.x, offset.y, view.zoom);
      view.zoom = newZoom;
      const focusPx = latLngToPixel(focusLatLng.lat, focusLatLng.lng, newZoom);
      const newCenterPx = { x: focusPx.x - (point.x - view.width/2), y: focusPx.y - (point.y - view.height/2) };
      const newCenter = pixelToLatLng(newCenterPx.x, newCenterPx.y, newZoom);
      view.center = clampLatLng(newCenter.lat, newCenter.lng);
      render();
    }, { passive:false });

    const onResize = ()=>{ resize(); };
    window.addEventListener("resize", onResize);

    const cleanup = ()=>{
      stopAnimation();
      window.removeEventListener("resize", onResize);
      mapArea.classList.remove("panning");
    };
    cont._mapCleanup = cleanup;

    resize();
    speedBtn.textContent = `Velocidad ${SPEED_STEPS[speedIndex]}x`;
    updateTimeUI();
    render();
  };
})();


(function(){
  "use strict";
  const ACTION_TYPE_TRANSPORT = window.ACTION_TYPE_TRANSPORT || "TRANSPORTE";
  const colorForSession=(session)=>{
    if(session.actionType===ACTION_TYPE_TRANSPORT) return "#22d3ee";
    return state.taskTypes.find(t=>t.id===session.taskTypeId)?.color || "#60a5fa";
  };
  const labelForSession=(session)=>{
    const catalogName=state.taskTypes.find(t=>t.id===session.taskTypeId)?.nombre || "";
    return (session.actionName||"").trim() || catalogName || "Sin tarea";
  };
  const shortTag=(tid)=> tid===TASK_MONTAGE?"M":(tid===TASK_DESMONT?"D":"");

  window.buildGantt=(cont,persons)=>{
    cont.innerHTML="";
    const wrap=el("div","gwrap");
    const head=el("div","gantt-header"); head.appendChild(el("div",null,"Persona"));
    const hours=el("div","gantt-hours"); for(let h=0;h<24;h++) hours.appendChild(el("div",null,String(h).padStart(2,"0")+":00"));
    head.appendChild(hours); wrap.appendChild(head);

    persons.forEach(p=>{
      const row=el("div","gantt-row");
      row.appendChild(el("div",null,p.nombre));
      const track=el("div","gantt-track");
      (state.sessions?.[p.id]||[]).forEach(s=>{
        const seg=el("div","seg");
        seg.style.left=((s.startMin/1440)*100)+"%";
        seg.style.width=(((s.endMin-s.startMin)/1440)*100)+"%";
        seg.style.background=colorForSession(s);
        const label=labelForSession(s);
        seg.title=toHHMM(s.startMin)+"-"+toHHMM(s.endMin)+" · "+label;
        seg.appendChild(el("div","meta",(shortTag(s.taskTypeId)?shortTag(s.taskTypeId)+" · ":"")+label));
        track.appendChild(seg);
      });
      row.appendChild(track); wrap.appendChild(row);
    });
    cont.appendChild(wrap);
  };

  const toName = (id,arr,key="id",field="nombre")=> arr.find(x=>x[key]===id)?.[field]||"-";

  window.buildCards=(cont,persons)=>{
    cont.innerHTML="";
    const tools=el("div","row"); const pr=el("button","btn small","Imprimir"); pr.onclick=()=>window.print(); tools.appendChild(pr); cont.appendChild(tools);
    const list=el("div","cardlist");
    persons.forEach(p=>{
      const card=el("div","card"); card.appendChild(el("h4",null,p.nombre));
      const body=el("div");
      (state.sessions?.[p.id]||[]).forEach(s=>{
        const item=el("div","item");
        item.appendChild(el("div",null, toHHMM(s.startMin)+"–"+toHHMM(s.endMin)));
        item.appendChild(el("div",null, [ labelForSession(s), toName(s.locationId,state.locations) ].join(" · ")));
        body.appendChild(item);
        if(s.materiales?.length){
          const txt=s.materiales.map(m=> (toName(m.materialTypeId,state.materialTypes))+" x "+(m.cantidad||0)).join(", ");
          body.appendChild(el("div","mini","Materiales: "+txt));
        }
        if(s.comentario){ body.appendChild(el("div","mini","Notas: "+s.comentario)); }
      });
      card.appendChild(body); list.appendChild(card);
    });
    cont.appendChild(list);
  };

  window.buildSummary=(cont,persons)=>{
    cont.innerHTML="";
    const tbl=el("table"); const thead=el("thead"); const trh=el("tr");
    ["Persona","Acciones","Min totales","Por tarea"].forEach(h=>trh.appendChild(el("th",null,h))); thead.appendChild(trh); tbl.appendChild(thead);
    const tb=el("tbody");
    persons.forEach(p=>{
      const arr=(state.sessions?.[p.id]||[]); let mins=0; const byTask=new Map();
      arr.forEach(s=>{ const d=(s.endMin-s.startMin); mins+=d; const k=labelForSession(s) || "Sin tarea"; byTask.set(k,(byTask.get(k)||0)+d); });
      const tr=el("tr");
      tr.appendChild(el("td",null,p.nombre)); tr.appendChild(el("td",null,String(arr.length))); tr.appendChild(el("td",null,String(mins)));
      tr.appendChild(el("td",null, Array.from(byTask.entries()).map(([k,v])=>k+": "+v+"m").join(" · ") || "-"));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); cont.appendChild(tbl);
  };
})();


(function(){
  "use strict";
  const ACTION_TYPE_TRANSPORT = window.ACTION_TYPE_TRANSPORT || "TRANSPORTE";
  const ACTION_TYPE_NORMAL = window.ACTION_TYPE_NORMAL || "NORMAL";
  function emitChanged(){ document.dispatchEvent(new Event("catalogs-changed")); touch(); }

  function lockMark(tr, locked){ if(!locked) return; tr.setAttribute("data-locked","true"); tr.querySelectorAll("button,input,select").forEach(n=>{ if(n.tagName==="BUTTON" && /eliminar/i.test(n.textContent||"")) n.disabled=true; else if(n.tagName!=="BUTTON") n.disabled=true; }); }

  window.openCatLoc = (cont)=>{
    cont.innerHTML=""; cont.appendChild(el("h3",null,"Catálogo: Localizaciones"));
    const add=el("div","row");
    const name=el("input","input"); name.placeholder="Nombre";
    const latlng=el("input","input"); latlng.placeholder="lat,long";
    const b=el("button","btn","Añadir");
    b.onclick=()=>{
      const n=name.value.trim();
      const raw=(latlng.value||"").trim();
      const parts=raw.split(",").map(s=>s.trim()).filter(Boolean);
      const lat=parts[0];
      const lng=parts[1];
      const latNum=Number(lat);
      const lngNum=Number(lng);
      if(!n) return;
      if(parts.length<2 || !lat || !lng || !Number.isFinite(latNum) || !Number.isFinite(lngNum) || Math.abs(latNum)>90 || Math.abs(lngNum)>180){
        latlng.classList.add("err");
        if(typeof flashStatus==="function") flashStatus("Introduce latitud y longitud válidas");
        return;
      }
      latlng.classList.remove("err");
      state.locations.push({id:"L_"+(state.locations.length+1), nombre:n, lat:lat, lng:lng});
      name.value=""; latlng.value=""; emitChanged(); openCatLoc(cont);
    };
    add.appendChild(name); add.appendChild(latlng); add.appendChild(b); cont.appendChild(add);

    const tbl=el("table"); const tb=el("tbody"); tbl.appendChild(tb);
    state.locations.forEach((l,i)=>{
      const tr=el("tr");
      const n=el("input","input"); n.value=l.nombre; n.oninput=()=>{ l.nombre=n.value; touch(); };
      const ll=el("input","input"); ll.value=(l.lat||"")+","+(l.lng||""); ll.oninput=()=>{ const sp=(ll.value||"").split(","); l.lat=(sp[0]||"").trim(); l.lng=(sp[1]||"").trim(); touch(); };
      const del=el("button","btn danger","Eliminar"); del.onclick=()=>{ state.locations.splice(i,1); emitChanged(); openCatLoc(cont); };
      tr.appendChild(n); tr.appendChild(ll); tr.appendChild(del); tb.appendChild(tr);
    });
    cont.appendChild(tbl);
  };

  window.openCatTask = (cont)=>{
    cont.innerHTML=""; cont.appendChild(el("h3",null,"Catálogo: Tareas"));
    const add=el("div","row");
    const name=el("input","input"); name.placeholder="Nombre";
    const color=el("input","input"); color.type="color"; color.value="#60a5fa";
    const typeSel=el("select","input");
    [
      {label:"Normal", value:ACTION_TYPE_NORMAL},
      {label:"Transporte", value:ACTION_TYPE_TRANSPORT}
    ].forEach(opt=>{ const o=el("option",null,opt.label); o.value=opt.value; typeSel.appendChild(o); });
    const b=el("button","btn","Añadir");
    b.onclick=()=>{
      const n=name.value.trim(); if(!n) return;
      state.taskTypes.push({
        id:"T_"+(state.taskTypes.length+1),
        nombre:n,
        color:color.value||"#60a5fa",
        locked:false,
        tipo:typeSel.value||ACTION_TYPE_NORMAL,
        quien:"CLIENTE"
      });
      name.value=""; emitChanged(); openCatTask(cont);
    };
    add.appendChild(name); add.appendChild(color); add.appendChild(typeSel); add.appendChild(b); cont.appendChild(add);

    // Lista
    const tbl=el("table"); const tb=el("tbody"); tbl.appendChild(tb);
    // Orden: bloqueados primero
    const order=id=>({[TASK_TRANSP]:0,[TASK_MONTAGE]:1,[TASK_DESMONT]:2}[id]??9);
    [...state.taskTypes].sort((a,b)=> (a.locked===b.locked? order(a.id)-order(b.id) : (a.locked?-1:1)) || (a.nombre||"").localeCompare(b.nombre||"") )
      .forEach((t,idx)=>{
        const i= state.taskTypes.findIndex(x=>x.id===t.id);
        const tr=el("tr");
        const n=el("input","input"); n.value=t.nombre; n.oninput=()=>{ t.nombre=n.value; touch(); };
        const c=el("input","input"); c.type="color"; c.value=t.color||"#60a5fa"; c.oninput=()=>{ t.color=c.value; touch(); };
        const tipo=el("span","mini",t.tipo||ACTION_TYPE_NORMAL);
        const quien=el("span","mini",t.quien||"CLIENTE");
        const del=el("button","btn danger","Eliminar"); del.onclick=()=>{ state.taskTypes.splice(i,1); emitChanged(); openCatTask(cont); };
        tr.appendChild(n); tr.appendChild(c); tr.appendChild(tipo); tr.appendChild(quien); tr.appendChild(del); tb.appendChild(tr);
        lockMark(tr, !!t.locked);
      });
    cont.appendChild(tbl);
  };

  window.openCatMat = (cont)=>{
    cont.innerHTML=""; cont.appendChild(el("h3",null,"Catálogo: Materiales"));
    const add=el("div","row");
    const name=el("input","input"); name.placeholder="Nombre";
    const b=el("button","btn","Añadir");
    b.onclick=()=>{
      const n=name.value.trim(); if(!n) return;
      state.materialTypes.push({id:"MT_"+(state.materialTypes.length+1), nombre:n});
      name.value=""; emitChanged(); openCatMat(cont);
    };
    add.appendChild(name); add.appendChild(b); cont.appendChild(add);

    const tbl=el("table"); const tb=el("tbody"); tbl.appendChild(tb);
    state.materialTypes.forEach((t,i)=>{
      const tr=el("tr");
      const n=el("input","input"); n.value=t.nombre; n.oninput=()=>{ t.nombre=n.value; touch(); };
      const del=el("button","btn danger","Eliminar"); del.onclick=()=>{ state.materialTypes.splice(i,1); emitChanged(); openCatMat(cont); };
      tr.appendChild(n); tr.appendChild(del); tb.appendChild(tr);
    });
    cont.appendChild(tbl);
  };

  window.openCatVeh = (cont)=>{
    cont.innerHTML=""; cont.appendChild(el("h3",null,"Catálogo: Vehículos"));
    const add=el("div","row");
    const name=el("input","input"); name.placeholder="Nombre";
    const b=el("button","btn","Añadir");
    b.onclick=()=>{ const n=name.value.trim(); if(!n) return; state.vehicles.push({id:"V_"+(state.vehicles.length+1), nombre:n, locked:false}); name.value=""; emitChanged(); openCatVeh(cont); };
    add.appendChild(name); add.appendChild(b); cont.appendChild(add);

    const tbl=el("table"); const tb=el("tbody"); tbl.appendChild(tb);
    [...state.vehicles].sort((a,b)=> (a.locked===b.locked?0:(a.locked?-1:1)) || (a.nombre||"").localeCompare(b.nombre||""))
      .forEach((v,idx)=>{
        const i= state.vehicles.findIndex(x=>x.id===v.id);
        const tr=el("tr");
        const n=el("input","input"); n.value=v.nombre; n.oninput=()=>{ v.nombre=n.value; touch(); };
        const del=el("button","btn danger","Eliminar"); del.onclick=()=>{ state.vehicles.splice(i,1); emitChanged(); openCatVeh(cont); };
        tr.appendChild(n); tr.appendChild(del); tb.appendChild(tr);
        lockMark(tr, !!v.locked);
      });
    cont.appendChild(tbl);
  };
})();


(function(){
  "use strict";
  const autoGrow=(ta)=>{ ta.style.height="auto"; ta.style.height=(ta.scrollHeight)+"px"; };
  const lockChip=(txt)=>{ const d=el("div","lock-chip"); d.appendChild(el("span","ico","🔒")); d.appendChild(el("span",null,txt||"-")); return d; };
  const ACTION_TYPE_TRANSPORT="TRANSPORTE";
  const ACTION_TYPE_NORMAL="NORMAL";
  window.ACTION_TYPE_TRANSPORT = window.ACTION_TYPE_TRANSPORT || ACTION_TYPE_TRANSPORT;
  window.ACTION_TYPE_NORMAL = window.ACTION_TYPE_NORMAL || ACTION_TYPE_NORMAL;

  const ensureActionDefaults=(action)=>{
    if(!action) return;
    if(typeof action.tipo==="undefined") action.tipo=ACTION_TYPE_NORMAL;
    if(typeof action.quien==="undefined") action.quien="CLIENTE";
    if(!action.color){
      action.color = action.tipo===ACTION_TYPE_TRANSPORT?"#22d3ee":"#60a5fa";
    }
  };

  const ensureSessionDefaults=(s)=>{
    if(!s) return;
    if(typeof s.actionType==="undefined"){
      if(s.taskTypeId===TASK_TRANSP){
        s.actionType=ACTION_TYPE_TRANSPORT;
      }else{
        s.actionType=ACTION_TYPE_NORMAL;
      }
    }
    if(typeof s.actionName==="undefined"){
      const fallback=state.taskTypes?.find(t=>t.id===s.taskTypeId)?.nombre || "";
      s.actionName=fallback;
    }
    if(s.actionType===ACTION_TYPE_TRANSPORT && !s.taskTypeId){
      s.taskTypeId=TASK_TRANSP;
    }
  };

  const ensureActionEntry=(pid,s)=>{
    ensureSessionDefaults(s);
    const name=(s.actionName||"").trim();
    const tipo=s.actionType===ACTION_TYPE_TRANSPORT?ACTION_TYPE_TRANSPORT:ACTION_TYPE_NORMAL;
    const owner=pid||"CLIENTE";
    if(!name){
      if(tipo===ACTION_TYPE_TRANSPORT){
        s.taskTypeId=TASK_TRANSP;
      }else if(s.taskTypeId===TASK_TRANSP){
        s.taskTypeId=null;
      }
      return;
    }
    state.taskTypes=state.taskTypes||[];
    const existing=state.taskTypes.find(t=> (t.nombre||"").trim().toLowerCase()===name.toLowerCase() && (t.quien||owner)===owner && (t.tipo||ACTION_TYPE_NORMAL)===tipo);
    if(existing){
      ensureActionDefaults(existing);
      existing.nombre=name;
      existing.tipo=tipo;
      existing.quien=owner;
      existing.color = tipo===ACTION_TYPE_TRANSPORT?"#22d3ee":(existing.color||"#60a5fa");
      s.taskTypeId=existing.id;
      return;
    }
    let target=null;
    if(s.taskTypeId){
      target=state.taskTypes.find(t=>t.id===s.taskTypeId);
    }
    if(!target || target.locked){
      const uniqueId=`ACT_${Math.random().toString(36).slice(2,8)}${Date.now().toString(36)}`;
      target={id:target&&target.locked?uniqueId:(s.taskTypeId||uniqueId)};
      state.taskTypes.push(target);
    }
    target.nombre=name;
    target.tipo=tipo;
    target.quien=owner;
    target.color = tipo===ACTION_TYPE_TRANSPORT?"#22d3ee":"#60a5fa";
    target.locked=false;
    s.taskTypeId=target.id;
  };


  window.renderVerticalEditor = (container,pid)=>{
    container.innerHTML="";
  
    const list=getPersonSessions(pid);
    list.forEach(ensureSessionDefaults);
    const first=list[0];
    if(first && first.actionType===ACTION_TYPE_TRANSPORT){
      first.actionType=ACTION_TYPE_NORMAL;
      first.vehicleId=null;
      first.taskTypeId=null;
      ensureActionEntry(pid,first);
      recomputeLocations(pid);
      touch();
    }
    if(!list.length){ container.appendChild(el("div","mini","No hay acciones.")); return; }
  
    const computeTransportFlow=(targetIdx)=>{
      let cur=null;
      for(let i=0;i<list.length;i++){
        const item=list[i];
        if(i===targetIdx){
          return {origin:cur,destination:item.locationId||cur};
        }
        if(i===0 && item.actionType!==ACTION_TYPE_TRANSPORT){
          cur=item.locationId||cur;
          continue;
        }
        if(item.actionType===ACTION_TYPE_TRANSPORT){
          const dest=item.locationId||cur;
          cur=dest;
        }else{
          cur=item.locationId||cur;
        }
      }
      const fallback=list[targetIdx];
      return {origin:cur,destination:fallback?.locationId||cur};
    };
  
    list.forEach((s,idx)=>{
      ensureSessionDefaults(s);
      const row=el("div","vrow"); if(getSelected(pid)===idx) row.classList.add("selected");
  
      const sel=el("div","selcell");
      const header=el("div","slot-index");
      const bSel=el("button","btn chip",String(idx+1)); bSel.title="Seleccionar"; bSel.onclick=(e)=>{ e.stopPropagation(); setSelected(pid,idx); renderVerticalEditor(container,pid); };
      const bDel=el("button","btn danger icon","✕"); bDel.title="Eliminar"; bDel.onclick=(e)=>{ e.stopPropagation(); deleteAtIndex(pid,idx); renderClient(); };
      const range=el("span","time-range", toHHMM(s.startMin)+"-"+toHHMM(s.endMin));
      const timeAdjust=el("div","time-adjust");
      const doResize=(delta)=>{
        const cur=s.endMin-s.startMin;
        const target=Math.max(5, cur+delta);
        const nd=Math.max(5, Math.round(target/5)*5);
        if(nd===cur) return;
        resizeSegment(pid, idx, nd);
        renderVerticalEditor(container,pid);
      };
      const plus=el("button","icon-btn","+"); plus.title="Aumentar duracion"; plus.onclick=(e)=>{ e.stopPropagation(); doResize(5); };
      const minus=el("button","icon-btn","−"); minus.title="Reducir duracion"; minus.onclick=(e)=>{ e.stopPropagation(); doResize(-5); };
      timeAdjust.appendChild(plus); timeAdjust.appendChild(minus);
      const timeDisplay=el("div","time-display");
      const timeMain=el("div","time-main");
      timeMain.appendChild(range); timeMain.appendChild(timeAdjust);
      timeDisplay.appendChild(timeMain);
      const durationHint=el("div","duration-hint","Duración: "+String(s.endMin-s.startMin)+" min");
      timeDisplay.appendChild(durationHint);
      header.appendChild(bSel); header.appendChild(bDel); header.appendChild(timeDisplay);
      sel.appendChild(header);
      row.appendChild(sel);
  
      const tdiv=el("div","param task-cell"); tdiv.appendChild(el("label",null,"Tarea"));
      const nameInput=el("input","input"); nameInput.type="text"; nameInput.placeholder="Nombre de la acción"; nameInput.value=s.actionName||"";
      nameInput.oninput=()=>{
        s.actionName=nameInput.value;
        ensureActionEntry(pid,s);
        touch();
      };
      nameInput.onblur=()=>{ ensureActionEntry(pid,s); touch(); renderVerticalEditor(container,pid); };
      tdiv.appendChild(nameInput);
      const typeWrap=el("div","action-type-picker");
      const mkRadio=(label,value)=>{
        const wrap=el("label","radio-option");
        const input=el("input"); input.type="radio"; input.name=`action-type-${pid}-${idx}`; input.value=value;
        if(s.actionType===value) input.checked=true;
        input.onchange=()=>{
          s.actionType=value;
          if(value!==ACTION_TYPE_TRANSPORT){
            if(s.vehicleId){ s.vehicleId=null; }
          }
          ensureActionEntry(pid,s);
          recomputeLocations(pid);
          touch();
          renderVerticalEditor(container,pid);
        };
        wrap.appendChild(input);
        wrap.appendChild(el("span",null,label));
        return wrap;
      };
      typeWrap.appendChild(mkRadio("Normal",ACTION_TYPE_NORMAL));
      typeWrap.appendChild(mkRadio("Transporte",ACTION_TYPE_TRANSPORT));
      tdiv.appendChild(typeWrap);
      row.appendChild(tdiv);
  
      const ldiv=el("div","param location-cell");
      if(idx===0 && s.actionType!==ACTION_TYPE_TRANSPORT){
        ldiv.innerHTML="<label>Localizacion inicial</label>";
        const name=state.locations.find(x=>x.id===s.locationId)?.nombre || "-";
        ldiv.appendChild(lockChip(name));
      }else if(s.actionType===ACTION_TYPE_TRANSPORT){
        ldiv.classList.add("stacked");
        ldiv.innerHTML="<label>Destino</label>";
        const lsel=el("select","input"); const l0=el("option",null,"- seleccionar -"); l0.value=""; lsel.appendChild(l0);
        state.locations.forEach(l=>{ const o=el("option",null,l.nombre); o.value=l.id; if(l.id===s.locationId) o.selected=true; lsel.appendChild(o); });
        lsel.onchange=()=>{ s.locationId=lsel.value||null; recomputeLocations(pid); touch(); renderVerticalEditor(container,pid); };
        ldiv.appendChild(lsel);
        const flow=computeTransportFlow(idx);
        const originName=state.locations.find(x=>x.id===flow.origin)?.nombre || "-";
        const destName=state.locations.find(x=>x.id===flow.destination)?.nombre || "-";
        const flowText=`Origen → ${originName} · Destino → ${destName}`;
        ldiv.appendChild(el("div","duration-hint transport-flow",flowText));
      }else{
        const name=state.locations.find(x=>x.id===s.locationId)?.nombre || "-";
        ldiv.appendChild(lockChip(name));
      }
      row.appendChild(ldiv);
  
      const vdiv=el("div","param vehicle-cell"); vdiv.innerHTML="<label>Vehiculo</label>";
      if(s.actionType===ACTION_TYPE_TRANSPORT){
        const vsel=el("select","input"); const v0=el("option",null,"- seleccionar -"); v0.value=""; vsel.appendChild(v0);
        state.vehicles.forEach(v=>{ const o=el("option",null,v.nombre); o.value=v.id; if(v.id===s.vehicleId) o.selected=true; vsel.appendChild(o); });
        if(!s.vehicleId){ const def=state.vehicles.find(v=>v.id==="V_WALK")?.id; if(def) s.vehicleId=def; }
        vsel.onchange=()=>{ s.vehicleId=vsel.value||null; touch(); };
        vdiv.appendChild(vsel);
      }else vdiv.appendChild(lockChip("No aplica"));
      row.appendChild(vdiv);
  
      const mdiv=el("div","param materials-cell");
      const mheader=el("div","materials-header");
      const mlabel=el("label",null,"Materiales");
      mheader.appendChild(mlabel); mdiv.appendChild(mheader);
      const txt=(s.materiales||[]).map(m=> (state.materialTypes.find(mt=>mt.id===m.materialTypeId)?.nombre||"Material")+" x "+(parseInt(m.cantidad||"0",10)||0)).join(", ");
      mdiv.appendChild(el("div","materials-summary", txt||"Sin materiales"));
      row.appendChild(mdiv);
  
      const ndiv=el("div","param notes-cell");
      const nlabel=el("label",null,"Notas");
      const ta=el("textarea","input"); ta.rows=3; ta.value=String(s.comentario||""); ta.placeholder="Comentarios de la accion";
      ta.oninput=()=>{ s.comentario=ta.value; touch(); autoGrow(ta); };
      setTimeout(()=>autoGrow(ta),0); ndiv.appendChild(nlabel); ndiv.appendChild(ta); row.appendChild(ndiv);
  
      container.appendChild(row);
    });
  };

  window.renderClient = ()=>{
    const pid = (state.project.view.lastTab==="CLIENTE" || !state.project.view.lastTab)? "CLIENTE" : state.project.view.lastTab;
    const root=$("#clienteView"); if(!root) return;
    root.innerHTML="";
    const sessions=getPersonSessions(pid);
    state.localizacionInicial=state.localizacionInicial||{};
    const bar=el("div","toolbar");
    if(!sessions.length){
      const lbl=el("span","mini","Hora inicio");
      const ti=el("input","input"); ti.type="time";
      ti.value = toHHMM(state.horaInicial?.[pid] ?? 9*60);
      ti.onchange=()=>{
        state.horaInicial[pid]=toMin(ti.value||"09:00");
        if(sessions.length){
          rebaseTo(pid,state.horaInicial[pid]);
        }else{
          touch();
        }
        renderClient();
      };
      const lloc=el("span","mini","Localizacion inicio");
      const lsel=el("select","input");
      const l0=el("option",null,"- seleccionar -"); l0.value=""; lsel.appendChild(l0);
      const initialLoc=state.localizacionInicial?.[pid] ?? null;
      state.locations.forEach(l=>{ const o=el("option",null,l.nombre); o.value=l.id; if(l.id===initialLoc) o.selected=true; lsel.appendChild(o); });
      lsel.onchange=()=>{
        state.localizacionInicial[pid]=lsel.value||null;
        touch();
        renderClient();
      };
      bar.appendChild(lbl); bar.appendChild(ti); bar.appendChild(lloc); bar.appendChild(lsel);
    }
    const add=el("button","btn primary","Crear accion");
    add.onclick=()=>{ const idx=getSelected(pid); addAfterIndex(pid, (idx==null? -1: idx), 15); renderClient(); };
    bar.appendChild(add); root.appendChild(bar);

    const v=el("div","vlist"); root.appendChild(v);
    renderVerticalEditor(v,pid);
  };
})();



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


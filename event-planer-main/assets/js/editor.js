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
      return {origin:cur,destination=fallback?.locationId||cur};
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


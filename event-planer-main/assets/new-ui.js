
(function(){
  "use strict";

  const RELATION_LABEL = {
    milestone: "Hito",
    pre: "Pre",
    post: "Post",
    parallel: "Paralela"
  };
  const RELATION_ORDER = { milestone:0, pre:1, parallel:2, post:3 };
  const RELATION_COLOR = {
    milestone: "#2563eb",
    pre: "#a855f7",
    post: "#f97316",
    parallel: "#14b8a6"
  };
  const ACTION_TYPE_TRANSPORT = window.ACTION_TYPE_TRANSPORT || "TRANSPORTE";
  const ACTION_TYPE_NORMAL = window.ACTION_TYPE_NORMAL || "NORMAL";

  let seq = 0;
  const nextId = ()=>`T_${Date.now().toString(36)}${(++seq).toString(36)}`;

  const originalEnsureDefaults = window.ensureDefaults || (()=>{});
  const originalEnsureLinkFields = window.ensureLinkFields || (()=>{});

  const clientTargets = new Set();
  let catalogTarget = null;

  const ensureViewDefaults = ()=>{
    state.project = state.project || {};
    state.project.view = state.project.view || {};
    state.project.view.lastTab = "CLIENTE";
    if(typeof state.project.view.selectedTaskId === "undefined") state.project.view.selectedTaskId = null;
    if(typeof state.project.view.timelineEditorId === "undefined") state.project.view.timelineEditorId = null;
    state.horaInicial = state.horaInicial || {};
    state.localizacionInicial = state.localizacionInicial || {};
  };

  const toNumberOrNull = (value)=>{
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const ensureMaterial = (m)=>({
    materialTypeId: m?.materialTypeId || null,
    cantidad: Number.isFinite(Number(m?.cantidad)) ? Number(m.cantidad) : 0
  });

  const applyTaskDefaults = (task)=>{
    if(!task) return;
    if(!task.id) task.id = nextId();
    if(typeof task.structureParentId === "undefined") task.structureParentId = null;
    if(!task.structureRelation){
      task.structureRelation = task.structureParentId ? "pre" : "milestone";
    }
    if(typeof task.actionType === "undefined") task.actionType = ACTION_TYPE_NORMAL;
    task.materiales = Array.isArray(task.materiales) ? task.materiales.map(ensureMaterial) : [];
    task.assignedStaffIds = Array.isArray(task.assignedStaffIds)
      ? task.assignedStaffIds.filter(Boolean)
      : (task.assignedStaffId ? [task.assignedStaffId] : []);
    task.assignedStaffId = undefined;
    if(typeof task.locationApplies === "undefined") task.locationApplies = true;
    if(typeof task.locationId === "undefined") task.locationId = null;
    if(typeof task.comentario !== "string") task.comentario = task.comentario ? String(task.comentario) : "";
    task.startMin = toNumberOrNull(task.startMin);
    task.endMin = toNumberOrNull(task.endMin);
    task.durationMin = Number.isFinite(Number(task.durationMin)) ? Math.max(5, Math.round(Number(task.durationMin))) : null;
    if(task.startMin != null && task.endMin != null){
      task.durationMin = Math.max(5, task.endMin - task.startMin);
    }
    if(task.durationMin == null) task.durationMin = 60;
    task.limitEarlyMin = toNumberOrNull(task.limitEarlyMin);
    task.limitLateMin = toNumberOrNull(task.limitLateMin);
  };

  const ensureDuration = (task)=>{
    if(!task) return;
    if(task.startMin == null){
      task.endMin = null;
      return;
    }
    const dur = Math.max(5, Number(task.durationMin)||60);
    task.durationMin = dur;
    task.endMin = task.startMin + dur;
  };

  const getTaskList = ()=>{
    state.sessions = state.sessions || {};
    state.sessions.CLIENTE = state.sessions.CLIENTE || [];
    const list = state.sessions.CLIENTE;
    list.forEach(applyTaskDefaults);
    list.forEach(ensureDuration);
    return list;
  };

  const getTaskById = (id)=> getTaskList().find(t=>t.id===id) || null;
  const getTaskChildren = (id)=> getTaskList().filter(t=>t.structureParentId===id);
  const getRootTasks = ()=> getTaskList().filter(t=>!t.structureParentId);

  const getBreadcrumb = (task)=>{
    if(!task) return [];
    const path=[];
    let cur=task;
    const lookup=new Map(getTaskList().map(t=>[t.id,t]));
    while(cur){
      path.unshift(cur);
      if(!cur.structureParentId) break;
      cur = lookup.get(cur.structureParentId) || null;
    }
    return path;
  };

  const hierarchyOrder = ()=>{
    const order=new Map();
    let i=0;
    const visit=(node)=>{
      order.set(node.id, i++);
      getTaskChildren(node.id).forEach(child=>visit(child));
    };
    getRootTasks().sort((a,b)=>(a.startMin??0)-(b.startMin??0)).forEach(visit);
    return order;
  };

  const isTaskComplete = (task)=>{
    applyTaskDefaults(task);
    const hasName = !!(task.actionName && task.actionName.trim());
    const hasLocation = !task.locationApplies || !!task.locationId;
    if(task.structureRelation === "milestone"){
      return hasName && task.startMin != null && hasLocation;
    }
    const hasDuration = Number(task.durationMin) > 0;
    if(task.structureRelation === "post"){
      return hasName && hasDuration && task.limitLateMin != null && hasLocation;
    }
    if(task.structureRelation === "pre" || task.structureRelation === "parallel"){
      return hasName && hasDuration && task.limitEarlyMin != null && hasLocation;
    }
    return hasName;
  };

  const syncStaffSessions = ()=>{
    const list=getTaskList();
    const byStaff=new Map();
    list.forEach(task=>{
      (task.assignedStaffIds||[]).forEach(id=>{
        if(!id) return;
        if(!byStaff.has(id)) byStaff.set(id, []);
        byStaff.get(id).push(task);
      });
    });
    (state.staff||[]).forEach(st=>{
      const items = (byStaff.get(st.id) || []).slice().sort((a,b)=>{
        const sa=a.startMin??Infinity;
        const sb=b.startMin??Infinity;
        return sa-sb;
      });
      state.sessions[st.id] = items;
    });
    Object.keys(state.sessions).forEach(pid=>{
      if(pid!=="CLIENTE" && !(state.staff||[]).some(s=>s.id===pid)){
        delete state.sessions[pid];
      }
    });
  };

  const touchTask = (task)=>{
    applyTaskDefaults(task);
    ensureDuration(task);
    syncStaffSessions();
    touch();
  };

  const createTask = ({ parentId=null, relation=null }={})=>{
    const list=getTaskList();
    const task={
      id: nextId(),
      structureParentId: parentId,
      structureRelation: relation || (parentId?"pre":"milestone"),
      actionName: "",
      durationMin: 60,
      limitEarlyMin: null,
      limitLateMin: null,
      locationId: null,
      locationApplies: true,
      materiales: [],
      comentario: "",
      assignedStaffIds: [],
      startMin: parentId?null:(state.horaInicial?.CLIENTE ?? 9*60),
      endMin: null,
      actionType: ACTION_TYPE_NORMAL
    };
    ensureDuration(task);
    list.push(task);
    touchTask(task);
    state.project.view.selectedTaskId = task.id;
    return task;
  };

  const deleteTask = (id)=>{
    const list=getTaskList();
    const toRemove=new Set();
    const visit=(tid)=>{
      toRemove.add(tid);
      list.filter(t=>t.structureParentId===tid).forEach(child=>visit(child.id));
    };
    visit(id);
    state.sessions.CLIENTE = list.filter(t=>!toRemove.has(t.id));
    syncStaffSessions();
    touch();
  };

  const selectTask = (id)=>{
    state.project.view.selectedTaskId = id || null;
  };

  const formatTimeValue = (mins)=> mins==null?"":toHHMM(mins);

  const parseTimeInput = (value)=>{
    const str=String(value||"").trim();
    if(!str) return null;
    return toMin(str);
  };

  const labelForTask = (task)=> (task.actionName||"").trim() || "Sin nombre";

  const sortedTasks = (tasks)=>{
    const order=hierarchyOrder();
    return tasks.slice().sort((a,b)=>{
      const oa=order.get(a.id) ?? 0;
      const ob=order.get(b.id) ?? 0;
      if(oa!==ob) return oa-ob;
      const ra=RELATION_ORDER[a.structureRelation] ?? 5;
      const rb=RELATION_ORDER[b.structureRelation] ?? 5;
      return ra-rb;
    });
  };

  const getOrderedMilestones = ()=>{
    return getRootTasks().slice().sort((a,b)=>{
      const sa=a.startMin??Infinity; const sb=b.startMin??Infinity;
      if(sa!==sb) return sa-sb;
      return labelForTask(a).localeCompare(labelForTask(b));
    });
  };

  const locationNameById = (id)=> (state.locations||[]).find(l=>l.id===id)?.nombre || "";

  const resolveTimelineEditorId = (milestones, selectedId)=>{
    let editorId = state.project.view.timelineEditorId || null;
    if(editorId && !milestones.some(t=>t.id===editorId)){
      editorId=null;
    }
    if(!editorId){
      if(selectedId && milestones.some(t=>t.id===selectedId)) editorId=selectedId;
      else editorId = milestones[0]?.id || null;
    }
    state.project.view.timelineEditorId = editorId;
    return editorId;
  };

  const hasInitialTime = ()=> state.horaInicial?.CLIENTE != null;
  const hasInitialLocation = ()=>{
    const loc=state.localizacionInicial?.CLIENTE;
    return !(loc==null || loc==="");
  };

  const createTimelineMilestone = ()=>{
    const milestones=getOrderedMilestones();
    const isFirst=!milestones.length;
    if(isFirst && (!hasInitialTime() || !hasInitialLocation())){
      alert("Configura la hora y el lugar inicial antes de crear la primera tarea.");
      return null;
    }
    const task=createTask({ relation:"milestone" });
    if(isFirst){
      const start=state.horaInicial?.CLIENTE;
      if(start!=null){
        task.startMin=start;
        task.endMin=start + Math.max(5, Number(task.durationMin)||60);
      }
      task.locationId = state.localizacionInicial?.CLIENTE || null;
    }
    touchTask(task);
    state.project.view.timelineEditorId = task.id;
    return task;
  };

  const buildInitialConfig = ()=>{
    const wrap=el("div","timeline-empty-config");
    const locField=el("div","field-row");
    locField.appendChild(el("label",null,"Lugar inicial"));
    const locSelect=el("select","input");
    const optEmpty=el("option",null,"- seleccionar -"); optEmpty.value=""; locSelect.appendChild(optEmpty);
    (state.locations||[]).forEach(loc=>{
      const opt=el("option",null,loc.nombre||"Localización"); opt.value=loc.id; if(String(loc.id)===String(state.localizacionInicial?.CLIENTE)) opt.selected=true; locSelect.appendChild(opt);
    });
    locSelect.onchange=()=>{
      state.localizacionInicial = state.localizacionInicial || {};
      state.localizacionInicial.CLIENTE = locSelect.value || null;
      touch();
      renderClient();
    };
    locField.appendChild(locSelect);

    const timeField=el("div","field-row");
    timeField.appendChild(el("label",null,"Hora inicial"));
    const timeInput=el("input","input");
    timeInput.type="time";
    timeInput.value=formatTimeValue(state.horaInicial?.CLIENTE);
    timeInput.onchange=()=>{
      const v=parseTimeInput(timeInput.value);
      if(v==null){
        delete state.horaInicial.CLIENTE;
      }else{
        state.horaInicial.CLIENTE=v;
      }
      touch();
      renderClient();
    };
    timeField.appendChild(timeInput);

    wrap.appendChild(locField);
    wrap.appendChild(timeField);
    wrap.appendChild(el("div","timeline-hint","Define el punto de partida del cliente antes de crear la primera tarea."));
    return wrap;
  };

  const updateTimelineDuration = (task, nextDuration)=>{
    if(!task) return false;
    applyTaskDefaults(task);
    const current=Math.max(5, Number(task.durationMin)||60);
    const desired=Math.max(5, Math.round(Number(nextDuration)||current));
    if(desired===current) return false;
    const delta=desired-current;
    task.durationMin=desired;
    if(task.startMin!=null){
      task.endMin = task.startMin + desired;
    }else if(task.endMin!=null){
      task.startMin = task.endMin - desired;
    }
    const ordered=getOrderedMilestones();
    let shift=false;
    ordered.forEach(item=>{
      if(item.id===task.id){
        shift=true;
        return;
      }
      if(!shift) return;
      if(item.startMin!=null) item.startMin += delta;
      if(item.endMin!=null) item.endMin += delta;
      ensureDuration(item);
    });
    ensureDuration(task);
    syncStaffSessions();
    touch();
    return true;
  };

  const buildTimelineEditor = (task)=>{
    const wrap=el("div","timeline-editor");
    const head=el("div","timeline-editor-head");
    head.appendChild(el("h4",null,"Edición rápida"));
    const range=(task.startMin!=null && task.endMin!=null)
      ? `${toHHMM(task.startMin)} – ${toHHMM(task.endMin)}`
      : "Sin horario";
    head.appendChild(el("span","timeline-editor-range",range));
    wrap.appendChild(head);

    const body=el("div","timeline-editor-body");

    const nameRow=el("div","timeline-field");
    nameRow.appendChild(el("label",null,"Nombre de la tarea"));
    const nameInput=el("input","input"); nameInput.type="text"; nameInput.value=task.actionName||"";
    nameInput.oninput=()=>{ task.actionName = nameInput.value; };
    nameInput.onblur=()=>{ touchTask(task); renderClient(); };
    nameRow.appendChild(nameInput);
    body.appendChild(nameRow);

    const typeRow=el("div","timeline-field inline");
    const typeLabel=el("label",null,"Tipo de tarea");
    const switchWrap=el("label","pill-switch");
    const normalLabel=el("span","pill-label","Normal");
    const toggleInput=el("input"); toggleInput.type="checkbox"; toggleInput.checked = task.actionType===ACTION_TYPE_TRANSPORT;
    const toggleKnob=el("span","pill-toggle");
    const transportLabel=el("span","pill-label","Transporte");
    const updateToggleState = ()=>{
      if(toggleInput.checked){
        transportLabel.classList.add("active");
        normalLabel.classList.remove("active");
      }else{
        normalLabel.classList.add("active");
        transportLabel.classList.remove("active");
      }
    };
    toggleInput.onchange=()=>{
      task.actionType = toggleInput.checked ? ACTION_TYPE_TRANSPORT : ACTION_TYPE_NORMAL;
      updateToggleState();
      touchTask(task);
      state.project.view.timelineEditorId = task.id;
      renderClient();
    };
    updateToggleState();
    switchWrap.appendChild(normalLabel);
    switchWrap.appendChild(toggleInput);
    switchWrap.appendChild(toggleKnob);
    switchWrap.appendChild(transportLabel);
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(switchWrap);
    body.appendChild(typeRow);

    const locRow=el("div","timeline-field");
    const locLabel=el("label",null, toggleInput.checked?"Destino":"Localización");
    const destSelect=el("select","input");
    const destEmpty=el("option",null,"- seleccionar -"); destEmpty.value=""; destSelect.appendChild(destEmpty);
    (state.locations||[]).forEach(loc=>{
      const opt=el("option",null,loc.nombre||"Localización"); opt.value=loc.id; if(String(loc.id)===String(task.locationId)) opt.selected=true; destSelect.appendChild(opt);
    });
    destSelect.disabled = !toggleInput.checked;
    destSelect.onchange=()=>{
      task.locationId = destSelect.value || null;
      touchTask(task);
      state.project.view.timelineEditorId = task.id;
      renderClient();
    };
    const locHint=el("div","timeline-hint","Activa transporte para seleccionar un destino.");
    const updateLocationState = ()=>{
      destSelect.disabled = !toggleInput.checked;
      locLabel.textContent = toggleInput.checked?"Destino":"Localización";
      locHint.style.display = toggleInput.checked?"none":"";
    };
    updateLocationState();
    toggleInput.addEventListener("change", updateLocationState);
    locRow.appendChild(locLabel);
    locRow.appendChild(destSelect);
    locRow.appendChild(locHint);
    body.appendChild(locRow);

    const durationRow=el("div","timeline-duration");
    durationRow.appendChild(el("span","duration-label","Duración"));
    const durationControls=el("div","duration-controls");
    const minus=el("button","btn icon","−5");
    minus.onclick=()=>{
      const next=Math.max(5, (Number(task.durationMin)||60) - 5);
      if(updateTimelineDuration(task,next)){
        state.project.view.timelineEditorId = task.id;
        renderClient();
      }
    };
    const value=el("span","duration-value",`${Math.max(5, Number(task.durationMin)||60)} min`);
    const plus=el("button","btn icon","+5");
    plus.onclick=()=>{
      const next=Math.max(5, (Number(task.durationMin)||60) + 5);
      if(updateTimelineDuration(task,next)){
        state.project.view.timelineEditorId = task.id;
        renderClient();
      }
    };
    durationControls.appendChild(minus);
    durationControls.appendChild(value);
    durationControls.appendChild(plus);
    durationRow.appendChild(durationControls);
    body.appendChild(durationRow);

    wrap.appendChild(body);
    return wrap;
  };

  const renderTimeline = (container, selectedId)=>{
    container.innerHTML="";
    const header=el("div","timeline-head");
    header.appendChild(el("h3",null,"Horario fijo del cliente"));
    const addBtn=el("button","btn small","Crear tarea");
    const handleCreate=()=>{
      const task=createTimelineMilestone();
      if(task){
        selectTask(task.id);
        renderClient();
      }
    };
    addBtn.onclick=handleCreate;
    header.appendChild(addBtn);
    container.appendChild(header);

    const milestones=getOrderedMilestones();
    if(!milestones.length){
      addBtn.disabled = !hasInitialTime() || !hasInitialLocation();
    }else{
      addBtn.disabled = false;
    }

    const list=el("div","timeline-track");
    if(!milestones.length){
      list.appendChild(el("div","timeline-empty","Todavía no hay tareas en el horario."));
    }else{
      const editorId = resolveTimelineEditorId(milestones, selectedId);
      milestones.forEach(task=>{
        const card=el("button","timeline-card");
        if(task.id===editorId) card.classList.add("active");
        const hasRange=(task.startMin!=null && task.endMin!=null);
        const time=hasRange ? `${toHHMM(task.startMin)} – ${toHHMM(task.endMin)}` : (task.startMin!=null ? toHHMM(task.startMin) : "Sin hora");
        card.appendChild(el("div","time",time));
        card.appendChild(el("div","title",labelForTask(task)));
        const locName=locationNameById(task.locationId) || "Sin localización";
        card.appendChild(el("div","mini",locName));
        card.onclick=()=>{
          selectTask(task.id);
          state.project.view.timelineEditorId = task.id;
          renderClient();
        };
        list.appendChild(card);
      });
    }
    container.appendChild(list);

    if(!milestones.length){
      state.project.view.timelineEditorId = null;
      container.appendChild(buildInitialConfig());
    }else{
      const editorId = resolveTimelineEditorId(milestones, selectedId);
      const editorTask = editorId ? milestones.find(t=>t.id===editorId) : null;
      if(editorTask){
        container.appendChild(buildTimelineEditor(editorTask));
      }
    }
  };

  const renderCatalog = (container, tasks, selectedId)=>{
    container.innerHTML="";
    const toolbar=el("div","catalog-toolbar");
    const addBtn=el("button","btn primary full","+ Nuevo hito" );
    addBtn.onclick=()=>{ createTask({relation:"milestone"}); renderClient(); };
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    const sections=[
      { key:"pending", title:"Acciones con datos pendientes", filter:(t)=>!isTaskComplete(t) },
      { key:"complete", title:"Acciones completas", filter:(t)=>isTaskComplete(t) }
    ];

    sections.forEach(section=>{
      const sec=el("div","catalog-section");
      sec.appendChild(el("div","catalog-title",section.title));
      const list=sortedTasks(tasks.filter(section.filter));
      if(!list.length){
        sec.appendChild(el("div","mini muted","Sin tareas"));
      }else{
        const grid=el("div","catalog-grid");
        list.forEach(task=>{
          const item=el("button","catalog-item","");
          if(task.id===selectedId) item.classList.add("active");
          item.onclick=()=>{ selectTask(task.id); renderClient(); };

          const title=el("div","catalog-name",labelForTask(task));
          item.appendChild(title);
          const relationLabel=RELATION_LABEL[task.structureRelation] || "Tarea";
          item.appendChild(el("span","relation-tag",relationLabel));
          const meta=el("div","catalog-meta");
          const time=task.startMin!=null ? toHHMM(task.startMin) : "Sin hora";
          meta.appendChild(el("span","catalog-time",time));
          const duration=task.durationMin!=null ? `${task.durationMin} min` : "Sin duración";
          meta.appendChild(el("span","catalog-duration",duration));
          item.appendChild(meta);

          const path=getBreadcrumb(task);
          if(path.length>1){
            const trail=path.slice(0,-1).map(node=>labelForTask(node)).join(" · ");
            item.appendChild(el("div","mini muted",trail));
          }
          grid.appendChild(item);
        });
        sec.appendChild(grid);
      }
      container.appendChild(sec);
    });
  };

  const renderMaterials = (task)=>{
    const wrap=el("div","materials-section");
    wrap.appendChild(el("h4",null,"Materiales"));
    const table=el("div","materials-list");
    if(!task.materiales.length){
      table.appendChild(el("div","mini muted","Sin materiales"));
    }
    task.materiales.forEach((mat,idx)=>{
      const row=el("div","material-row");
      const sel=el("select","input");
      const opt0=el("option",null,"- seleccionar -"); opt0.value=""; sel.appendChild(opt0);
      (state.materialTypes||[]).forEach(mt=>{
        const opt=el("option",null,mt.nombre||"Material"); opt.value=mt.id; if(mt.id===mat.materialTypeId) opt.selected=true; sel.appendChild(opt);
      });
      sel.onchange=()=>{ task.materiales[idx].materialTypeId = sel.value||null; touchTask(task); renderClient(); };
      const qty=el("input","input"); qty.type="number"; qty.min="0"; qty.step="1"; qty.value=String(mat.cantidad||0);
      qty.onchange=()=>{ task.materiales[idx].cantidad = Number(qty.value)||0; touchTask(task); };
      const del=el("button","btn small", "Quitar");
      del.onclick=()=>{ task.materiales.splice(idx,1); touchTask(task); renderClient(); };
      row.appendChild(sel); row.appendChild(qty); row.appendChild(del);
      table.appendChild(row);
    });
    const add=el("button","btn small", "Añadir material");
    add.onclick=()=>{ task.materiales.push({materialTypeId:null,cantidad:0}); touchTask(task); renderClient(); };
    wrap.appendChild(table);
    wrap.appendChild(add);
    return wrap;
  };

  const renderStaffPicker = (task)=>{
    const wrap=el("div","staff-section");
    wrap.appendChild(el("h4",null,"Asignación a staff"));
    const list=el("div","staff-picker");
    if(!(state.staff||[]).length){
      list.appendChild(el("div","mini muted","Añade miembros del staff desde la barra lateral."));
    }
    (state.staff||[]).forEach(st=>{
      const btn=el("button","staff-toggle",st.nombre||st.id);
      if((task.assignedStaffIds||[]).includes(st.id)) btn.classList.add("active");
      btn.onclick=()=>{
        const current=new Set(task.assignedStaffIds||[]);
        if(current.has(st.id)) current.delete(st.id); else current.add(st.id);
        task.assignedStaffIds=Array.from(current);
        touchTask(task);
        renderClient();
      };
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    return wrap;
  };

  const relationInfo = (task)=>{
    if(task.structureRelation==="post" && task.limitLateMin!=null) return `≤ ${toHHMM(task.limitLateMin)}`;
    if((task.structureRelation==="pre" || task.structureRelation==="parallel") && task.limitEarlyMin!=null) return `≥ ${toHHMM(task.limitEarlyMin)}`;
    if(task.startMin!=null) return toHHMM(task.startMin);
    if(task.durationMin!=null) return `${task.durationMin} min`;
    return "Sin datos";
  };

  const renderNexoArea = (task, relation, label, position)=>{
    const area=el("div",`nexo-area nexo-${position}`);
    area.dataset.relation=relation;
    const head=el("div","nexo-head");
    head.appendChild(el("h4",null,label));
    const add=el("button","btn small","+ Añadir");
    add.onclick=()=>{ createTask({ parentId:task.id, relation }); renderClient(); };
    head.appendChild(add);
    area.appendChild(head);
    const children=getTaskChildren(task.id).filter(ch=>ch.structureRelation===relation);
    if(!children.length){
      area.appendChild(el("div","nexo-empty","Sin tareas"));
    }else{
      const list=el("div","nexo-list");
      children.forEach(ch=>{
        const item=el("button","nexo-item","");
        if(!isTaskComplete(ch)) item.classList.add("pending");
        if(state.project.view.selectedTaskId===ch.id) item.classList.add("active");
        item.onclick=()=>{ selectTask(ch.id); renderClient(); };
        item.appendChild(el("div","nexo-name",labelForTask(ch)));
        item.appendChild(el("div","mini",relationInfo(ch)));
        list.appendChild(item);
      });
      area.appendChild(list);
    }
    return area;
  };

  const renderMaterialArea = (task)=>{
    const area=el("div","nexo-area nexo-right");
    area.dataset.relation="materials";
    const mat=renderMaterials(task);
    area.appendChild(mat);
    return area;
  };

  const renderTaskCard = (container, task)=>{
    container.innerHTML="";
    if(!task){
      container.appendChild(el("div","empty-card","Selecciona una tarea o crea un nuevo hito."));
      return;
    }
    applyTaskDefaults(task);

    const editor=el("div","task-editor");
    const grid=el("div","nexo-grid");

    const center=el("div","nexo-area nexo-center");
    center.dataset.relation=task.structureRelation||"task";

    const header=el("div","task-header");
    const title=el("h2","task-title", labelForTask(task));
    header.appendChild(title);
    const chips=el("div","task-chips");
    const relationChip=el("span","relation-chip",RELATION_LABEL[task.structureRelation]||"Tarea");
    chips.appendChild(relationChip);
    const statusChip=el("span","status-chip", isTaskComplete(task)?"Completa":"Falta info");
    statusChip.classList.add(isTaskComplete(task)?"ok":"warn");
    chips.appendChild(statusChip);
    header.appendChild(chips);
    center.appendChild(header);

    const breadcrumb=el("div","task-breadcrumb");
    const path=getBreadcrumb(task);
    path.forEach((node,idx)=>{
      const btn=el("button","crumb", labelForTask(node));
      if(idx===path.length-1){ btn.disabled=true; }
      btn.onclick=()=>{ selectTask(node.id); renderClient(); };
      breadcrumb.appendChild(btn);
      if(idx<path.length-1) breadcrumb.appendChild(el("span","crumb-sep","›"));
    });
    center.appendChild(breadcrumb);

    const form=el("div","task-form");
    const nameRow=el("div","field-row");
    nameRow.appendChild(el("label",null,"Nombre"));
    const nameInput=el("input","input"); nameInput.type="text"; nameInput.value=task.actionName||"";
    nameInput.oninput=()=>{ task.actionName=nameInput.value; title.textContent=labelForTask(task); };
    nameInput.onblur=()=>{ touchTask(task); renderClient(); };
    nameRow.appendChild(nameInput);
    form.appendChild(nameRow);

    const durationRow=el("div","field-row");
    durationRow.appendChild(el("label",null,"Duración (min)"));
    const durInput=el("input","input"); durInput.type="number"; durInput.min="5"; durInput.step="5"; durInput.value=String(task.durationMin||60);
    durInput.onchange=()=>{
      const v=Math.max(5, Math.round(Number(durInput.value)||60));
      task.durationMin=v;
      if(task.startMin!=null){ task.endMin = task.startMin + v; }
      touchTask(task);
      renderClient();
    };
    durationRow.appendChild(durInput);
    form.appendChild(durationRow);

    if(task.structureRelation==="milestone"){
      const timeRow=el("div","field-row");
      timeRow.appendChild(el("label",null,"Hora"));
      const timeInput=el("input","input"); timeInput.type="time"; timeInput.value=formatTimeValue(task.startMin);
      timeInput.onchange=()=>{
        const v=parseTimeInput(timeInput.value);
        task.startMin=v;
        if(v==null){ task.endMin=null; }
        else task.endMin=v + Math.max(5, Number(task.durationMin)||60);
        touchTask(task);
        renderClient();
      };
      timeRow.appendChild(timeInput);
      form.appendChild(timeRow);
    }else{
      const limitRow=el("div","field-row");
      if(task.structureRelation==="post"){
        limitRow.appendChild(el("label",null,"Límite tarde"));
        const limitInput=el("input","input"); limitInput.type="time"; limitInput.value=formatTimeValue(task.limitLateMin);
        limitInput.onchange=()=>{
          task.limitLateMin=parseTimeInput(limitInput.value);
          touchTask(task);
          renderClient();
        };
        limitRow.appendChild(limitInput);
      }else{
        limitRow.appendChild(el("label",null,"Límite temprano"));
        const limitInput=el("input","input"); limitInput.type="time"; limitInput.value=formatTimeValue(task.limitEarlyMin);
        limitInput.onchange=()=>{
          task.limitEarlyMin=parseTimeInput(limitInput.value);
          touchTask(task);
          renderClient();
        };
        limitRow.appendChild(limitInput);
      }
      form.appendChild(limitRow);

      const startRow=el("div","field-row");
      startRow.appendChild(el("label",null,"Hora exacta (opcional)"));
      const startInput=el("input","input"); startInput.type="time"; startInput.value=formatTimeValue(task.startMin);
      startInput.onchange=()=>{
        const v=parseTimeInput(startInput.value);
        task.startMin=v;
        if(v==null){ task.endMin=null; }
        else task.endMin=v + Math.max(5, Number(task.durationMin)||60);
        touchTask(task);
        renderClient();
      };
      startRow.appendChild(startInput);
      form.appendChild(startRow);
    }

    const locRow=el("div","field-row");
    locRow.appendChild(el("label",null,"Localización"));
    const locSelect=el("select","input");
    const optEmpty=el("option",null,"- seleccionar -"); optEmpty.value=""; locSelect.appendChild(optEmpty);
    (state.locations||[]).forEach(loc=>{
      const opt=el("option",null,loc.nombre||"Localización"); opt.value=loc.id; if(loc.id===task.locationId) opt.selected=true; locSelect.appendChild(opt);
    });
    locSelect.disabled = task.locationApplies!==true;
    locSelect.onchange=()=>{ task.locationId = locSelect.value||null; touchTask(task); renderClient(); };
    locRow.appendChild(locSelect);
    const locToggle=el("label","check");
    const chk=el("input"); chk.type="checkbox"; chk.checked=!task.locationApplies;
    chk.onchange=()=>{ task.locationApplies = !chk.checked; if(!task.locationApplies) task.locationId=null; touchTask(task); renderClient(); };
    locToggle.appendChild(chk);
    locToggle.appendChild(el("span",null,"Sin localización"));
    locRow.appendChild(locToggle);
    form.appendChild(locRow);

    const notesRow=el("div","field-row");
    notesRow.appendChild(el("label",null,"Notas"));
    const notes=el("textarea","input"); notes.rows=4; notes.value=task.comentario||"";
    notes.oninput=()=>{ task.comentario=notes.value; };
    notes.onblur=()=>{ touchTask(task); };
    notesRow.appendChild(notes);
    form.appendChild(notesRow);

    center.appendChild(form);
    center.appendChild(renderStaffPicker(task));

    const danger=el("button","btn danger", "Eliminar tarea");
    danger.onclick=()=>{
      if(confirm("¿Eliminar esta tarea y sus dependientes?")){
        const parentId=task.structureParentId;
        deleteTask(task.id);
        if(parentId){
          selectTask(parentId);
        }else{
          const next=getTaskList()[0];
          selectTask(next?next.id:null);
        }
        renderClient();
      }
    };
    const actions=el("div","task-actions");
    actions.appendChild(danger);
    center.appendChild(actions);

    grid.appendChild(renderNexoArea(task,"pre","Pretareas","top"));
    grid.appendChild(renderNexoArea(task,"parallel","Concurrencia","left"));
    grid.appendChild(center);
    grid.appendChild(renderMaterialArea(task));
    grid.appendChild(renderNexoArea(task,"post","Posttareas","bottom"));

    editor.appendChild(grid);
    container.appendChild(editor);
  };

  const getVisibleTasks = ()=>{
    const tasks=getTaskList();
    const activeTab=state.project.view.lastTab;
    if(activeTab && activeTab!=="CLIENTE"){
      return tasks.filter(t=>(t.assignedStaffIds||[]).includes(activeTab));
    }
    return tasks;
  };

  const ensureDefaultClientTarget = ()=>{
    const main=document.getElementById("clienteView");
    if(main) clientTargets.add(main);
  };

  const renderClientInto = (root)=>{
    if(!root) return;
    const tasks=getTaskList();
    const visible=getVisibleTasks();
    let selectedId=state.project.view.selectedTaskId;
    if(selectedId && !tasks.find(t=>t.id===selectedId)) selectedId=null;
    if(!selectedId){
      const fallback=(visible[0]||tasks[0])?.id || null;
      selectedId=fallback;
      state.project.view.selectedTaskId=selectedId;
    }
    if(selectedId && visible.length && !visible.some(t=>t.id===selectedId)){
      selectedId=visible[0].id;
      state.project.view.selectedTaskId=selectedId;
    }
    const selectedTask = selectedId ? getTaskById(selectedId) : null;
    const isCatalogMount = catalogTarget && root === catalogTarget;
    root.innerHTML="";
    const screen=el("div","client-screen");
    const timeline=el("div","client-timeline");
    renderTimeline(timeline, selectedId);
    screen.appendChild(timeline);
    root.appendChild(screen);

    if(isCatalogMount){
      const layout=el("div","client-layout");
      const catalog=el("div","task-catalog");
      const card=el("div","task-card");
      layout.appendChild(catalog);
      layout.appendChild(card);
      screen.appendChild(layout);

      renderCatalog(catalog, visible.length?visible:tasks, selectedId);
      renderTaskCard(card, selectedTask);
    }else{
      const info=el("div","client-info");
      info.appendChild(el("p",null,"Gestiona los detalles completos de las tareas desde el Catálogo de Tareas."));
      screen.appendChild(info);
    }
  };

  window.renderClient = ()=>{
    ensureViewDefaults();
    ensureDefaultClientTarget();
    const targets=[...clientTargets];
    targets.forEach(root=>{
      if(!root || !root.isConnected){
        clientTargets.delete(root);
        return;
      }
      renderClientInto(root);
    });
  };

  window.setCatalogClientTarget = (container)=>{
    ensureDefaultClientTarget();
    if(catalogTarget && clientTargets.has(catalogTarget)){
      clientTargets.delete(catalogTarget);
      if(catalogTarget instanceof HTMLElement){
        catalogTarget.innerHTML="";
      }
    }
    catalogTarget = container || null;
    if(catalogTarget){
      clientTargets.add(catalogTarget);
    }
    window.renderClient();
  };

  const collectPersons = ()=>{
    const persons=[];
    const roots=getRootTasks().filter(t=>t.startMin!=null && t.endMin!=null).sort((a,b)=>a.startMin-b.startMin);
    persons.push({ id:"CLIENTE", nombre:"Cliente", tasks:roots });
    const byStaff=new Map();
    getTaskList().forEach(task=>{
      (task.assignedStaffIds||[]).forEach(id=>{
        if(!byStaff.has(id)) byStaff.set(id, []);
        byStaff.get(id).push(task);
      });
    });
    (state.staff||[]).forEach(st=>{
      const arr=(byStaff.get(st.id)||[]).slice().sort((a,b)=>{
        const sa=a.startMin??Infinity; const sb=b.startMin??Infinity;
        if(sa!==sb) return sa-sb;
        return (RELATION_ORDER[a.structureRelation]||0)-(RELATION_ORDER[b.structureRelation]||0);
      });
      persons.push({ id:st.id, nombre:st.nombre||st.id, tasks:arr });
    });
    return persons;
  };

  const colorForTask = (task)=> RELATION_COLOR[task.structureRelation] || "#60a5fa";

  window.buildGantt = (cont)=>{
    cont.innerHTML="";
    const persons=collectPersons();
    if(!persons.length){
      cont.appendChild(el("div","mini","Sin tareas"));
      return;
    }
    const wrap=el("div","gwrap");
    const head=el("div","gantt-header"); head.appendChild(el("div",null,"Persona"));
    const hours=el("div","gantt-hours"); for(let h=0;h<24;h++) hours.appendChild(el("div",null,String(h).padStart(2,"0")+":00"));
    head.appendChild(hours); wrap.appendChild(head);
    persons.forEach(person=>{
      const row=el("div","gantt-row");
      row.appendChild(el("div",null,person.nombre));
      const track=el("div","gantt-track");
      (person.tasks||[]).forEach(task=>{
        if(task.startMin==null || task.endMin==null) return;
        const seg=el("div","seg");
        seg.style.left=((task.startMin/1440)*100)+"%";
        seg.style.width=(((task.endMin-task.startMin)/1440)*100)+"%";
        seg.style.background=colorForTask(task);
        seg.title=`${toHHMM(task.startMin)}-${toHHMM(task.endMin)} · ${labelForTask(task)}`;
        seg.appendChild(el("div","meta",labelForTask(task)));
        track.appendChild(seg);
      });
      row.appendChild(track); wrap.appendChild(row);
    });
    cont.appendChild(wrap);
  };

  const materialSummary = ()=>{
    const totals=new Map();
    getTaskList().forEach(task=>{
      (task.materiales||[]).forEach(m=>{
        const key=m.materialTypeId;
        if(!key) return;
        totals.set(key,(totals.get(key)||0)+Number(m.cantidad||0));
      });
    });
    return totals;
  };

  window.renderMateriales = (cont)=>{
    cont.innerHTML="";
    const totals=materialSummary();
    const tbl=el("table");
    const thead=el("thead"); const trh=el("tr");
    ["Material","Total"].forEach(h=>trh.appendChild(el("th",null,h))); thead.appendChild(trh); tbl.appendChild(thead);
    const tb=el("tbody");
    if(!totals.size){
      const tr=el("tr"); const td=el("td"); td.colSpan=2; td.textContent="Sin materiales"; tr.appendChild(td); tb.appendChild(tr);
    }else{
      totals.forEach((qty,id)=>{
        const tr=el("tr");
        const name=(state.materialTypes||[]).find(mt=>mt.id===id)?.nombre || "Material";
        tr.appendChild(el("td",null,name));
        tr.appendChild(el("td",null,String(qty)));
        tb.appendChild(tr);
      });
    }
    tbl.appendChild(tb); cont.appendChild(tbl);
  };

  window.exportCSV = ()=>{
    const totals=materialSummary();
    const rows=[["Material","Total"]];
    totals.forEach((qty,id)=>{
      const name=(state.materialTypes||[]).find(mt=>mt.id===id)?.nombre || "Material";
      rows.push([name, String(qty)]);
    });
    const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\r\n");
const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download="materiales.csv";
    a.click();
  };

  window.buildCards = (cont)=>{
    cont.innerHTML="";
    const persons=collectPersons();
    const tools=el("div","row"); const pr=el("button","btn small","Imprimir"); pr.onclick=()=>window.print(); tools.appendChild(pr); cont.appendChild(tools);
    const list=el("div","cardlist");
    persons.forEach(person=>{
      const card=el("div","card"); card.appendChild(el("h4",null,person.nombre));
      const body=el("div");
      (person.tasks||[]).forEach(task=>{
        const item=el("div","item");
        const time=(task.startMin!=null && task.endMin!=null) ? `${toHHMM(task.startMin)}–${toHHMM(task.endMin)}` : "Sin hora";
        item.appendChild(el("div",null,time));
        const locName=(state.locations||[]).find(l=>l.id===task.locationId)?.nombre || "";
        const desc=[labelForTask(task)];
        if(locName) desc.push(locName);
        item.appendChild(el("div",null,desc.join(" · ")));
        body.appendChild(item);
        if(task.materiales?.length){
          const txt=task.materiales.filter(m=>m.materialTypeId).map(m=>{
            const name=(state.materialTypes||[]).find(mt=>mt.id===m.materialTypeId)?.nombre || "Material";
            return `${name} x ${m.cantidad||0}`;
          }).join(", ");
          if(txt) body.appendChild(el("div","mini","Materiales: "+txt));
        }
        if(task.comentario){ body.appendChild(el("div","mini","Notas: "+task.comentario)); }
      });
      if(!person.tasks?.length){
        body.appendChild(el("div","mini muted","Sin tareas"));
      }
      card.appendChild(body); list.appendChild(card);
    });
    cont.appendChild(list);
  };

  window.buildSummary = (cont)=>{
    cont.innerHTML="";
    const persons=collectPersons();
    const tbl=el("table"); const thead=el("thead"); const trh=el("tr");
    ["Persona","Acciones","Min totales","Sin hora"].forEach(h=>trh.appendChild(el("th",null,h))); thead.appendChild(trh); tbl.appendChild(thead);
    const tb=el("tbody");
    persons.forEach(person=>{
      const arr=person.tasks||[];
      let mins=0; let unscheduled=0;
      arr.forEach(task=>{
        if(task.startMin!=null && task.endMin!=null){ mins+=task.endMin-task.startMin; }
        else unscheduled++;
      });
      const tr=el("tr");
      tr.appendChild(el("td",null,person.nombre));
      tr.appendChild(el("td",null,String(arr.length)));
      tr.appendChild(el("td",null,String(mins)));
      tr.appendChild(el("td",null,unscheduled?String(unscheduled):"-"));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); cont.appendChild(tbl);
  };

  window.ensureDefaults = ()=>{
    originalEnsureDefaults();
    ensureViewDefaults();
  };

  window.ensureLinkFields = ()=>{
    originalEnsureLinkFields();
    ensureViewDefaults();
    getTaskList();
    syncStaffSessions();
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    ensureViewDefaults();
    syncStaffSessions();
    const showClientView = ()=>{
      const cliente=document.getElementById("clienteView");
      const catalog=document.getElementById("catalogView");
      const result=document.getElementById("resultView");
      if(cliente) cliente.style.display="";
      if(catalog) catalog.style.display="none";
      if(result) result.style.display="none";
    };

    const tabs=document.getElementById("personTabs");
    if(tabs){
      tabs.innerHTML="";
      const btn=el("button","tab active","Horario del cliente");
      btn.onclick=()=>{ showClientView(); state.project.view.lastTab="CLIENTE"; renderClient(); };
      tabs.appendChild(btn);
    }
    ensureDefaultClientTarget();
    showClientView();
    renderClient();
  });
})();

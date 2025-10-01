
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
  let materialSeq = 0;
  const nextMaterialTypeId = ()=>`MT_${Date.now().toString(36)}${(++materialSeq).toString(36)}`;

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
    if(typeof state.project.view.pretaskEditorId === "undefined") state.project.view.pretaskEditorId = null;
    if(typeof state.project.view.paralleltaskEditorId === "undefined") state.project.view.paralleltaskEditorId = null;
    if(typeof state.project.view.posttaskEditorId === "undefined") state.project.view.posttaskEditorId = null;
    if(typeof state.project.view.materialsEditorId === "undefined") state.project.view.materialsEditorId = null;
    state.horaInicial = state.horaInicial || {};
    state.localizacionInicial = state.localizacionInicial || {};
  };

  const toNumberOrNull = (value)=>{
    if(value===null || value===undefined || value==="") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const ensureMaterial = (m)=>({
    materialTypeId: m?.materialTypeId || null,
    cantidad: Math.max(1, Math.round(Number.isFinite(Number(m?.cantidad)) ? Number(m.cantidad) : 1))
  });

  const defaultVehicleId = ()=>{
    const list = state?.vehicles || [];
    const walk = list.find(v=>v.id==="V_WALK");
    return (walk || list[0] || {}).id || null;
  };

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
    if(typeof task.vehicleId === "undefined") task.vehicleId = null;
    if(typeof task.comentario !== "string") task.comentario = task.comentario ? String(task.comentario) : "";
    task.startMin = toNumberOrNull(task.startMin);
    task.endMin = toNumberOrNull(task.endMin);
    task.durationMin = Number.isFinite(Number(task.durationMin)) ? Math.max(5, Math.round(Number(task.durationMin))) : null;
    if(task.startMin != null && task.endMin != null){
      const computedDuration = Math.max(5, task.endMin - task.startMin);
      if(task.structureRelation === "pre"){
        if(!Number.isFinite(Number(task.durationMin))) task.durationMin = computedDuration;
      }else{
        task.durationMin = computedDuration;
      }
    }
    if(task.durationMin == null) task.durationMin = 60;
    task.limitEarlyMin = toNumberOrNull(task.limitEarlyMin);
    task.limitLateMin = toNumberOrNull(task.limitLateMin);
    task.limitEarlyMinEnabled = task.limitEarlyMinEnabled==null
      ? task.limitEarlyMin != null
      : !!task.limitEarlyMinEnabled;
    task.limitLateMinEnabled = task.limitLateMinEnabled==null
      ? task.limitLateMin != null
      : !!task.limitLateMinEnabled;
    if(typeof task.locked === "undefined") task.locked = false;
    else task.locked = !!task.locked;
    if(task.actionType !== ACTION_TYPE_TRANSPORT){
      task.vehicleId = null;
    }else if(!task.vehicleId){
      task.vehicleId = defaultVehicleId();
    }
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

  const rootTaskFor = (task)=>{
    if(!task) return null;
    if(!task.structureParentId) return task;
    const path=getBreadcrumb(task);
    return path[0] || task;
  };

  const isTaskLocked = (task)=>{
    const root=rootTaskFor(task);
    return !!(root && root.locked);
  };

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
      const hasLateLimit = !task.limitLateMinEnabled || Number.isFinite(task.limitLateMin);
      return hasName && hasDuration && hasLateLimit && hasLocation;
    }
    if(task.structureRelation === "pre"){
      const hasLowerLimit = !task.limitEarlyMinEnabled || Number.isFinite(task.limitEarlyMin);
      const hasUpperLimit = !task.limitLateMinEnabled || Number.isFinite(task.limitLateMin);
      return hasName && hasDuration && hasLowerLimit && hasUpperLimit && hasLocation;
    }
    if(task.structureRelation === "parallel"){
      const hasStart = !task.limitEarlyMinEnabled || Number.isFinite(task.limitEarlyMin);
      const hasEnd = !task.limitLateMinEnabled || Number.isFinite(task.limitLateMin);
      return hasName && hasDuration && hasStart && hasEnd && hasLocation;
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
    const list=getTaskList();
    ensureSequentialMilestonesFrom(task, list);
    if(task?.structureRelation === "milestone"){
      refreshPretaskTreeBounds(task);
      refreshParallelBounds(task);
      refreshPosttaskTreeBounds(task);
    }else if(task?.structureRelation === "pre"){
      const root = (getBreadcrumb(task)[0]) || null;
      if(root){
        refreshPretaskTreeBounds(root);
        refreshParallelBounds(root);
        refreshPosttaskTreeBounds(root);
      }
    }else if(task?.structureRelation === "parallel"){
      const root = (getBreadcrumb(task)[0]) || null;
      ensureParallelBounds(task, root);
    }else if(task?.structureRelation === "post"){
      const root = (getBreadcrumb(task)[0]) || null;
      if(root) refreshPosttaskTreeBounds(root);
    }
    syncStaffSessions();
    touch();
    notifyScheduleSubscribers();
  };

  const PRETASK_DEFAULT_DURATION = 30;
  const DAY_MAX_MIN = 23*60 + 55;
  const roundToFive = (mins)=> Math.round(Math.max(0, Math.min(DAY_MAX_MIN, Number(mins)||0))/5)*5;
  const clampMinuteValue = (value)=> Math.max(0, Math.min(DAY_MAX_MIN, value));
  const parseStoredMinute = (value)=>{
    if(Number.isFinite(value)) return clampMinuteValue(Math.round(Number(value)));
    if(typeof value === "string"){
      const trimmed=value.trim();
      if(!trimmed) return null;
      const match=trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if(match){
        const hours=parseInt(match[1],10)||0;
        const minutes=parseInt(match[2],10)||0;
        return clampMinuteValue(hours*60+minutes);
      }
      const numeric=Number(trimmed);
      if(Number.isFinite(numeric)) return clampMinuteValue(Math.round(numeric));
    }
    return null;
  };
  const getInitialMinuteFor = (pid)=> parseStoredMinute(state.horaInicial?.[pid]);
  const defaultTimelineStart = ()=>{
    const start=getInitialMinuteFor("CLIENTE");
    return start!=null ? roundToFive(start) : 9*60;
  };
  const clampToDay = (mins)=> Math.max(0, Math.min(DAY_MAX_MIN, Number(mins)||0));
  const formatTimeForInput = (mins)=>{
    if(!Number.isFinite(mins)) return "";
    const value = roundToFive(mins);
    const hours = String(Math.floor(value/60)).padStart(2,"0");
    const minutes = String(value%60).padStart(2,"0");
    return `${hours}:${minutes}`;
  };
  const parseTimeFromInput = (value)=>{
    const mins = parseTimeInput(value);
    if(mins==null) return null;
    return roundToFive(mins);
  };
  const defaultPretaskLower = ()=> 0;
  const getTaskParent = (task)=>{
    if(!task || !task.structureParentId) return null;
    return getTaskById(task.structureParentId) || null;
  };
  const inheritedPretaskLower = (task)=>{
    const visited=new Set();
    let current=task;
    let depth=0;
    while(current){
      if(visited.has(current.id)) break;
      visited.add(current.id);
      const parent=getTaskParent(current);
      if(!parent || parent.structureRelation !== "pre") break;
      depth++;
      if(depth>=2){
        return null;
      }
      if(parent.limitEarlyMinEnabled && Number.isFinite(parent.limitEarlyMin)){
        return roundToFive(clampToDay(parent.limitEarlyMin));
      }
      if(parent.limitLateMinEnabled && Number.isFinite(parent.limitLateMin)){
        return roundToFive(clampToDay(parent.limitLateMin));
      }
      if(Number.isFinite(parent.startMin)){
        return roundToFive(clampToDay(parent.startMin));
      }
      current=parent;
    }
    return null;
  };
  const pretaskReferenceStart = (task, rootTask)=>{
    const visited=new Set();
    let current=task;
    while(current){
      if(visited.has(current.id)) break;
      visited.add(current.id);
      const parent=getTaskParent(current);
      if(!parent) break;
      if(parent.structureRelation === "pre"){
        if(Number.isFinite(parent.limitLateMin)){
          return roundToFive(clampToDay(parent.limitLateMin));
        }
        if(Number.isFinite(parent.startMin)){
          return roundToFive(clampToDay(parent.startMin));
        }
        current=parent;
        continue;
      }
      if(Number.isFinite(parent.startMin)){
        return roundToFive(clampToDay(parent.startMin));
      }
      break;
    }
    return Number.isFinite(rootTask?.startMin)
      ? roundToFive(clampToDay(rootTask.startMin))
      : null;
  };
  const defaultPretaskUpper = (referenceStart, lower, duration)=>{
    if(Number.isFinite(referenceStart)){
      const latest=roundToFive(clampToDay(referenceStart - duration));
      return Math.max(lower, latest);
    }
    return Math.max(lower, roundToFive(clampToDay(lower + duration)));
  };
  const ensurePretaskBounds = (task, rootTask)=>{
    if(!task || task.structureRelation !== "pre") return;
    const duration = Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const rangeRequested = !!task.limitEarlyMinEnabled || !!task.limitLateMinEnabled;
    const inheritedLower = inheritedPretaskLower(task);
    const minLower = inheritedLower!=null ? inheritedLower : defaultPretaskLower();
    const storedLowerRaw = Number.isFinite(task.limitEarlyMin)
      ? roundToFive(clampToDay(task.limitEarlyMin))
      : minLower;
    const referenceStart = pretaskReferenceStart(task, rootTask);
    const computeLatestCap = (baseLower)=> Number.isFinite(referenceStart)
      ? Math.max(baseLower, roundToFive(clampToDay(referenceStart - duration)))
      : Math.max(baseLower, DAY_MAX_MIN);
    const defaultUpperFor = (baseLower)=> defaultPretaskUpper(referenceStart, baseLower, duration);

    let lower = rangeRequested ? storedLowerRaw : minLower;
    lower = roundToFive(clampToDay(lower));
    let latestCap = computeLatestCap(lower);
    let upper = Number.isFinite(task.limitLateMin)
      ? roundToFive(clampToDay(task.limitLateMin))
      : defaultUpperFor(lower);
    if(!Number.isFinite(upper)) upper = defaultUpperFor(lower);

    let rangeEnabled = rangeRequested;
    if(rangeEnabled){
      const maxLower = Math.max(minLower, latestCap - duration);
      if(lower > maxLower) lower = maxLower;
      if(lower < minLower) lower = minLower;
      lower = roundToFive(clampToDay(lower));
      latestCap = computeLatestCap(lower);
      const minUpperAllowed = lower + duration;
      const fallbackUpper = defaultUpperFor(lower);
      const minUpper = Math.min(latestCap, lower + duration);
      if(upper < minUpper) upper = Math.max(minUpperAllowed, fallbackUpper);
      if(upper > latestCap) upper = latestCap;
      if(upper < lower + duration){
        // No hay espacio suficiente para respetar la duración dentro de la franja.
        rangeEnabled = false;
      }
    }

    if(!rangeEnabled){
      lower = minLower;
      latestCap = computeLatestCap(lower);
      upper = defaultUpperFor(lower);
    }

    latestCap = computeLatestCap(lower);
    if(upper > latestCap) upper = latestCap;
    upper = roundToFive(clampToDay(Math.max(lower, upper)));

    task.durationMin = duration;
    task.limitEarlyMin = lower;
    task.limitLateMin = upper;
    task.limitEarlyMinEnabled = rangeEnabled;
    task.limitLateMinEnabled = rangeEnabled;
  };
  const refreshPretaskTreeBounds = (rootTask)=>{
    if(!rootTask) return;
    const visit=(node)=>{
      getTaskChildren(node.id).forEach(child=>{
        if(child.structureRelation === "pre"){
          ensurePretaskBounds(child, rootTask);
          visit(child);
        }
      });
    };
    visit(rootTask);
  };

  const defaultParallelLower = (rootTask)=>{
    if(Number.isFinite(rootTask?.startMin)){
      return roundToFive(clampToDay(rootTask.startMin));
    }
    return roundToFive(clampToDay(defaultTimelineStart()));
  };

  const defaultParallelUpper = (rootTask, lower, duration)=>{
    const fallback = lower + duration;
    let candidate = fallback;
    if(Number.isFinite(rootTask?.endMin)){
      candidate = Math.max(candidate, roundToFive(clampToDay(rootTask.endMin)));
    }else if(Number.isFinite(rootTask?.startMin) && Number.isFinite(rootTask?.durationMin)){
      const rootEnd = rootTask.startMin + Math.max(5, Number(rootTask.durationMin)||PRETASK_DEFAULT_DURATION);
      candidate = Math.max(candidate, roundToFive(clampToDay(rootEnd)));
    }
    return roundToFive(clampToDay(Math.max(lower, candidate)));
  };

  const ensureParallelBounds = (task, rootTask)=>{
    if(!task || task.structureRelation !== "parallel") return;
    const duration = Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const minLower = 0;
    const maxLower = Math.max(0, DAY_MAX_MIN - duration);
    const baseLower = defaultParallelLower(rootTask);
    let baseUpper = defaultParallelUpper(rootTask, baseLower, duration);
    if(baseUpper < baseLower + duration) baseUpper = Math.min(DAY_MAX_MIN, baseLower + duration);
    const rangeRequested = !!task.limitEarlyMinEnabled || !!task.limitLateMinEnabled;
    let lower = rangeRequested && Number.isFinite(task.limitEarlyMin)
      ? roundToFive(clampToDay(task.limitEarlyMin))
      : baseLower;
    let upper = rangeRequested && Number.isFinite(task.limitLateMin)
      ? roundToFive(clampToDay(task.limitLateMin))
      : baseUpper;
    lower = Math.max(minLower, Math.min(maxLower, lower));
    const minUpper = Math.min(DAY_MAX_MIN, lower + duration);
    const maxUpper = DAY_MAX_MIN;
    let rangeEnabled = rangeRequested;
    if(rangeEnabled){
      if(upper < minUpper) upper = minUpper;
      if(upper > maxUpper) upper = maxUpper;
    }else{
      lower = baseLower;
      upper = baseUpper;
    }
    upper = Math.max(lower, upper);
    lower = roundToFive(clampToDay(lower));
    upper = roundToFive(clampToDay(upper));
    task.durationMin = duration;
    task.limitEarlyMin = lower;
    task.limitLateMin = upper;
    task.limitEarlyMinEnabled = rangeEnabled;
    task.limitLateMinEnabled = rangeEnabled;
  };

  const refreshParallelBounds = (rootTask)=>{
    if(!rootTask) return;
    getTaskChildren(rootTask.id).forEach(child=>{
      if(child.structureRelation === "parallel"){
        ensureParallelBounds(child, rootTask);
      }
    });
  };

  const defaultPosttaskLower = (rootTask)=>{
    if(Number.isFinite(rootTask?.endMin)){
      return roundToFive(clampToDay(rootTask.endMin));
    }
    if(Number.isFinite(rootTask?.startMin) && Number.isFinite(rootTask?.durationMin)){
      const fallback = rootTask.startMin + Math.max(5, Number(rootTask.durationMin)||PRETASK_DEFAULT_DURATION);
      return roundToFive(clampToDay(fallback));
    }
    return roundToFive(clampToDay(defaultTimelineStart()));
  };

  const defaultPosttaskUpper = (rootTask, lower, duration)=>{
    const baseUpper = Math.max(lower + duration, lower);
    return Math.min(DAY_MAX_MIN, baseUpper);
  };

  const ensurePosttaskBounds = (task, rootTask)=>{
    if(!task || task.structureRelation !== "post") return;
    const duration = Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const rangeRequested = !!task.limitEarlyMinEnabled || !!task.limitLateMinEnabled;
    const minLower = defaultPosttaskLower(rootTask);
    const storedLowerRaw = Number.isFinite(task.limitEarlyMin)
      ? roundToFive(clampToDay(task.limitEarlyMin))
      : minLower;
    let lower = rangeRequested ? storedLowerRaw : minLower;
    if(lower < minLower) lower = minLower;
    lower = roundToFive(clampToDay(lower));
    const maxLower = Math.max(minLower, DAY_MAX_MIN - duration);
    if(lower > maxLower) lower = maxLower;
    let upper = Number.isFinite(task.limitLateMin)
      ? roundToFive(clampToDay(task.limitLateMin))
      : defaultPosttaskUpper(rootTask, lower, duration);
    if(!Number.isFinite(upper)) upper = defaultPosttaskUpper(rootTask, lower, duration);
    let rangeEnabled = rangeRequested;
    if(rangeEnabled){
      const minUpperAllowed = lower + duration;
      if(upper < minUpperAllowed) upper = minUpperAllowed;
      if(upper > DAY_MAX_MIN) upper = DAY_MAX_MIN;
      if(upper < lower + duration){
        rangeEnabled = false;
      }
    }
    if(!rangeEnabled){
      lower = minLower;
      upper = defaultPosttaskUpper(rootTask, lower, duration);
    }
    if(lower > maxLower) lower = maxLower;
    if(upper > DAY_MAX_MIN) upper = DAY_MAX_MIN;
    upper = roundToFive(clampToDay(Math.max(lower + duration, upper)));
    task.durationMin = duration;
    task.limitEarlyMin = lower;
    task.limitLateMin = upper;
    task.limitEarlyMinEnabled = rangeEnabled;
    task.limitLateMinEnabled = rangeEnabled;
  };

  const refreshPosttaskTreeBounds = (rootTask)=>{
    if(!rootTask) return;
    const visit=(node)=>{
      getTaskChildren(node.id).forEach(child=>{
        if(child.structureRelation === "post"){
          ensurePosttaskBounds(child, rootTask);
          visit(child);
        }
      });
    };
    visit(rootTask);
  };

  const nextCursorForMilestone = (task, fallback)=>{
    if(!task) return fallback;
    applyTaskDefaults(task);
    const duration = Math.max(5, Number(task.durationMin)||60);
    task.durationMin = duration;
    if(task.startMin == null){
      task.endMin = null;
      return fallback;
    }
    task.endMin = task.startMin + duration;
    return task.endMin;
  };

  const enforceMilestoneLocations = (roots)=>{
    if(!Array.isArray(roots) || !roots.length) return;
    let current = state.localizacionInicial?.CLIENTE || null;
    for(const item of roots){
      applyTaskDefaults(item);
      const isTransport = item.actionType === ACTION_TYPE_TRANSPORT;
      if(isTransport){
        if(item.locationId == null && current != null){
          item.locationId = current;
        }
        if(item.locationId != null){
          current = item.locationId;
        }
      }else if(item.locationApplies !== false){
        if(current != null){
          item.locationId = current;
        }else if(item.locationId != null){
          current = item.locationId;
        }
      }
    }
  };

  const enforceSequentialMilestones = (roots, startIndex=0)=>{
    if(!roots.length) return;
    const baseStart = defaultTimelineStart();
    const begin = Math.max(0, startIndex);
    let cursor = begin>0 ? nextCursorForMilestone(roots[begin-1], baseStart) : baseStart;
    for(let i=begin;i<roots.length;i++){
      const item = roots[i];
      applyTaskDefaults(item);
      const duration = Math.max(5, Number(item.durationMin)||60);
      item.durationMin = duration;
      item.startMin = cursor;
      item.endMin = item.startMin + duration;
      cursor = nextCursorForMilestone(item, cursor + duration);
    }
    enforceMilestoneLocations(roots);
  };

  const ensureSequentialMilestonesFrom = (task, list)=>{
    if(!Array.isArray(list) || !list.length) return;
    const roots = list.filter(item=>!item.structureParentId && item.structureRelation === "milestone");
    if(!roots.length) return;
    if(!task){
      enforceSequentialMilestones(roots, 0);
      return;
    }
    if(task.structureParentId || task.structureRelation !== "milestone") return;
    const index = roots.findIndex(item=>item.id===task.id);
    if(index === -1) return;
    enforceSequentialMilestones(roots, index);
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
      vehicleId: null,
      materiales: [],
      comentario: "",
      assignedStaffIds: [],
      startMin: parentId?null:(getInitialMinuteFor("CLIENTE") ?? 9*60),
      endMin: null,
      actionType: ACTION_TYPE_NORMAL
    };
    ensureDuration(task);
    let insertIndex = list.length;
    const selectedId = state?.project?.view?.selectedTaskId || null;
    if(selectedId){
      const selectedIndex = list.findIndex(t=>t.id===selectedId);
      if(selectedIndex !== -1){
        const selectedTask = list[selectedIndex];
        const sameParent = (selectedTask.structureParentId || null) === (parentId || null);
        if(parentId){
          if(sameParent && selectedTask.structureRelation === task.structureRelation){
            insertIndex = selectedIndex + 1;
          }
        }else if(sameParent){
          insertIndex = selectedIndex + 1;
        }
      }
    }
    list.splice(insertIndex, 0, task);
    ensureSequentialMilestonesFrom(task, list);
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
    const nextList=getTaskList();
    ensureSequentialMilestonesFrom(null, nextList);
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

  const computeTransportFlow = (milestones, idx)=>{
    let current = state.localizacionInicial?.CLIENTE || null;
    for(let i=0;i<milestones.length;i++){
      const item=milestones[i];
      const isTransport = item.actionType===ACTION_TYPE_TRANSPORT;
      const destination = isTransport
        ? (item.locationId || current)
        : current;
      if(i===idx){
        return { origin: current, destination };
      }
      if(isTransport){
        current = destination;
      }
    }
    const fallback=milestones[idx];
    const fallbackIsTransport = fallback?.actionType===ACTION_TYPE_TRANSPORT;
    const fallbackDestination = fallbackIsTransport
      ? (fallback?.locationId || current)
      : current;
    return { origin: current, destination: fallbackDestination };
  };

  const transportFlowForTask = (task)=>{
    if(!task) return { origin:null, destination:null };
    const milestones=getOrderedMilestones();
    const idx=milestones.findIndex(t=>t.id===task.id);
    if(idx===-1) return { origin:null, destination:task.locationId||null };
    return computeTransportFlow(milestones, idx);
  };

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

  const hasInitialTime = ()=> getInitialMinuteFor("CLIENTE") != null;
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
      const start=getInitialMinuteFor("CLIENTE");
      if(start!=null){
        const normalized=roundToFive(start);
        task.startMin=normalized;
        task.endMin=normalized + Math.max(5, Number(task.durationMin)||60);
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
      ensureSequentialMilestonesFrom(null, getTaskList());
      touch();
      renderClient();
    };
    locField.appendChild(locSelect);

    const timeField=el("div","field-row");
    timeField.appendChild(el("label",null,"Hora inicial"));
    const timeInput=el("input","input");
    timeInput.type="time";
    timeInput.value=formatTimeValue(getInitialMinuteFor("CLIENTE"));
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
    const list=getTaskList();
    ensureSequentialMilestonesFrom(task, list);
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
      const isTransport = toggleInput.checked;
      task.actionType = isTransport ? ACTION_TYPE_TRANSPORT : ACTION_TYPE_NORMAL;
      if(!isTransport){
        task.vehicleId = null;
      }else if(!task.vehicleId){
        task.vehicleId = defaultVehicleId();
      }
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
    const flowHint=el("div","timeline-hint");
    const locHint=el("div","timeline-hint","Activa transporte para seleccionar un destino.");
    const updateLocationState = ()=>{
      destSelect.disabled = !toggleInput.checked;
      locLabel.textContent = toggleInput.checked?"Destino":"Localización";
      locHint.style.display = toggleInput.checked?"none":"";
      if(toggleInput.checked){
        const flow=transportFlowForTask(task);
        const originName=locationNameById(flow.origin) || "Sin origen";
        const destName=locationNameById(flow.destination) || "Sin destino";
        flowHint.textContent = `Origen: ${originName} → Destino: ${destName}`;
        flowHint.style.display="";
      }else{
        flowHint.style.display="none";
      }
    };
    updateLocationState();
    toggleInput.addEventListener("change", updateLocationState);
    locRow.appendChild(locLabel);
    locRow.appendChild(destSelect);
    locRow.appendChild(locHint);
    locRow.appendChild(flowHint);
    body.appendChild(locRow);

    const vehicleRow=el("div","timeline-field");
    const vehicleLabel=el("label",null,"Vehículo");
    const vehicleSelect=el("select","input");
    const vehicleEmpty=el("option",null,"- seleccionar -"); vehicleEmpty.value=""; vehicleSelect.appendChild(vehicleEmpty);
    (state.vehicles||[]).forEach(veh=>{
      const opt=el("option",null,veh.nombre||"Vehículo"); opt.value=veh.id; if(veh.id===task.vehicleId) opt.selected=true; vehicleSelect.appendChild(opt);
    });
    vehicleSelect.onchange=()=>{
      task.vehicleId = vehicleSelect.value || null;
      touchTask(task);
      state.project.view.timelineEditorId = task.id;
      renderClient();
    };
    const updateVehicleState = ()=>{
      const active=toggleInput.checked;
      vehicleRow.style.display = active?"":"none";
      vehicleSelect.disabled = !active;
      if(active && !task.vehicleId){
        const def=defaultVehicleId();
        if(def){
          task.vehicleId=def;
          vehicleSelect.value=def;
        }
      }
    };
    updateVehicleState();
    toggleInput.addEventListener("change", updateVehicleState);
    vehicleRow.appendChild(vehicleLabel);
    vehicleRow.appendChild(vehicleSelect);
    body.appendChild(vehicleRow);

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
    let selectedTask = selectedId ? getTaskById(selectedId) : null;
    if(selectedTask && (selectedTask.structureRelation === "pre" || selectedTask.structureRelation === "post")){
      const trail=getBreadcrumb(selectedTask);
      const rootNode = trail[0] || null;
      if(rootNode){
        selectedId = rootNode.id;
        selectedTask = rootNode;
        state.project.view.selectedTaskId = selectedId;
      }
    }
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
    const deleteBtn=el("button","btn small danger","Eliminar tarea");
    const handleDelete=()=>{
      if(!selectedTask || selectedTask.structureRelation!=="milestone") return;
      if(!confirm("¿Eliminar esta tarea y sus dependientes?")) return;
      const parentId=selectedTask.structureParentId;
      const deletedId=selectedTask.id;
      deleteTask(deletedId);
      let nextSelection=null;
      if(parentId){
        nextSelection=parentId;
      }else{
        const remaining=getOrderedMilestones();
        nextSelection=remaining[0]?.id || null;
      }
      selectTask(nextSelection);
      if(state.project.view.timelineEditorId===deletedId){
        const nextTask = nextSelection ? getTaskById(nextSelection) : null;
        state.project.view.timelineEditorId = nextTask && nextTask.structureRelation==="milestone" ? nextTask.id : null;
      }
      renderClient();
    };
    deleteBtn.onclick=handleDelete;
    deleteBtn.disabled = !(selectedTask && selectedTask.structureRelation==="milestone");
    header.appendChild(deleteBtn);
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
        let subtitle="";
        if(task.actionType===ACTION_TYPE_TRANSPORT){
          const flow=transportFlowForTask(task);
          const originName=locationNameById(flow.origin) || "Sin origen";
          const destName=locationNameById(flow.destination) || "Sin destino";
          subtitle=`${originName} → ${destName}`;
        }else{
          subtitle=locationNameById(task.locationId) || "Sin localización";
        }
        card.appendChild(el("div","mini",subtitle));
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

  const renderFixedTimeline = (container, selectedId)=>{
    container.innerHTML="";
    const header=el("div","timeline-head");
    header.appendChild(el("h3",null,"Horario fijo del cliente"));
    container.appendChild(header);

    const milestones=getOrderedMilestones();
    const list=el("div","timeline-track");
    if(!milestones.length){
      list.appendChild(el("div","timeline-empty","Todavía no hay tareas en el horario."));
    }else{
      milestones.forEach(task=>{
        const card=el("div","timeline-card readonly");
        if(task.id===selectedId) card.classList.add("active");
        const hasRange=(task.startMin!=null && task.endMin!=null);
        const time=hasRange ? `${toHHMM(task.startMin)} – ${toHHMM(task.endMin)}` : (task.startMin!=null ? toHHMM(task.startMin) : "Sin hora");
        card.appendChild(el("div","time",time));
        card.appendChild(el("div","title",labelForTask(task)));
        let subtitle="";
        if(task.actionType===ACTION_TYPE_TRANSPORT){
          const flow=transportFlowForTask(task);
          const originName=locationNameById(flow.origin) || "Sin origen";
          const destName=locationNameById(flow.destination) || "Sin destino";
          subtitle=`${originName} → ${destName}`;
        }else{
          subtitle=locationNameById(task.locationId) || "Sin localización";
        }
        card.appendChild(el("div","mini",subtitle));
        list.appendChild(card);
      });
    }
    container.appendChild(list);
  };

  const renderCatalog = (container, tasks, selectedId)=>{
    container.innerHTML="";
    const header=el("div","catalog-header");
    header.appendChild(el("h3",null,"Tareas del cliente"));
    container.appendChild(header);

    const sortedRoots=sortedTasks(tasks).filter(task=>task.structureParentId==null);
    if(!sortedRoots.length){
      container.appendChild(el("div","mini muted","Sin tareas"));
      return;
    }

    let selectedTask = selectedId ? getTaskById(selectedId) : null;
    if(selectedTask && (selectedTask.structureRelation === "pre" || selectedTask.structureRelation === "post")){
      const trail=getBreadcrumb(selectedTask);
      const rootNode = trail[0] || null;
      if(rootNode){
        selectedId = rootNode.id;
        selectedTask = rootNode;
        state.project.view.selectedTaskId = selectedId;
      }
    }
    let selectedRootId = selectedTask ? selectedTask.id : null;
    if(selectedTask && selectedTask.structureParentId){
      const trail=getBreadcrumb(selectedTask);
      selectedRootId = (trail[0]||{}).id || selectedTask.id;
    }

    const grid=el("div","catalog-grid");
    sortedRoots.forEach(task=>{
      const item=el("button","catalog-item","");
      if(task.id===selectedRootId) item.classList.add("active");
      if(task.locked) item.classList.add("locked");
      item.onclick=()=>{ selectTask(task.id); renderClient(); };

      const titleRow=el("div","catalog-title-row");
      const title=el("div","catalog-name",labelForTask(task));
      titleRow.appendChild(title);
      const lockBtn=el("button","catalog-lock", task.locked?"🔒":"🔓");
      lockBtn.type="button";
      lockBtn.title = task.locked ? "Desbloquear tarea" : "Bloquear tarea";
      lockBtn.setAttribute("aria-label", task.locked?"Desbloquear tarea":"Bloquear tarea");
      lockBtn.onclick=(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        task.locked = !task.locked;
        touchTask(task);
        renderClient();
      };
      if(task.locked) lockBtn.classList.add("is-locked");
      titleRow.appendChild(lockBtn);
      item.appendChild(titleRow);
      const relationLabel=RELATION_LABEL[task.structureRelation] || "Tarea";
      item.appendChild(el("span","relation-tag",relationLabel));
      const meta=el("div","catalog-meta");
      const hasRange=(task.startMin!=null && task.endMin!=null);
      const time=hasRange ? `${toHHMM(task.startMin)} – ${toHHMM(task.endMin)}` : (task.startMin!=null ? toHHMM(task.startMin) : "Sin hora");
      meta.appendChild(el("span","catalog-time",time));
      const duration=task.durationMin!=null ? `${task.durationMin} min` : "Sin duración";
      meta.appendChild(el("span","catalog-duration",duration));
      item.appendChild(meta);

      let locationLabel="";
      if(task.actionType===ACTION_TYPE_TRANSPORT){
        const flow=transportFlowForTask(task);
        const originName=locationNameById(flow.origin) || "Sin origen";
        const destName=locationNameById(flow.destination) || "Sin destino";
        locationLabel=`${originName} → ${destName}`;
      }else if(task.locationApplies===false){
        locationLabel="No aplica";
      }else{
        locationLabel=locationNameById(task.locationId) || "Sin localización";
      }
      item.appendChild(el("div","mini",locationLabel));

      grid.appendChild(item);
    });
    container.appendChild(grid);
  };

  const ensureMaterialTypes = ()=>{
    if(!Array.isArray(state.materialTypes)) state.materialTypes = [];
    return state.materialTypes;
  };

  const normalizeQuantity = (value)=>{
    const num = Number(value);
    if(!Number.isFinite(num)) return 1;
    return Math.max(1, Math.round(num));
  };

  const formatQuantityLabel = (value)=>{
    const qty = normalizeQuantity(value);
    const unit = qty === 1 ? "unidad" : "unidades";
    return `${qty} ${unit}`;
  };

  const renderMaterialSummaryView = (task, types)=>{
    const summary=el("div","material-summary-view");
    const entries=(task.materiales||[]).map(ensureMaterial);
    if(!entries.length){
      summary.appendChild(el("div","mini muted","Sin materiales asignados. Pulsa \"Editar\" para añadirlos."));
      return summary;
    }

    const table=el("table","material-summary-table");
    const tbody=el("tbody");
    table.appendChild(tbody);

    let hasPending=false;
    entries.forEach(mat=>{
      const row=el("tr","material-summary-row");
      const nameCell=el("td","material-summary-name","");
      const qtyCell=el("td","material-summary-qty",formatQuantityLabel(mat.cantidad));

      if(mat.materialTypeId){
        const typeLabel=types.find(type=>type.id===mat.materialTypeId)?.nombre || "Material";
        nameCell.textContent=typeLabel;
      }else{
        nameCell.textContent="Material sin definir";
        row.classList.add("pending");
        hasPending=true;
      }

      row.appendChild(nameCell);
      row.appendChild(qtyCell);
      tbody.appendChild(row);
    });

    summary.appendChild(table);

    if(hasPending){
      summary.appendChild(el("div","mini warn-text","Hay materiales sin tipo asignado. Completa la información desde \"Editar\"."));
    }

    summary.appendChild(el("div","mini muted","Pulsa \"Editar\" para modificar las cantidades o añadir materiales."));

    return summary;
  };

  const renderMaterialAssignment = (task)=>{
    const wrap=el("div","materials-editor");
    const head=el("div","nexo-head");
    head.appendChild(el("h4",null,"Materiales de la tarea"));
    const types=ensureMaterialTypes();
    task.materiales = Array.isArray(task.materiales) ? task.materiales.map(ensureMaterial) : [];

    const locked=isTaskLocked(task);
    if(locked && state.project.view.materialsEditorId === task.id){
      state.project.view.materialsEditorId = null;
    }
    const isEditing = !locked && state.project.view.materialsEditorId === task.id;
    const controls=el("div","material-head-controls");
    const toggleBtn=el("button","btn small", isEditing ? "Aceptar" : (locked?"Bloqueada":"Editar"));
    toggleBtn.type="button";
    if(locked){
      toggleBtn.disabled = true;
      toggleBtn.classList.add("locked");
    }else{
      toggleBtn.onclick=()=>{
        state.project.view.materialsEditorId = isEditing ? null : task.id;
        renderClient();
      };
    }
    controls.appendChild(toggleBtn);
    head.appendChild(controls);
    wrap.appendChild(head);

    if(!isEditing){
      wrap.appendChild(renderMaterialSummaryView(task, types));
      if(!types.length){
        wrap.appendChild(el("div","mini muted","Crea materiales en el catálogo para poder asignarlos."));
      }
      if(locked){
        wrap.appendChild(el("div","mini muted","La tarea está bloqueada. Desbloquéala para editar los materiales."));
      }
      return wrap;
    }

    const rows=el("div","material-rows");
    const usedMaterialIds = new Set((task.materiales||[])
      .map(mat=>mat?.materialTypeId)
      .filter(Boolean));
    const hasAvailableTypes = types.some(type=>!usedMaterialIds.has(type.id));

    if(!task.materiales.length){
      const empty=el("div","mini muted","Sin materiales asignados.");
      rows.appendChild(empty);
    }else{
      task.materiales.forEach((mat,idx)=>{
        const row=el("div","material-row");
        const resolveEntry = ()=> task.materiales[idx] || mat;

        const selectWrap=el("label","material-field");
        selectWrap.appendChild(el("span","material-field-label","Material"));
        const select=el("select","input");
        const optEmpty=el("option",null,"- seleccionar -");
        optEmpty.value="";
        select.appendChild(optEmpty);
        const usedByOthers = new Set(task.materiales
          .filter((other, otherIdx)=>otherIdx!==idx && other?.materialTypeId)
          .map(other=>other.materialTypeId));
        types.forEach(type=>{
          const opt=el("option",null,type.nombre||"Material");
          opt.value=type.id;
          if(type.id===mat.materialTypeId){
            opt.selected=true;
          }else if(usedByOthers.has(type.id)){
            opt.disabled=true;
          }
          select.appendChild(opt);
        });
        select.onchange=()=>{
          mat.materialTypeId = select.value || null;
          touchTask(task);
          renderClient();
        };
        selectWrap.appendChild(select);
        row.appendChild(selectWrap);

        const qtyWrap=el("label","material-field qty");
        qtyWrap.appendChild(el("span","material-field-label","Cantidad"));
        const qtyControls=el("div","material-qty-controls");
        const buttonGroup=el("div","material-qty-buttons");
        const decrementBtn=el("button","material-qty-btn","-");
        decrementBtn.type="button";
        const incrementBtn=el("button","material-qty-btn","+");
        incrementBtn.type="button";
        buttonGroup.appendChild(decrementBtn);
        buttonGroup.appendChild(incrementBtn);
        const qtyInput=el("input","input");
        qtyInput.type="number";
        qtyInput.min="1";
        qtyInput.step="1";
        qtyControls.appendChild(buttonGroup);
        qtyControls.appendChild(qtyInput);
        qtyWrap.appendChild(qtyControls);
        row.appendChild(qtyWrap);

        const syncQtyUI = ()=>{
          const source = resolveEntry();
          const val = normalizeQuantity(source?.cantidad);
          qtyInput.value = String(val);
          decrementBtn.disabled = val <= 1;
        };

        const commitQty = (value, shouldRender=false)=>{
          if(typeof value === "string" && value.trim()===""){
            return;
          }
          const entry = resolveEntry();
          const next = normalizeQuantity(value);
          const prev = normalizeQuantity(entry?.cantidad);
          if(prev !== next){
            if(entry){
              entry.cantidad = next;
            }
            mat.cantidad = next;
            touchTask(task);
          }
          syncQtyUI();
          if(shouldRender && prev !== next) renderClient();
        };

        syncQtyUI();

        qtyInput.oninput=()=>{ commitQty(qtyInput.value); };
        qtyInput.onchange=()=>{ commitQty(qtyInput.value, true); };
        qtyInput.onblur=()=>{ syncQtyUI(); };

        const adjustQty = (delta)=>{
          const entry = resolveEntry();
          const current = normalizeQuantity(entry?.cantidad);
          commitQty(current + delta, true);
        };
        decrementBtn.onclick=()=>{ adjustQty(-1); };
        incrementBtn.onclick=()=>{ adjustQty(1); };

        const removeBtn=el("button","material-remove-btn","×");
        removeBtn.type="button";
        removeBtn.title="Quitar material";
        removeBtn.setAttribute("aria-label","Quitar material");
        removeBtn.onclick=()=>{
          task.materiales.splice(idx,1);
          touchTask(task);
          renderClient();
        };
        row.appendChild(removeBtn);

        rows.appendChild(row);
      });
    }

    wrap.appendChild(rows);

    const addBtn=el("button","btn small full","Añadir material");
    addBtn.type="button";
    addBtn.disabled = !types.length || !hasAvailableTypes;
    addBtn.onclick=()=>{
      const currentUsed = new Set((task.materiales||[])
        .map(mat=>mat?.materialTypeId)
        .filter(Boolean));
      const availableType = types.find(type=>!currentUsed.has(type.id)) || null;
      const newEntry = ensureMaterial({ materialTypeId: availableType?.id || null, cantidad: 1 });
      if(!availableType && !hasAvailableTypes){
        return;
      }
      task.materiales.push(newEntry);
      touchTask(task);
      renderClient();
    };
    wrap.appendChild(addBtn);

    if(!types.length){
      wrap.appendChild(el("div","mini muted","Crea materiales en el catálogo para poder asignarlos."));
    }

    return wrap;
  };

  const renderMaterialCatalog = ()=>{
    const wrap=el("div","materials-catalog");
    const head=el("div","nexo-head");
    head.appendChild(el("h4",null,"Catálogo de materiales"));
    wrap.appendChild(head);

    const createRow=el("div","material-create-row");
    const nameInput=el("input","input");
    nameInput.placeholder="Nombre del material";
    const createBtn=el("button","btn small","Crear material");
    createBtn.onclick=()=>{
      const name=(nameInput.value||"").trim();
      if(!name) return;
      const types=ensureMaterialTypes();
      types.push({ id: nextMaterialTypeId(), nombre: name });
      nameInput.value="";
      touch();
      renderClient();
    };
    createRow.appendChild(nameInput);
    createRow.appendChild(createBtn);
    wrap.appendChild(createRow);

    const typeList=el("div","material-type-list");
    const types=ensureMaterialTypes();
    if(!types.length){
      typeList.appendChild(el("div","mini muted","Sin materiales en el catálogo."));
    }else{
      types.forEach(type=>{
        const chip=el("span","material-type-chip", type.nombre || "Material");
        typeList.appendChild(chip);
      });
    }
    wrap.appendChild(typeList);

    return wrap;
  };

  const renderStaffPicker = (task)=>{
    const wrap=el("div","staff-section");
    wrap.appendChild(el("h4",null,"Asignación a staff"));
    const list=el("div","staff-picker");
    const locked=isTaskLocked(task);
    if(!(state.staff||[]).length){
      list.appendChild(el("div","mini muted","Añade miembros del staff desde la barra lateral."));
    }
    (state.staff||[]).forEach(st=>{
      const btn=el("button","staff-toggle",st.nombre||st.id);
      if((task.assignedStaffIds||[]).includes(st.id)) btn.classList.add("active");
      if(locked){
        btn.disabled = true;
        btn.classList.add("locked");
      }else{
        btn.onclick=()=>{
          const current=new Set(task.assignedStaffIds||[]);
          if(current.has(st.id)) current.delete(st.id); else current.add(st.id);
          task.assignedStaffIds=Array.from(current);
          touchTask(task);
          renderClient();
        };
      }
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    if(locked){
      wrap.appendChild(el("div","mini muted","La tarea está bloqueada. Desbloquéala para modificar la asignación."));
    }
    return wrap;
  };

  const relationInfo = (task)=>{
    if(task.structureRelation==="pre" || task.structureRelation==="post"){
      const hasLower = task.limitEarlyMinEnabled && Number.isFinite(task.limitEarlyMin);
      const hasUpper = task.limitLateMinEnabled && Number.isFinite(task.limitLateMin);
      if(hasLower || hasUpper){
        const summary = formatRangeSummary(
          hasLower ? task.limitEarlyMin : null,
          hasUpper ? task.limitLateMin : null
        );
        if(summary) return summary;
        return "Sin definir";
      }
      const defaultLabelText = defaultRangeLabel(task);
      if(defaultLabelText) return defaultLabelText;
    }
    if(task.structureRelation==="parallel"){
      const hasLower = task.limitEarlyMinEnabled && Number.isFinite(task.limitEarlyMin);
      const hasUpper = task.limitLateMinEnabled && Number.isFinite(task.limitLateMin);
      if(hasLower || hasUpper){
        const summary = formatRangeSummary(
          hasLower ? task.limitEarlyMin : null,
          hasUpper ? task.limitLateMin : null
        );
        if(summary) return summary;
        return "Sin definir";
      }
      const defaultLabelText = defaultRangeLabel(task);
      if(defaultLabelText) return defaultLabelText;
    }
    if(task.startMin!=null) return toHHMM(task.startMin);
    if(task.durationMin!=null) return `${task.durationMin} min`;
    return "Sin datos";
  };

  const pretaskRangeLabel = (task)=>{
    const hasLower = task.limitEarlyMinEnabled && Number.isFinite(task.limitEarlyMin);
    const hasUpper = task.limitLateMinEnabled && Number.isFinite(task.limitLateMin);
    if(hasLower || hasUpper){
      const summary = formatRangeSummary(
        hasLower ? task.limitEarlyMin : null,
        hasUpper ? task.limitLateMin : null
      );
      return summary || "Sin definir";
    }
    if(task.limitEarlyMinEnabled || task.limitLateMinEnabled) return "Sin definir";
    return defaultRangeLabel(task) || "Por defecto";
  };

  const pretaskDurationLabel = (task)=>{
    if(Number.isFinite(task.durationMin)) return `${task.durationMin} min`;
    return "Sin duración";
  };

  const formatRangeSummary = (lower, upper)=>{
    const hasLower = Number.isFinite(lower);
    const hasUpper = Number.isFinite(upper);
    if(hasLower && hasUpper){
      const lowerTxt = toHHMM(lower);
      const upperTxt = toHHMM(upper);
      return lower===upper ? lowerTxt : `${lowerTxt} – ${upperTxt}`;
    }
    if(hasLower) return `Desde ${toHHMM(lower)}`;
    if(hasUpper) return `Hasta ${toHHMM(upper)}`;
    return null;
  };

  const computeDefaultRangeForTask = (task)=>{
    if(!task) return null;
    const root = rootTaskFor(task);
    const duration = Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    if(task.structureRelation === "pre"){
      const inheritedLowerBound = inheritedPretaskLower(task);
      const minLower = inheritedLowerBound!=null ? inheritedLowerBound : defaultPretaskLower();
      const referenceStart = pretaskReferenceStart(task, root);
      const upper = defaultPretaskUpper(referenceStart, minLower, duration);
      return { lower: minLower, upper };
    }
    if(task.structureRelation === "post"){
      const lower = defaultPosttaskLower(root);
      const upper = defaultPosttaskUpper(root, lower, duration);
      return { lower, upper };
    }
    if(task.structureRelation === "parallel"){
      const lower = defaultParallelLower(root);
      const upper = defaultParallelUpper(root, lower, duration);
      return { lower, upper };
    }
    return null;
  };

  const defaultRangeLabel = (task)=>{
    const range = computeDefaultRangeForTask(task);
    if(!range) return null;
    const summary = formatRangeSummary(range.lower, range.upper);
    return summary ? `Por defecto ${summary}` : "Por defecto";
  };

  const parallelRangeLabel = (task)=>{
    const hasLower = task.limitEarlyMinEnabled && Number.isFinite(task.limitEarlyMin);
    const hasUpper = task.limitLateMinEnabled && Number.isFinite(task.limitLateMin);
    if(hasLower || hasUpper){
      const summary = formatRangeSummary(
        hasLower ? task.limitEarlyMin : null,
        hasUpper ? task.limitLateMin : null
      );
      return summary || "Sin definir";
    }
    if(task.limitEarlyMinEnabled || task.limitLateMinEnabled) return "Sin definir";
    return defaultRangeLabel(task) || "Por defecto";
  };

  const parallelDurationLabel = (task)=>{
    if(Number.isFinite(task.durationMin)) return `${task.durationMin} min`;
    return "Sin duración";
  };

  const isPretask = (t)=>t && t.structureRelation === "pre";
  const isPosttask = (t)=>t && t.structureRelation === "post";

  const collectPretaskLevels = (task)=>{
    const result=[[],[],[]];
    if(!task) return result;
    const level1=getTaskChildren(task.id).filter(isPretask);
    result[0]=level1.slice();
    const level2=[];
    level1.forEach(parent=>{
      getTaskChildren(parent.id).filter(isPretask).forEach(child=>{
        level2.push(child);
      });
    });
    result[1]=level2.slice();
    const level3=[];
    level2.forEach(parent=>{
      getTaskChildren(parent.id).filter(isPretask).forEach(child=>{
        level3.push(child);
      });
    });
    result[2]=level3.slice();
    return result;
  };

  const collectPosttaskLevels = (task)=>{
    const result=[[],[],[]];
    if(!task) return result;
    const level1=getTaskChildren(task.id).filter(isPosttask);
    result[0]=level1.slice();
    const level2=[];
    level1.forEach(parent=>{
      getTaskChildren(parent.id).filter(isPosttask).forEach(child=>{
        level2.push(child);
      });
    });
    result[1]=level2.slice();
    const level3=[];
    level2.forEach(parent=>{
      getTaskChildren(parent.id).filter(isPosttask).forEach(child=>{
        level3.push(child);
      });
    });
    result[2]=level3.slice();
    return result;
  };

  const TASK_LINK_CONFIG = {
    pre: {
      cardSelector: ".pretask-card",
      linkContainerClass: "pretask-links",
      rootSelector: ".pretask-root-node",
      pathClass: "pretask-link-path"
    },
    post: {
      cardSelector: ".posttask-card",
      linkContainerClass: "posttask-links",
      rootSelector: ".posttask-root-node",
      pathClass: "posttask-link-path"
    }
  };

  const drawTaskTreeLinks = (area, rootTask, relation)=>{
    if(!(area instanceof HTMLElement)) return;
    const config=TASK_LINK_CONFIG[relation];
    if(!config) return;
    const previous=area.querySelector(`.${config.linkContainerClass}`);
    if(previous) previous.remove();
    const width=area.clientWidth;
    const height=area.clientHeight;
    if(width<=0 || height<=0) return;
    const cards=Array.from(area.querySelectorAll(config.cardSelector));
    if(!cards.length) return;
    const head=area.querySelector(".nexo-head");
    if(!head) return;
    const areaRect=area.getBoundingClientRect();
    const anchors=new Map();
    const addAnchor=(taskId, rect)=>{
      if(!rect) return;
      anchors.set(taskId, {
        x: rect.left + rect.width/2 - areaRect.left,
        top: rect.top - areaRect.top,
        bottom: rect.bottom - areaRect.top
      });
    };

    const rootNode=area.querySelector(config.rootSelector);
    if(rootNode){
      addAnchor(rootTask.id, rootNode.getBoundingClientRect());
    }else{
      const headRect=head.getBoundingClientRect();
      addAnchor(rootTask.id, {
        left: headRect.left,
        width: headRect.width,
        top: headRect.bottom,
        bottom: headRect.bottom
      });
    }

    cards.forEach(card=>{
      const taskId=card.dataset.taskId;
      const item=card.querySelector(".nexo-item");
      if(!taskId || !item) return;
      const rect=item.getBoundingClientRect();
      addAnchor(taskId, rect);
    });
    const ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg");
    svg.classList.add(config.linkContainerClass);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    cards.forEach(card=>{
      const parentId=card.dataset.parentId;
      const taskId=card.dataset.taskId;
      if(!parentId || !taskId) return;
      const parentAnchor=anchors.get(parentId);
      const childAnchor=anchors.get(taskId);
      if(!parentAnchor || !childAnchor) return;
      const startAnchor = parentAnchor.top <= childAnchor.top ? parentAnchor : childAnchor;
      const endAnchor = parentAnchor.top <= childAnchor.top ? childAnchor : parentAnchor;
      let startY = startAnchor.bottom + 2;
      let endY = endAnchor.top - 2;
      if(startY > endY){
        const middle=(startY + endY)/2;
        startY = middle;
        endY = middle;
      }
      const midY=(startY + endY)/2;
      const startX = startAnchor === parentAnchor ? parentAnchor.x : childAnchor.x;
      const endX = endAnchor === childAnchor ? childAnchor.x : parentAnchor.x;
      const path=document.createElementNS(ns,"path");
      path.setAttribute("d", `M ${startX} ${startY} C ${startX} ${midY} ${endX} ${midY} ${endX} ${endY}`);
      path.setAttribute("class",config.pathClass);
      svg.appendChild(path);
    });
    if(svg.childNodes.length){
      area.appendChild(svg);
    }
  };

  let taskTreeLinkFrame = null;
  const refreshTaskTreeLinks = ()=>{
    document.querySelectorAll(".nexo-area[data-task-id]").forEach(area=>{
      const relation=area.dataset.relation;
      if(relation!="pre" && relation!="post") return;
      const taskId=area.dataset.taskId;
      const task=taskId ? getTaskById(taskId) : null;
      if(task) drawTaskTreeLinks(area, task, relation);
    });
  };

  const scheduleTaskTreeLinkRedraw = ()=>{
    if(typeof window === "undefined") return;
    if(taskTreeLinkFrame!=null) cancelAnimationFrame(taskTreeLinkFrame);
    taskTreeLinkFrame=requestAnimationFrame(()=>{
      taskTreeLinkFrame=null;
      refreshTaskTreeLinks();
    });
  };

  let taskTreeResizeBound=false;
  const ensureTaskTreeResizeListener = ()=>{
    if(typeof window === "undefined" || taskTreeResizeBound) return;
    taskTreeResizeBound=true;
    window.addEventListener("resize", ()=> scheduleTaskTreeLinkRedraw());
  };

  const createPretaskForLevel = (rootTask, level, parents)=>{
    if(!rootTask) return;
    const parentList = level===1 ? [rootTask] : (parents||[]);
    if(level>1 && !parentList.length){
      alert("Primero crea una pretarea del nivel inferior.");
      return;
    }
    const sortedParents = parentList.slice().sort((a,b)=>labelForTask(a).localeCompare(labelForTask(b)));
    const parent = sortedParents[0];
    if(!parent) return;
    const task=createTask({ parentId: parent.id, relation:"pre" });
    task.actionName = "";
    task.durationMin = PRETASK_DEFAULT_DURATION;
    const inheritedLowerBound = inheritedPretaskLower(task);
    const lower = inheritedLowerBound!=null ? inheritedLowerBound : defaultPretaskLower();
    task.limitEarlyMinEnabled = false;
    task.limitLateMinEnabled = false;
    task.limitEarlyMin = lower;
    const referenceStart = pretaskReferenceStart(task, rootTask);
    task.limitLateMin = defaultPretaskUpper(referenceStart, lower, task.durationMin);
    ensurePretaskBounds(task, rootTask);
    touchTask(task);
    state.project.view.selectedTaskId = rootTask.id;
    state.project.view.pretaskEditorId = task.id;
    renderClient();
  };

  const renderPretaskEditor = (rootTask, level, task, parents)=>{
    const editor=el("div","pretask-editor");

    const nameField=el("div","pretask-field");
    nameField.appendChild(el("span","pretask-field-label","Nombre de la tarea"));
    const nameInput=el("input","input pretask-input");
    nameInput.type="text";
    nameInput.placeholder="Escribe un nombre";
    nameInput.value=task.actionName||"";
    nameInput.oninput=()=>{ task.actionName = nameInput.value; };
    nameInput.onblur=()=>{ touchTask(task); state.project.view.pretaskEditorId = task.id; renderClient(); };
    nameField.appendChild(nameInput);
    editor.appendChild(nameField);

    const durationField=el("div","pretask-field");
    durationField.appendChild(el("span","pretask-field-label","Duración"));
    const durationControls=el("div","pretask-duration");
    const minus=el("button","pretask-step","−"); minus.type="button";
    const plus=el("button","pretask-step","+"); plus.type="button";
    const durationInput=el("input","input pretask-duration-input");
    durationInput.type="number";
    durationInput.step="5";
    durationInput.min="5";
    durationInput.inputMode="numeric";
    durationInput.setAttribute("aria-label","Duración en minutos");
    const currentDuration=()=> Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const updateDurationButtons=()=>{
      const current=currentDuration();
      minus.disabled = current<=5;
      durationInput.value = String(current);
    };
    const commitDuration=(value)=>{
      const parsed=Math.max(5, roundToFive(Number(value)||currentDuration()));
      if(parsed===currentDuration()){
        updateDurationButtons();
        return;
      }
      task.durationMin = parsed;
      ensurePretaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.pretaskEditorId = task.id;
      renderClient();
    };
    const adjustDuration=(delta)=>{
      const next=currentDuration()+delta;
      if(next<5) return;
      commitDuration(next);
    };
    minus.onclick=()=>adjustDuration(-5);
    plus.onclick=()=>adjustDuration(5);
    durationInput.onchange=()=>commitDuration(durationInput.value);
    durationInput.onblur=()=>commitDuration(durationInput.value);
    durationControls.appendChild(minus);
    durationControls.appendChild(durationInput);
    durationControls.appendChild(plus);
    durationField.appendChild(durationControls);
    editor.appendChild(durationField);

    updateDurationButtons();

    const locationField=el("div","pretask-field");
    locationField.appendChild(el("span","pretask-field-label","Localización"));
    const locationSelect=el("select","input");
    const emptyOption=el("option",null,"- seleccionar -"); emptyOption.value="";
    locationSelect.appendChild(emptyOption);
    (state.locations||[]).forEach(loc=>{
      const opt=el("option",null,loc.nombre||"Localización");
      opt.value=loc.id;
      if(String(loc.id)===String(task.locationId)) opt.selected=true;
      locationSelect.appendChild(opt);
    });
    locationSelect.onchange=()=>{
      task.locationId = locationSelect.value || null;
      touchTask(task);
      state.project.view.pretaskEditorId = task.id;
      renderClient();
    };
    locationField.appendChild(locationSelect);
    editor.appendChild(locationField);

    const duration=Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const rangeEnabled=!!task.limitEarlyMinEnabled || !!task.limitLateMinEnabled;
    const inheritedLowerBound = inheritedPretaskLower(task);
    const minLower = inheritedLowerBound!=null ? inheritedLowerBound : defaultPretaskLower();
    const storedLower=Number.isFinite(task.limitEarlyMin) ? roundToFive(clampToDay(task.limitEarlyMin)) : minLower;
    const effectiveLower=rangeEnabled ? storedLower : minLower;
    const referenceStart = pretaskReferenceStart(task, rootTask);
    const latestCap=Number.isFinite(referenceStart)
      ? Math.max(effectiveLower, roundToFive(clampToDay(referenceStart - duration)))
      : Math.max(effectiveLower, DAY_MAX_MIN);
    const latestLowerForDuration=Math.max(minLower, latestCap - duration);
    const upperDefault=defaultPretaskUpper(referenceStart, effectiveLower, duration);
    const storedUpper=Number.isFinite(task.limitLateMin) ? roundToFive(clampToDay(task.limitLateMin)) : upperDefault;
    const minUpperForInput=Math.min(latestCap, effectiveLower + duration);

    const commitBoundsChange = (updater)=>{
      updater();
      ensurePretaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.pretaskEditorId = task.id;
      renderClient();
    };

    const defaultRange = computeDefaultRangeForTask(task);
    const defaultSummary = defaultRange ? formatRangeSummary(defaultRange.lower, defaultRange.upper) : null;

    const timeField=el("div","pretask-field");
    timeField.appendChild(el("span","pretask-field-label","Franja horaria"));
    const timeGrid=el("div","pretask-time-grid");

    const defaultInfo=el("div","linked-default-info");
    const defaultText=el("div","linked-default-text");
    defaultText.appendChild(el("span","linked-default-label","Franja por defecto"));
    defaultText.appendChild(el("span","linked-default-value", defaultSummary || "Sin datos"));
    defaultInfo.appendChild(defaultText);
    const defaultActions=el("div","linked-default-actions");
    const acotarBtn=el("button","btn tiny", rangeEnabled ? "Restablecer franja" : "Acotar franja");
    acotarBtn.type="button";
    acotarBtn.disabled = !defaultRange;
    acotarBtn.onclick=()=>{
      if(!defaultRange) return;
      if(!rangeEnabled){
        commitBoundsChange(()=>{
          task.limitEarlyMinEnabled = true;
          task.limitLateMinEnabled = true;
          task.limitEarlyMin = defaultRange.lower;
          task.limitLateMin = defaultRange.upper;
        });
      }else{
        commitBoundsChange(()=>{
          task.limitEarlyMinEnabled = true;
          task.limitLateMinEnabled = true;
          task.limitEarlyMin = defaultRange.lower;
          task.limitLateMin = defaultRange.upper;
        });
      }
    };
    defaultActions.appendChild(acotarBtn);
    defaultInfo.appendChild(defaultActions);
    timeGrid.appendChild(defaultInfo);

    const toggleWrap=el("div","pretask-time");
    const rangeToggleLabel=el("label","pretask-time-toggle");
    const rangeToggle=el("input","pretask-time-checkbox");
    rangeToggle.type="checkbox";
    rangeToggle.checked=rangeEnabled;
    rangeToggle.onchange=()=>{
      const enabled=rangeToggle.checked;
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = enabled;
        task.limitLateMinEnabled = enabled;
        if(enabled && defaultRange){
          if(!Number.isFinite(task.limitEarlyMin)) task.limitEarlyMin = defaultRange.lower;
          if(!Number.isFinite(task.limitLateMin)) task.limitLateMin = defaultRange.upper;
        }
      });
    };
    rangeToggleLabel.appendChild(rangeToggle);
    rangeToggleLabel.appendChild(el("span","pretask-time-label","Editar manualmente"));
    toggleWrap.appendChild(rangeToggleLabel);
    timeGrid.appendChild(toggleWrap);

    const steppers=el("div","linked-range-steppers");
    steppers.hidden = !rangeEnabled;
    const createStepper=(label, value, adjust)=>{
      const wrapper=el("div","linked-range-stepper");
      wrapper.appendChild(el("span","pretask-time-label",label));
      const controls=el("div","linked-range-controls");
      const minusBtn=el("button","pretask-step","−"); minusBtn.type="button";
      minusBtn.onclick=()=> adjust(-5);
      const valueLabel=el("span","linked-range-value", Number.isFinite(value) ? toHHMM(value) : "—");
      const plusBtn=el("button","pretask-step","+"); plusBtn.type="button";
      plusBtn.onclick=()=> adjust(5);
      controls.appendChild(minusBtn);
      controls.appendChild(valueLabel);
      controls.appendChild(plusBtn);
      wrapper.appendChild(controls);
      return wrapper;
    };
    const adjustLower=(delta)=>{
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = true;
        task.limitLateMinEnabled = true;
        const current = Number.isFinite(task.limitEarlyMin)
          ? task.limitEarlyMin
          : (defaultRange ? defaultRange.lower : minLower);
        task.limitEarlyMin = current + delta;
      });
    };
    const adjustUpper=(delta)=>{
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = true;
        task.limitLateMinEnabled = true;
        const current = Number.isFinite(task.limitLateMin)
          ? task.limitLateMin
          : (defaultRange ? defaultRange.upper : upperDefault);
        task.limitLateMin = current + delta;
      });
    };
    steppers.appendChild(createStepper("Inicio mínimo", Number.isFinite(task.limitEarlyMin)?task.limitEarlyMin:(defaultRange?defaultRange.lower:null), adjustLower));
    steppers.appendChild(createStepper("Inicio máximo", Number.isFinite(task.limitLateMin)?task.limitLateMin:(defaultRange?defaultRange.upper:null), adjustUpper));
    timeGrid.appendChild(steppers);

    const lowerWrap=el("div","pretask-time");
    lowerWrap.appendChild(el("span","pretask-time-label","Franja horaria mínima"));
    const lowerInputWrap=el("div","pretask-time-input-wrap");
    const lowerInput=el("input","input pretask-time-input");
    lowerInput.type="time";
    lowerInput.step="300";
    lowerInput.min=formatTimeForInput(minLower);
    lowerInput.max=formatTimeForInput(latestLowerForDuration);
    lowerInput.value=formatTimeForInput(storedLower);
    lowerInput.disabled=!rangeEnabled;
    lowerInput.onchange=()=>{
      const parsed=parseTimeFromInput(lowerInput.value);
      if(parsed==null) return;
      task.limitEarlyMin = parsed;
      ensurePretaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.pretaskEditorId = task.id;
      renderClient();
    };
    lowerInput.onblur=()=>{
      const parsed=parseTimeFromInput(lowerInput.value);
      if(parsed==null) return;
      task.limitEarlyMin = parsed;
      ensurePretaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.pretaskEditorId = task.id;
      renderClient();
    };
    lowerInputWrap.hidden=!rangeEnabled;
    lowerInputWrap.appendChild(lowerInput);
    lowerWrap.appendChild(lowerInputWrap);
    timeGrid.appendChild(lowerWrap);

    const upperWrap=el("div","pretask-time");
    upperWrap.appendChild(el("span","pretask-time-label","Franja horaria máxima"));
    const upperInputWrap=el("div","pretask-time-input-wrap");
    const upperInput=el("input","input pretask-time-input");
    upperInput.type="time";
    upperInput.step="300";
    upperInput.min=formatTimeForInput(rangeEnabled ? minUpperForInput : effectiveLower);
    upperInput.max=formatTimeForInput(latestCap);
    upperInput.value=formatTimeForInput(Math.max(rangeEnabled ? minUpperForInput : effectiveLower, Math.min(storedUpper, latestCap)));
    upperInput.disabled=!rangeEnabled;
    upperInput.onchange=()=>{
      const parsed=parseTimeFromInput(upperInput.value);
      if(parsed==null) return;
      task.limitLateMin = parsed;
      ensurePretaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.pretaskEditorId = task.id;
      renderClient();
    };
    upperInput.onblur=()=>{
      const parsed=parseTimeFromInput(upperInput.value);
      if(parsed==null) return;
      task.limitLateMin = parsed;
      ensurePretaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.pretaskEditorId = task.id;
      renderClient();
    };
    upperInputWrap.hidden=!rangeEnabled;
    upperInputWrap.appendChild(upperInput);
    upperWrap.appendChild(upperInputWrap);
    timeGrid.appendChild(upperWrap);

    if(!rangeEnabled){
      const noteText = defaultSummary ? `Usando franja por defecto: ${defaultSummary}.` : "Sin restricciones horarias definidas";
      const note=el("div","pretask-time-note",noteText);
      timeGrid.appendChild(note);
    }

    timeField.appendChild(timeGrid);
    editor.appendChild(timeField);

    if(level>1){
      const parentField=el("div","pretask-field");
      parentField.appendChild(el("span","pretask-field-label",`Vincular con nivel ${level-1}`));
      const select=el("select","input");
      const optionEmpty=el("option",null,"- seleccionar -"); optionEmpty.value=""; select.appendChild(optionEmpty);
      const parentOptions=(parents||[]).slice().sort((a,b)=>labelForTask(a).localeCompare(labelForTask(b)));
      parentOptions.forEach(parent=>{
        const opt=el("option",null,labelForTask(parent));
        opt.value=parent.id;
        if(task.structureParentId===parent.id) opt.selected=true;
        select.appendChild(opt);
      });
      if(!parentOptions.some(parent=>parent.id===task.structureParentId)){
        select.value="";
      }
      select.onchange=()=>{
        const val=select.value;
        if(!val){
          select.value=task.structureParentId || "";
          return;
        }
        task.structureParentId = val;
        touchTask(task);
        state.project.view.pretaskEditorId = task.id;
        renderClient();
      };
      parentField.appendChild(select);
      editor.appendChild(parentField);
    }

    updateDurationButtons();
    return editor;
  };

  const renderPretaskCard = (rootTask, level, task, parents)=>{
    const card=el("div","pretask-card");
    card.dataset.taskId = task.id;
    const locked=isTaskLocked(rootTask);
    let isOpen = state.project.view.pretaskEditorId === task.id && !locked;
    if(locked && state.project.view.pretaskEditorId === task.id){
      state.project.view.pretaskEditorId = null;
      isOpen = false;
    }
    if(isOpen) card.classList.add("open");

    const removeBtn=el("button","linked-remove","×");
    removeBtn.type="button";
    removeBtn.title="Eliminar pretarea";
    if(locked){
      removeBtn.disabled = true;
      removeBtn.classList.add("locked");
    }else{
      removeBtn.onclick=(ev)=>{
        ev.stopPropagation();
        if(!window.confirm("¿Quieres eliminar esta pretarea?")) return;
        deleteTask(task.id);
        state.project.view.pretaskEditorId = null;
        renderClient();
      };
    }
    card.appendChild(removeBtn);

    const item=el("button","nexo-item","");
    if(!isTaskComplete(task)) item.classList.add("pending");
    if(isOpen) item.classList.add("active");
    if(locked){
      item.disabled = true;
      item.classList.add("locked");
    }else{
      item.onclick=()=>{
        state.project.view.pretaskEditorId = isOpen ? null : task.id;
        renderClient();
      };
    }
    item.appendChild(el("div","nexo-name",labelForTask(task)));
    const rangeLabel=pretaskRangeLabel(task);
    if(rangeLabel){
      item.appendChild(el("div","nexo-range",rangeLabel));
    }
    item.appendChild(el("div","mini",pretaskDurationLabel(task)));

    let locationLabel="";
    if(task.actionType===ACTION_TYPE_TRANSPORT){
      const flow=transportFlowForTask(task);
      const originName=locationNameById(flow.origin) || "Sin origen";
      const destName=locationNameById(flow.destination) || "Sin destino";
      locationLabel=`${originName} → ${destName}`;
    }else if(task.locationApplies===false){
      locationLabel="No aplica";
    }else{
      locationLabel=locationNameById(task.locationId) || "Sin localización";
    }
    item.appendChild(el("div","mini",locationLabel));
    card.appendChild(item);

    const linkRow=el("div","pretask-arrow");
    linkRow.appendChild(el("span","pretask-arrow-icon","↳"));
    let parentTask = null;
    if(level===1){
      parentTask = rootTask;
      card.dataset.parentId = rootTask.id;
    }else{
      parentTask = (parents||[]).find(parent=>parent.id===task.structureParentId) || null;
    }
    if(level>1){
      if(parentTask){
        card.dataset.parentId = parentTask.id;
      }else{
        delete card.dataset.parentId;
      }
    }
    const parentLabel = parentTask ? labelForTask(parentTask) : "Sin vincular";
    linkRow.appendChild(el("span","pretask-arrow-label",parentLabel));
    card.appendChild(linkRow);

    if(isOpen){
      card.appendChild(renderPretaskEditor(rootTask, level, task, parents));
    }

    return card;
  };

  const renderPretaskRow = (rootTask, level, tasks, parents)=>{
    const row=el("div","pretask-row");
    row.dataset.level=String(level);
    const head=el("div","pretask-row-head");
    head.appendChild(el("span","pretask-row-title",`Nivel ${level}`));
    const controls=el("div","pretask-controls");
    const createBtn=el("button","btn small","Crear");
    if(isTaskLocked(rootTask)){
      createBtn.disabled = true;
      createBtn.classList.add("locked");
    }else{
      createBtn.onclick=()=> createPretaskForLevel(rootTask, level, parents);
    }
    if(level>1 && !(parents&&parents.length)) createBtn.disabled=true;
    controls.appendChild(createBtn);
    head.appendChild(controls);
    row.appendChild(head);
    const body=el("div","pretask-row-body");
    if(!tasks.length){
      body.appendChild(el("div","nexo-empty","Sin tareas"));
    }else{
      const list=el("div","pretask-list");
      const sorted=tasks.slice().sort((a,b)=>labelForTask(a).localeCompare(labelForTask(b)));
      sorted.forEach(pre=>{
        list.appendChild(renderPretaskCard(rootTask, level, pre, parents));
      });
      body.appendChild(list);
    }
    row.appendChild(body);
    return row;
  };

  const renderPretaskArea = (task)=>{
    const area=el("div","nexo-area nexo-top");
    area.dataset.relation="pre";
    area.dataset.taskId = task.id;
    if(isTaskLocked(task)) area.classList.add("locked");
    ensureTaskTreeResizeListener();
    const head=el("div","nexo-head");
    head.appendChild(el("h4",null,"Pretareas"));
    area.appendChild(head);
    const [level1, level2, level3]=collectPretaskLevels(task);
    const editingId = state.project.view.pretaskEditorId;
    if(editingId && ![...level1,...level2,...level3].some(pre=>pre.id===editingId)){
      state.project.view.pretaskEditorId = null;
    }
    const grid=el("div","pretask-grid");
    grid.appendChild(renderPretaskRow(task,3,level3,level2));
    grid.appendChild(renderPretaskRow(task,2,level2,level1));
    grid.appendChild(renderPretaskRow(task,1,level1,[task]));
    area.appendChild(grid);

    const rootAnchor=el("div","pretask-root-node");
    rootAnchor.dataset.taskId = task.id;
    area.appendChild(rootAnchor);
    scheduleTaskTreeLinkRedraw();
    return area;
  };

  const createPosttaskForLevel = (rootTask, level, parents)=>{
    if(!rootTask) return;
    const parentList = level===1 ? [rootTask] : (parents||[]);
    if(level>1 && !parentList.length){
      alert("Primero crea una posttarea del nivel inferior.");
      return;
    }
    const sortedParents = parentList.slice().sort((a,b)=>labelForTask(a).localeCompare(labelForTask(b)));
    const parent = sortedParents[0];
    if(!parent) return;
    const task=createTask({ parentId: parent.id, relation:"post" });
    task.actionName = "";
    task.durationMin = PRETASK_DEFAULT_DURATION;
    const lower = defaultPosttaskLower(rootTask);
    task.limitEarlyMinEnabled = false;
    task.limitLateMinEnabled = false;
    task.limitEarlyMin = lower;
    task.limitLateMin = defaultPosttaskUpper(rootTask, lower, task.durationMin);
    ensurePosttaskBounds(task, rootTask);
    touchTask(task);
    state.project.view.selectedTaskId = rootTask.id;
    state.project.view.posttaskEditorId = task.id;
    renderClient();
  };

  const renderPosttaskEditor = (rootTask, level, task, parents)=>{
    const editor=el("div","pretask-editor");

    const nameField=el("div","pretask-field");
    nameField.appendChild(el("span","pretask-field-label","Nombre de la tarea"));
    const nameInput=el("input","input pretask-input");
    nameInput.type="text";
    nameInput.placeholder="Escribe un nombre";
    nameInput.value=task.actionName||"";
    nameInput.oninput=()=>{ task.actionName = nameInput.value; };
    nameInput.onblur=()=>{ touchTask(task); state.project.view.posttaskEditorId = task.id; renderClient(); };
    nameField.appendChild(nameInput);
    editor.appendChild(nameField);

    const durationField=el("div","pretask-field");
    durationField.appendChild(el("span","pretask-field-label","Duración"));
    const durationControls=el("div","pretask-duration");
    const minus=el("button","pretask-step","−"); minus.type="button";
    const plus=el("button","pretask-step","+"); plus.type="button";
    const durationInput=el("input","input pretask-duration-input");
    durationInput.type="number";
    durationInput.step="5";
    durationInput.min="5";
    durationInput.inputMode="numeric";
    durationInput.setAttribute("aria-label","Duración en minutos");
    const currentDuration=()=> Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const updateDurationButtons=()=>{
      const current=currentDuration();
      minus.disabled = current<=5;
      durationInput.value = String(current);
    };
    const commitDuration=(value)=>{
      const parsed=Math.max(5, roundToFive(Number(value)||currentDuration()));
      if(parsed===currentDuration()){
        updateDurationButtons();
        return;
      }
      task.durationMin = parsed;
      ensurePosttaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.posttaskEditorId = task.id;
      renderClient();
    };
    const adjustDuration=(delta)=>{
      const next=currentDuration()+delta;
      if(next<5) return;
      commitDuration(next);
    };
    minus.onclick=()=>adjustDuration(-5);
    plus.onclick=()=>adjustDuration(5);
    durationInput.onchange=()=>commitDuration(durationInput.value);
    durationInput.onblur=()=>commitDuration(durationInput.value);
    durationControls.appendChild(minus);
    durationControls.appendChild(durationInput);
    durationControls.appendChild(plus);
    durationField.appendChild(durationControls);
    editor.appendChild(durationField);

    updateDurationButtons();

    const locationField=el("div","pretask-field");
    locationField.appendChild(el("span","pretask-field-label","Localización"));
    const locationSelect=el("select","input");
    const emptyOption=el("option",null,"- seleccionar -"); emptyOption.value="";
    locationSelect.appendChild(emptyOption);
    (state.locations||[]).forEach(loc=>{
      const opt=el("option",null,loc.nombre||"Localización");
      opt.value=loc.id;
      if(String(loc.id)===String(task.locationId)) opt.selected=true;
      locationSelect.appendChild(opt);
    });
    locationSelect.onchange=()=>{
      task.locationId = locationSelect.value || null;
      touchTask(task);
      state.project.view.posttaskEditorId = task.id;
      renderClient();
    };
    locationField.appendChild(locationSelect);
    editor.appendChild(locationField);

    const defaultLower = defaultPosttaskLower(rootTask);
    const duration=Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const rangeEnabled=!!task.limitEarlyMinEnabled || !!task.limitLateMinEnabled;
    const storedLower=Number.isFinite(task.limitEarlyMin) ? roundToFive(clampToDay(task.limitEarlyMin)) : defaultLower;
    const effectiveLower=rangeEnabled ? storedLower : defaultLower;
    const maxLowerForDuration=Math.max(defaultLower, DAY_MAX_MIN - duration);
    const upperDefault=defaultPosttaskUpper(rootTask, effectiveLower, duration);
    const storedUpper=Number.isFinite(task.limitLateMin) ? roundToFive(clampToDay(task.limitLateMin)) : upperDefault;
    const minUpperForInput=Math.max(effectiveLower + duration, defaultLower + duration);

    const commitBoundsChange = (updater)=>{
      updater();
      ensurePosttaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.posttaskEditorId = task.id;
      renderClient();
    };

    const defaultRange = computeDefaultRangeForTask(task);
    const defaultSummary = defaultRange ? formatRangeSummary(defaultRange.lower, defaultRange.upper) : null;

    const timeField=el("div","pretask-field");
    timeField.appendChild(el("span","pretask-field-label","Franja horaria"));
    const timeGrid=el("div","pretask-time-grid");

    const defaultInfo=el("div","linked-default-info");
    const defaultText=el("div","linked-default-text");
    defaultText.appendChild(el("span","linked-default-label","Franja por defecto"));
    defaultText.appendChild(el("span","linked-default-value", defaultSummary || "Sin datos"));
    defaultInfo.appendChild(defaultText);
    const defaultActions=el("div","linked-default-actions");
    const acotarBtn=el("button","btn tiny", rangeEnabled ? "Restablecer franja" : "Acotar franja");
    acotarBtn.type="button";
    acotarBtn.disabled = !defaultRange;
    acotarBtn.onclick=()=>{
      if(!defaultRange) return;
      if(!rangeEnabled){
        commitBoundsChange(()=>{
          task.limitEarlyMinEnabled = true;
          task.limitLateMinEnabled = true;
          task.limitEarlyMin = defaultRange.lower;
          task.limitLateMin = defaultRange.upper;
        });
      }else{
        commitBoundsChange(()=>{
          task.limitEarlyMinEnabled = true;
          task.limitLateMinEnabled = true;
          task.limitEarlyMin = defaultRange.lower;
          task.limitLateMin = defaultRange.upper;
        });
      }
    };
    defaultActions.appendChild(acotarBtn);
    defaultInfo.appendChild(defaultActions);
    timeGrid.appendChild(defaultInfo);

    const toggleWrap=el("div","pretask-time");
    const rangeToggleLabel=el("label","pretask-time-toggle");
    const rangeToggle=el("input","pretask-time-checkbox");
    rangeToggle.type="checkbox";
    rangeToggle.checked=rangeEnabled;
    rangeToggle.onchange=()=>{
      const enabled=rangeToggle.checked;
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = enabled;
        task.limitLateMinEnabled = enabled;
        if(enabled && defaultRange){
          if(!Number.isFinite(task.limitEarlyMin)) task.limitEarlyMin = defaultRange.lower;
          if(!Number.isFinite(task.limitLateMin)) task.limitLateMin = defaultRange.upper;
        }
      });
    };
    rangeToggleLabel.appendChild(rangeToggle);
    rangeToggleLabel.appendChild(el("span","pretask-time-label","Editar manualmente"));
    toggleWrap.appendChild(rangeToggleLabel);
    timeGrid.appendChild(toggleWrap);

    const steppers=el("div","linked-range-steppers");
    steppers.hidden = !rangeEnabled;
    const createStepper=(label, value, adjust)=>{
      const wrapper=el("div","linked-range-stepper");
      wrapper.appendChild(el("span","pretask-time-label",label));
      const controls=el("div","linked-range-controls");
      const minusBtn=el("button","pretask-step","−"); minusBtn.type="button";
      minusBtn.onclick=()=> adjust(-5);
      const valueLabel=el("span","linked-range-value", Number.isFinite(value) ? toHHMM(value) : "—");
      const plusBtn=el("button","pretask-step","+"); plusBtn.type="button";
      plusBtn.onclick=()=> adjust(5);
      controls.appendChild(minusBtn);
      controls.appendChild(valueLabel);
      controls.appendChild(plusBtn);
      wrapper.appendChild(controls);
      return wrapper;
    };
    const adjustLower=(delta)=>{
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = true;
        task.limitLateMinEnabled = true;
        const current = Number.isFinite(task.limitEarlyMin)
          ? task.limitEarlyMin
          : (defaultRange ? defaultRange.lower : defaultLower);
        task.limitEarlyMin = current + delta;
      });
    };
    const adjustUpper=(delta)=>{
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = true;
        task.limitLateMinEnabled = true;
        const current = Number.isFinite(task.limitLateMin)
          ? task.limitLateMin
          : (defaultRange ? defaultRange.upper : upperDefault);
        task.limitLateMin = current + delta;
      });
    };
    steppers.appendChild(createStepper("Inicio mínimo", Number.isFinite(task.limitEarlyMin)?task.limitEarlyMin:(defaultRange?defaultRange.lower:null), adjustLower));
    steppers.appendChild(createStepper("Inicio máximo", Number.isFinite(task.limitLateMin)?task.limitLateMin:(defaultRange?defaultRange.upper:null), adjustUpper));
    timeGrid.appendChild(steppers);

    const lowerWrap=el("div","pretask-time");
    lowerWrap.appendChild(el("span","pretask-time-label","Inicio más temprano"));
    const lowerInputWrap=el("div","pretask-time-input-wrap");
    const lowerInput=el("input","input pretask-time-input");
    lowerInput.type="time";
    lowerInput.step="300";
    lowerInput.min=formatTimeForInput(defaultLower);
    lowerInput.max=formatTimeForInput(maxLowerForDuration);
    lowerInput.value=formatTimeForInput(Math.max(defaultLower, Math.min(effectiveLower, maxLowerForDuration)));
    lowerInput.disabled=!rangeEnabled;
    lowerInput.onchange=()=>{
      const parsed=parseTimeFromInput(lowerInput.value);
      if(parsed==null) return;
      task.limitEarlyMin = parsed;
      ensurePosttaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.posttaskEditorId = task.id;
      renderClient();
    };
    lowerInput.onblur=()=>{
      const parsed=parseTimeFromInput(lowerInput.value);
      if(parsed==null) return;
      task.limitEarlyMin = parsed;
      ensurePosttaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.posttaskEditorId = task.id;
      renderClient();
    };
    lowerInputWrap.hidden=!rangeEnabled;
    lowerInputWrap.appendChild(lowerInput);
    lowerWrap.appendChild(lowerInputWrap);
    timeGrid.appendChild(lowerWrap);

    const upperWrap=el("div","pretask-time");
    upperWrap.appendChild(el("span","pretask-time-label","Inicio más tarde"));
    const upperInputWrap=el("div","pretask-time-input-wrap");
    const upperInput=el("input","input pretask-time-input");
    upperInput.type="time";
    upperInput.step="300";
    upperInput.min=formatTimeForInput(rangeEnabled ? Math.max(minUpperForInput, effectiveLower + duration) : minUpperForInput);
    upperInput.max=formatTimeForInput(DAY_MAX_MIN);
    upperInput.value=formatTimeForInput(Math.max(minUpperForInput, Math.min(storedUpper, DAY_MAX_MIN)));
    upperInput.disabled=!rangeEnabled;
    upperInput.onchange=()=>{
      const parsed=parseTimeFromInput(upperInput.value);
      if(parsed==null) return;
      task.limitLateMin = parsed;
      ensurePosttaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.posttaskEditorId = task.id;
      renderClient();
    };
    upperInput.onblur=()=>{
      const parsed=parseTimeFromInput(upperInput.value);
      if(parsed==null) return;
      task.limitLateMin = parsed;
      ensurePosttaskBounds(task, rootTask);
      touchTask(task);
      state.project.view.posttaskEditorId = task.id;
      renderClient();
    };
    upperInputWrap.hidden=!rangeEnabled;
    upperInputWrap.appendChild(upperInput);
    upperWrap.appendChild(upperInputWrap);
    timeGrid.appendChild(upperWrap);

    if(!rangeEnabled){
      const noteText = defaultSummary ? `Usando franja por defecto: ${defaultSummary}.` : "Sin restricciones horarias definidas";
      const note=el("div","pretask-time-note",noteText);
      timeGrid.appendChild(note);
    }

    timeField.appendChild(timeGrid);
    editor.appendChild(timeField);

    if(level>1){
      const parentField=el("div","pretask-field");
      parentField.appendChild(el("span","pretask-field-label",`Vincular con nivel ${level-1}`));
      const select=el("select","input");
      const optionEmpty=el("option",null,"- seleccionar -"); optionEmpty.value=""; select.appendChild(optionEmpty);
      const parentOptions=(parents||[]).slice().sort((a,b)=>labelForTask(a).localeCompare(labelForTask(b)));
      parentOptions.forEach(parent=>{
        const opt=el("option",null,labelForTask(parent));
        opt.value=parent.id;
        if(task.structureParentId===parent.id) opt.selected=true;
        select.appendChild(opt);
      });
      if(!parentOptions.some(parent=>parent.id===task.structureParentId)){
        select.value="";
      }
      select.onchange=()=>{
        const val=select.value;
        if(!val){
          select.value=task.structureParentId || "";
          return;
        }
        task.structureParentId = val;
        touchTask(task);
        state.project.view.posttaskEditorId = task.id;
        renderClient();
      };
      parentField.appendChild(select);
      editor.appendChild(parentField);
    }

    updateDurationButtons();
    return editor;
  };

  const renderPosttaskCard = (rootTask, level, task, parents)=>{
    const card=el("div","posttask-card");
    card.dataset.taskId = task.id;
    const locked=isTaskLocked(rootTask);
    let isOpen = state.project.view.posttaskEditorId === task.id && !locked;
    if(locked && state.project.view.posttaskEditorId === task.id){
      state.project.view.posttaskEditorId = null;
      isOpen = false;
    }
    if(isOpen) card.classList.add("open");

    const removeBtn=el("button","linked-remove","×");
    removeBtn.type="button";
    removeBtn.title="Eliminar posttarea";
    if(locked){
      removeBtn.disabled = true;
      removeBtn.classList.add("locked");
    }else{
      removeBtn.onclick=(ev)=>{
        ev.stopPropagation();
        if(!window.confirm("¿Quieres eliminar esta posttarea?")) return;
        deleteTask(task.id);
        state.project.view.posttaskEditorId = null;
        renderClient();
      };
    }
    card.appendChild(removeBtn);

    const item=el("button","nexo-item","");
    if(!isTaskComplete(task)) item.classList.add("pending");
    if(isOpen) item.classList.add("active");
    if(locked){
      item.disabled = true;
      item.classList.add("locked");
    }else{
      item.onclick=()=>{
        state.project.view.posttaskEditorId = isOpen ? null : task.id;
        renderClient();
      };
    }
    item.appendChild(el("div","nexo-name",labelForTask(task)));
    const rangeLabel=pretaskRangeLabel(task);
    if(rangeLabel){
      item.appendChild(el("div","nexo-range",rangeLabel));
    }
    item.appendChild(el("div","mini",pretaskDurationLabel(task)));

    let locationLabel="";
    if(task.actionType===ACTION_TYPE_TRANSPORT){
      const flow=transportFlowForTask(task);
      const originName=locationNameById(flow.origin) || "Sin origen";
      const destName=locationNameById(flow.destination) || "Sin destino";
      locationLabel=`${originName} → ${destName}`;
    }else if(task.locationApplies===false){
      locationLabel="No aplica";
    }else{
      locationLabel=locationNameById(task.locationId) || "Sin localización";
    }
    item.appendChild(el("div","mini",locationLabel));
    card.appendChild(item);

    const linkRow=el("div","pretask-arrow");
    linkRow.appendChild(el("span","pretask-arrow-icon","↳"));
    let parentTask = null;
    if(level===1){
      parentTask = rootTask;
      card.dataset.parentId = rootTask.id;
    }else{
      parentTask = (parents||[]).find(parent=>parent.id===task.structureParentId) || null;
    }
    if(level>1){
      if(parentTask){
        card.dataset.parentId = parentTask.id;
      }else{
        delete card.dataset.parentId;
      }
    }
    const parentLabel = parentTask ? labelForTask(parentTask) : "Sin vincular";
    linkRow.appendChild(el("span","pretask-arrow-label",parentLabel));
    card.appendChild(linkRow);

    if(isOpen){
      card.appendChild(renderPosttaskEditor(rootTask, level, task, parents));
    }

    return card;
  };

  const renderPosttaskRow = (rootTask, level, tasks, parents)=>{
    const row=el("div","posttask-row");
    row.dataset.level=String(level);
    const head=el("div","posttask-row-head");
    head.appendChild(el("span","posttask-row-title",`Nivel ${level}`));
    const controls=el("div","pretask-controls");
    const createBtn=el("button","btn small","Crear");
    if(isTaskLocked(rootTask)){
      createBtn.disabled = true;
      createBtn.classList.add("locked");
    }else{
      createBtn.onclick=()=> createPosttaskForLevel(rootTask, level, parents);
    }
    if(level>1 && !(parents&&parents.length)) createBtn.disabled=true;
    controls.appendChild(createBtn);
    head.appendChild(controls);
    row.appendChild(head);
    const body=el("div","posttask-row-body");
    if(!tasks.length){
      body.appendChild(el("div","nexo-empty","Sin tareas"));
    }else{
      const list=el("div","posttask-list");
      const sorted=tasks.slice().sort((a,b)=>labelForTask(a).localeCompare(labelForTask(b)));
      sorted.forEach(post=>{
        list.appendChild(renderPosttaskCard(rootTask, level, post, parents));
      });
      body.appendChild(list);
    }
    row.appendChild(body);
    return row;
  };

  const renderPosttaskArea = (task)=>{
    const area=el("div","nexo-area nexo-bottom");
    area.dataset.relation="post";
    area.dataset.taskId = task.id;
    if(isTaskLocked(task)) area.classList.add("locked");
    ensureTaskTreeResizeListener();
    const head=el("div","nexo-head");
    head.appendChild(el("h4",null,"Posttareas"));
    area.appendChild(head);
    const rootAnchor=el("div","posttask-root-node");
    rootAnchor.dataset.taskId = task.id;
    area.appendChild(rootAnchor);
    const [level1, level2, level3]=collectPosttaskLevels(task);
    const editingId = state.project.view.posttaskEditorId;
    if(editingId && ![...level1,...level2,...level3].some(post=>post.id===editingId)){
      state.project.view.posttaskEditorId = null;
    }
    const grid=el("div","posttask-grid");
    grid.appendChild(renderPosttaskRow(task,1,level1,[task]));
    grid.appendChild(renderPosttaskRow(task,2,level2,level1));
    grid.appendChild(renderPosttaskRow(task,3,level3,level2));
    area.appendChild(grid);
    scheduleTaskTreeLinkRedraw();
    return area;
  };

  const createParallelTask = (rootTask)=>{
    if(!rootTask) return;
    const task=createTask({ parentId: rootTask.id, relation:"parallel" });
    task.actionName = "";
    task.durationMin = PRETASK_DEFAULT_DURATION;
    const lower = defaultParallelLower(rootTask);
    const upper = defaultParallelUpper(rootTask, lower, task.durationMin);
    task.limitEarlyMinEnabled = true;
    task.limitLateMinEnabled = true;
    task.limitEarlyMin = lower;
    task.limitLateMin = upper;
    touchTask(task);
    state.project.view.selectedTaskId = rootTask.id;
    state.project.view.paralleltaskEditorId = task.id;
    renderClient();
  };

  const renderParallelEditor = (rootTask, task)=>{
    const editor=el("div","pretask-editor parallel-editor");

    const nameField=el("div","pretask-field parallel-field");
    nameField.appendChild(el("span","pretask-field-label parallel-field-label","Nombre de la tarea"));
    const nameInput=el("input","input pretask-input");
    nameInput.type="text";
    nameInput.placeholder="Escribe un nombre";
    nameInput.value=task.actionName||"";
    nameInput.oninput=()=>{ task.actionName = nameInput.value; };
    nameInput.onblur=()=>{ touchTask(task); state.project.view.paralleltaskEditorId = task.id; renderClient(); };
    nameField.appendChild(nameInput);
    editor.appendChild(nameField);

    const durationField=el("div","pretask-field parallel-field");
    durationField.appendChild(el("span","pretask-field-label parallel-field-label","Duración"));
    const durationControls=el("div","pretask-duration");
    const minus=el("button","pretask-step","−"); minus.type="button";
    const plus=el("button","pretask-step","+"); plus.type="button";
    const durationInput=el("input","input pretask-duration-input");
    durationInput.type="number";
    durationInput.step="5";
    durationInput.min="5";
    durationInput.inputMode="numeric";
    durationInput.setAttribute("aria-label","Duración en minutos");
    const currentDuration=()=> Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const updateDurationButtons=()=>{
      const current=currentDuration();
      minus.disabled = current<=5;
      durationInput.value = String(current);
    };
    const commitDuration=(value)=>{
      const parsed=Math.max(5, roundToFive(Number(value)||currentDuration()));
      if(parsed===currentDuration()){
        updateDurationButtons();
        return;
      }
      task.durationMin = parsed;
      ensureParallelBounds(task, rootTask);
      touchTask(task);
      state.project.view.paralleltaskEditorId = task.id;
      renderClient();
    };
    const adjustDuration=(delta)=>{
      const next=currentDuration()+delta;
      if(next<5) return;
      commitDuration(next);
    };
    minus.onclick=()=>adjustDuration(-5);
    plus.onclick=()=>adjustDuration(5);
    durationInput.onchange=()=>commitDuration(durationInput.value);
    durationInput.onblur=()=>commitDuration(durationInput.value);
    durationControls.appendChild(minus);
    durationControls.appendChild(durationInput);
    durationControls.appendChild(plus);
    durationField.appendChild(durationControls);
    editor.appendChild(durationField);

    updateDurationButtons();

    const locationField=el("div","pretask-field parallel-field");
    locationField.appendChild(el("span","pretask-field-label parallel-field-label","Localización"));
    const locationSelect=el("select","input");
    const emptyOption=el("option",null,"- seleccionar -"); emptyOption.value="";
    locationSelect.appendChild(emptyOption);
    (state.locations||[]).forEach(loc=>{
      const opt=el("option",null,loc.nombre||"Localización");
      opt.value=loc.id;
      if(String(loc.id)===String(task.locationId)) opt.selected=true;
      locationSelect.appendChild(opt);
    });
    locationSelect.onchange=()=>{
      task.locationId = locationSelect.value || null;
      touchTask(task);
      state.project.view.paralleltaskEditorId = task.id;
      renderClient();
    };
    locationField.appendChild(locationSelect);
    editor.appendChild(locationField);

    const defaultLower = defaultParallelLower(rootTask);
    const duration=Math.max(5, roundToFive(Number(task.durationMin)||PRETASK_DEFAULT_DURATION));
    const defaultUpper = defaultParallelUpper(rootTask, defaultLower, duration);
    const rangeEnabled=!!task.limitEarlyMinEnabled || !!task.limitLateMinEnabled;
    const storedLower=Number.isFinite(task.limitEarlyMin) ? roundToFive(clampToDay(task.limitEarlyMin)) : defaultLower;
    const storedUpper=Number.isFinite(task.limitLateMin) ? roundToFive(clampToDay(task.limitLateMin)) : defaultUpper;
    const effectiveLower=rangeEnabled ? storedLower : defaultLower;
    const effectiveUpper=rangeEnabled ? storedUpper : defaultUpper;
    const minLower=0;
    const maxLower=Math.max(0, DAY_MAX_MIN - duration);
    const minUpperForInput=Math.max(effectiveLower + duration, minLower + duration);

    const commitBoundsChange = (updater)=>{
      updater();
      ensureParallelBounds(task, rootTask);
      touchTask(task);
      state.project.view.paralleltaskEditorId = task.id;
      renderClient();
    };

    const defaultRange = computeDefaultRangeForTask(task);
    const defaultSummary = defaultRange ? formatRangeSummary(defaultRange.lower, defaultRange.upper) : null;

    const timeField=el("div","pretask-field parallel-field");
    timeField.appendChild(el("span","pretask-field-label parallel-field-label","Franja horaria"));
    const timeGrid=el("div","pretask-time-grid parallel-time-grid");

    const defaultInfo=el("div","linked-default-info");
    const defaultText=el("div","linked-default-text");
    defaultText.appendChild(el("span","linked-default-label","Franja por defecto"));
    defaultText.appendChild(el("span","linked-default-value", defaultSummary || "Sin datos"));
    defaultInfo.appendChild(defaultText);
    const defaultActions=el("div","linked-default-actions");
    const acotarBtn=el("button","btn tiny", rangeEnabled ? "Restablecer franja" : "Acotar franja");
    acotarBtn.type="button";
    acotarBtn.disabled = !defaultRange;
    acotarBtn.onclick=()=>{
      if(!defaultRange) return;
      if(!rangeEnabled){
        commitBoundsChange(()=>{
          task.limitEarlyMinEnabled = true;
          task.limitLateMinEnabled = true;
          task.limitEarlyMin = defaultRange.lower;
          task.limitLateMin = defaultRange.upper;
        });
      }else{
        commitBoundsChange(()=>{
          task.limitEarlyMinEnabled = true;
          task.limitLateMinEnabled = true;
          task.limitEarlyMin = defaultRange.lower;
          task.limitLateMin = defaultRange.upper;
        });
      }
    };
    defaultActions.appendChild(acotarBtn);
    defaultInfo.appendChild(defaultActions);
    timeGrid.appendChild(defaultInfo);

    const toggleWrap=el("div","pretask-time parallel-time");
    const rangeToggleLabel=el("label","pretask-time-toggle parallel-time-toggle");
    const rangeToggle=el("input","pretask-time-checkbox");
    rangeToggle.type="checkbox";
    rangeToggle.checked=rangeEnabled;
    rangeToggle.onchange=()=>{
      const enabled=rangeToggle.checked;
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = enabled;
        task.limitLateMinEnabled = enabled;
        if(enabled && defaultRange){
          if(!Number.isFinite(task.limitEarlyMin)) task.limitEarlyMin = defaultRange.lower;
          if(!Number.isFinite(task.limitLateMin)) task.limitLateMin = defaultRange.upper;
        }
      });
    };
    rangeToggleLabel.appendChild(rangeToggle);
    rangeToggleLabel.appendChild(el("span","pretask-time-label parallel-time-label","Editar manualmente"));
    toggleWrap.appendChild(rangeToggleLabel);
    timeGrid.appendChild(toggleWrap);

    const steppers=el("div","linked-range-steppers");
    steppers.hidden = !rangeEnabled;
    const createStepper=(label, value, adjust)=>{
      const wrapper=el("div","linked-range-stepper");
      wrapper.appendChild(el("span","pretask-time-label parallel-time-label",label));
      const controls=el("div","linked-range-controls");
      const minusBtn=el("button","pretask-step","−"); minusBtn.type="button";
      minusBtn.onclick=()=> adjust(-5);
      const valueLabel=el("span","linked-range-value", Number.isFinite(value) ? toHHMM(value) : "—");
      const plusBtn=el("button","pretask-step","+"); plusBtn.type="button";
      plusBtn.onclick=()=> adjust(5);
      controls.appendChild(minusBtn);
      controls.appendChild(valueLabel);
      controls.appendChild(plusBtn);
      wrapper.appendChild(controls);
      return wrapper;
    };
    const adjustLower=(delta)=>{
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = true;
        task.limitLateMinEnabled = true;
        const current = Number.isFinite(task.limitEarlyMin)
          ? task.limitEarlyMin
          : (defaultRange ? defaultRange.lower : defaultLower);
        task.limitEarlyMin = current + delta;
      });
    };
    const adjustUpper=(delta)=>{
      commitBoundsChange(()=>{
        task.limitEarlyMinEnabled = true;
        task.limitLateMinEnabled = true;
        const current = Number.isFinite(task.limitLateMin)
          ? task.limitLateMin
          : (defaultRange ? defaultRange.upper : defaultUpper);
        task.limitLateMin = current + delta;
      });
    };
    steppers.appendChild(createStepper("Inicio", Number.isFinite(task.limitEarlyMin)?task.limitEarlyMin:(defaultRange?defaultRange.lower:null), adjustLower));
    steppers.appendChild(createStepper("Fin", Number.isFinite(task.limitLateMin)?task.limitLateMin:(defaultRange?defaultRange.upper:null), adjustUpper));
    timeGrid.appendChild(steppers);

    const lowerWrap=el("div","pretask-time parallel-time");
    lowerWrap.appendChild(el("span","pretask-time-label parallel-time-label","Inicio"));
    const lowerInputWrap=el("div","pretask-time-input-wrap");
    const lowerInput=el("input","input pretask-time-input");
    lowerInput.type="time";
    lowerInput.step="300";
    lowerInput.min=formatTimeForInput(minLower);
    lowerInput.max=formatTimeForInput(maxLower);
    lowerInput.value=formatTimeForInput(Math.max(minLower, Math.min(effectiveLower, maxLower)));
    lowerInput.disabled=!rangeEnabled;
    lowerInput.onchange=()=>{
      const parsed=parseTimeFromInput(lowerInput.value);
      if(parsed==null) return;
      task.limitEarlyMin = parsed;
      ensureParallelBounds(task, rootTask);
      touchTask(task);
      state.project.view.paralleltaskEditorId = task.id;
      renderClient();
    };
    lowerInput.onblur=()=>{
      const parsed=parseTimeFromInput(lowerInput.value);
      if(parsed==null) return;
      task.limitEarlyMin = parsed;
      ensureParallelBounds(task, rootTask);
      touchTask(task);
      state.project.view.paralleltaskEditorId = task.id;
      renderClient();
    };
    lowerInputWrap.hidden=!rangeEnabled;
    lowerInputWrap.appendChild(lowerInput);
    lowerWrap.appendChild(lowerInputWrap);
    timeGrid.appendChild(lowerWrap);

    const upperWrap=el("div","pretask-time parallel-time");
    upperWrap.appendChild(el("span","pretask-time-label parallel-time-label","Fin"));
    const upperInputWrap=el("div","pretask-time-input-wrap");
    const upperInput=el("input","input pretask-time-input");
    upperInput.type="time";
    upperInput.step="300";
    upperInput.min=formatTimeForInput(rangeEnabled ? minUpperForInput : Math.max(defaultLower + duration, minLower + duration));
    upperInput.max=formatTimeForInput(DAY_MAX_MIN);
    upperInput.value=formatTimeForInput(Math.max(minUpperForInput, Math.min(effectiveUpper, DAY_MAX_MIN)));
    upperInput.disabled=!rangeEnabled;
    upperInput.onchange=()=>{
      const parsed=parseTimeFromInput(upperInput.value);
      if(parsed==null) return;
      task.limitLateMin = parsed;
      ensureParallelBounds(task, rootTask);
      touchTask(task);
      state.project.view.paralleltaskEditorId = task.id;
      renderClient();
    };
    upperInput.onblur=()=>{
      const parsed=parseTimeFromInput(upperInput.value);
      if(parsed==null) return;
      task.limitLateMin = parsed;
      ensureParallelBounds(task, rootTask);
      touchTask(task);
      state.project.view.paralleltaskEditorId = task.id;
      renderClient();
    };
    upperInputWrap.hidden=!rangeEnabled;
    upperInputWrap.appendChild(upperInput);
    upperWrap.appendChild(upperInputWrap);
    timeGrid.appendChild(upperWrap);

    if(!rangeEnabled){
      const noteText = defaultSummary ? `Usando franja por defecto: ${defaultSummary}.` : "Usa la franja de la tarea principal";
      const note=el("div","pretask-time-note parallel-time-note",noteText);
      timeGrid.appendChild(note);
    }

    timeField.appendChild(timeGrid);
    editor.appendChild(timeField);

    return editor;
  };

  const renderParallelCard = (rootTask, task)=>{
    const card=el("div","pretask-card parallel-card");
    card.dataset.taskId = task.id;
    const locked=isTaskLocked(rootTask);
    let isOpen = state.project.view.paralleltaskEditorId === task.id && !locked;
    if(locked && state.project.view.paralleltaskEditorId === task.id){
      state.project.view.paralleltaskEditorId = null;
      isOpen = false;
    }
    if(isOpen) card.classList.add("open");

    const removeBtn=el("button","linked-remove","×");
    removeBtn.type="button";
    removeBtn.title="Eliminar tarea concurrente";
    if(locked){
      removeBtn.disabled = true;
      removeBtn.classList.add("locked");
    }else{
      removeBtn.onclick=(ev)=>{
        ev.stopPropagation();
        if(!window.confirm("¿Quieres eliminar esta tarea concurrente?")) return;
        deleteTask(task.id);
        state.project.view.paralleltaskEditorId = null;
        renderClient();
      };
    }
    card.appendChild(removeBtn);

    const item=el("button","nexo-item","");
    if(!isTaskComplete(task)) item.classList.add("pending");
    if(isOpen) item.classList.add("active");
    if(locked){
      item.disabled = true;
      item.classList.add("locked");
    }else{
      item.onclick=()=>{
        state.project.view.paralleltaskEditorId = isOpen ? null : task.id;
        renderClient();
      };
    }
    item.appendChild(el("div","nexo-name",labelForTask(task)));
    const rangeLabel=parallelRangeLabel(task);
    if(rangeLabel){
      item.appendChild(el("div","nexo-range",rangeLabel));
    }
    item.appendChild(el("div","mini",parallelDurationLabel(task)));

    let locationLabel="";
    if(task.actionType===ACTION_TYPE_TRANSPORT){
      const flow=transportFlowForTask(task);
      const originName=locationNameById(flow.origin) || "Sin origen";
      const destName=locationNameById(flow.destination) || "Sin destino";
      locationLabel=`${originName} → ${destName}`;
    }else if(task.locationApplies===false){
      locationLabel="No aplica";
    }else{
      locationLabel=locationNameById(task.locationId) || "Sin localización";
    }
    item.appendChild(el("div","mini",locationLabel));
    card.appendChild(item);

    if(isOpen){
      card.appendChild(renderParallelEditor(rootTask, task));
    }

    return card;
  };

  const renderParallelArea = (task)=>{
    const area=el("div","nexo-area nexo-left");
    area.dataset.relation="parallel";
    area.dataset.taskId = task.id;
    if(isTaskLocked(task)) area.classList.add("locked");
    const head=el("div","nexo-head");
    head.appendChild(el("h4",null,"Concurrencia"));
    const controls=el("div","pretask-controls parallel-controls");
    const createBtn=el("button","btn small","Crear");
    if(isTaskLocked(task)){
      createBtn.disabled = true;
      createBtn.classList.add("locked");
    }else{
      createBtn.onclick=()=> createParallelTask(task);
    }
    controls.appendChild(createBtn);
    head.appendChild(controls);
    area.appendChild(head);
    const children=getTaskChildren(task.id).filter(ch=>ch.structureRelation==="parallel");
    const editingId = state.project.view.paralleltaskEditorId;
    if(editingId && !children.some(ch=>ch.id===editingId)){
      state.project.view.paralleltaskEditorId = null;
    }
    if(!children.length){
      area.appendChild(el("div","nexo-empty","Sin tareas"));
      return area;
    }
    const list=el("div","parallel-list");
    const sorted=children.slice().sort((a,b)=>{
      const la=Number.isFinite(a.limitEarlyMin) ? a.limitEarlyMin : defaultParallelLower(task);
      const lb=Number.isFinite(b.limitEarlyMin) ? b.limitEarlyMin : defaultParallelLower(task);
      if(la!==lb) return la-lb;
      return labelForTask(a).localeCompare(labelForTask(b));
    });
    sorted.forEach(par=>{
      list.appendChild(renderParallelCard(task, par));
    });
    area.appendChild(list);
    return area;
  };

  const renderMaterialArea = (task)=>{
    const area=el("div","nexo-area nexo-right materials-area");
    area.dataset.relation="materials";
    if(isTaskLocked(task)) area.classList.add("locked");
    area.appendChild(renderMaterialAssignment(task));
    area.appendChild(renderMaterialCatalog());
    return area;
  };

  const renderTaskCard = (container, task)=>{
    container.innerHTML="";
    if(!task){
      state.project.view.materialsEditorId = null;
      container.appendChild(el("div","empty-card","Selecciona una tarea para ver los detalles."));
      return;
    }
    if(state.project.view.materialsEditorId && state.project.view.materialsEditorId !== task.id){
      state.project.view.materialsEditorId = null;
    }
    applyTaskDefaults(task);
    const locked=isTaskLocked(task);
    if(locked){
      state.project.view.materialsEditorId = null;
      state.project.view.pretaskEditorId = null;
      state.project.view.posttaskEditorId = null;
      state.project.view.paralleltaskEditorId = null;
    }

    const editor=el("div","task-editor");
    if(locked) editor.classList.add("locked");
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
    if(locked){
      const lockChip=el("span","status-chip lock","Bloqueada");
      chips.appendChild(lockChip);
    }
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

    if(locked){
      center.appendChild(el("div","lock-notice","Esta tarea está bloqueada. Desbloquéala desde el catálogo para editarla."));
    }

    const details=el("div","detail-list");
    const addDetail=(label,value)=>{
      const row=el("div","detail-row");
      row.appendChild(el("span","detail-label",label));
      row.appendChild(el("span","detail-value",value || "—"));
      details.appendChild(row);
    };

    const hasRange=(task.startMin!=null && task.endMin!=null);
    const schedule=hasRange ? `${toHHMM(task.startMin)} – ${toHHMM(task.endMin)}` : (task.startMin!=null ? toHHMM(task.startMin) : relationInfo(task));
    addDetail("Horario", schedule);
    const duration=task.durationMin!=null ? `${task.durationMin} min` : "Sin duración";
    addDetail("Duración", duration);

    if(task.structureRelation==="pre"){
      const defaultRange = computeDefaultRangeForTask(task);
      const lowerText = task.limitEarlyMinEnabled && Number.isFinite(task.limitEarlyMin)
        ? toHHMM(task.limitEarlyMin)
        : (defaultRange ? toHHMM(defaultRange.lower) : "Sin restricción");
      const upperText = task.limitLateMinEnabled && Number.isFinite(task.limitLateMin)
        ? toHHMM(task.limitLateMin)
        : (defaultRange ? toHHMM(defaultRange.upper) : "Sin restricción");
      addDetail("Franja horaria mínima", lowerText);
      addDetail("Franja horaria máxima", upperText);
    }else if(task.structureRelation==="parallel"){
      const defaultRange = computeDefaultRangeForTask(task);
      const lowerText = task.limitEarlyMinEnabled && Number.isFinite(task.limitEarlyMin)
        ? toHHMM(task.limitEarlyMin)
        : (defaultRange ? toHHMM(defaultRange.lower) : "Sin restricción");
      const upperText = task.limitLateMinEnabled && Number.isFinite(task.limitLateMin)
        ? toHHMM(task.limitLateMin)
        : (defaultRange ? toHHMM(defaultRange.upper) : "Sin restricción");
      addDetail("Inicio", lowerText);
      addDetail("Fin", upperText);
    }else if(task.structureRelation==="post"){
      const defaultRange = computeDefaultRangeForTask(task);
      const earlyText = task.limitEarlyMinEnabled && Number.isFinite(task.limitEarlyMin)
        ? toHHMM(task.limitEarlyMin)
        : (defaultRange ? toHHMM(defaultRange.lower) : "Sin restricción");
      const lateText = task.limitLateMinEnabled && Number.isFinite(task.limitLateMin)
        ? toHHMM(task.limitLateMin)
        : (defaultRange ? toHHMM(defaultRange.upper) : "Sin restricción");
      addDetail("Inicio mínimo", earlyText);
      addDetail("Inicio máximo", lateText);
    }

    if(task.actionType===ACTION_TYPE_TRANSPORT){
      const flow=transportFlowForTask(task);
      addDetail("Origen", locationNameById(flow.origin) || "Sin origen");
      addDetail("Destino", locationNameById(flow.destination) || "Sin destino");
      const vehName=(state.vehicles||[]).find(v=>v.id===task.vehicleId)?.nombre || "Sin vehículo";
      addDetail("Vehículo", vehName);
    }else{
      let locationText="Sin localización";
      if(task.locationApplies===false){
        locationText="No aplica";
      }else if(task.locationId){
        locationText=locationNameById(task.locationId) || "Sin localización";
      }
      addDetail("Localización", locationText);
    }

    if(task.comentario && task.comentario.trim()){
      const note=el("div","detail-row");
      note.appendChild(el("span","detail-label","Notas"));
      note.appendChild(el("span","detail-value detail-note",task.comentario.trim()));
      details.appendChild(note);
    }

    center.appendChild(details);
    center.appendChild(renderStaffPicker(task));

    grid.appendChild(renderPretaskArea(task));
    grid.appendChild(renderParallelArea(task));
    grid.appendChild(center);
    grid.appendChild(renderMaterialArea(task));
    grid.appendChild(renderPosttaskArea(task));

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
    let selectedTask = selectedId ? getTaskById(selectedId) : null;
    if(selectedTask && (selectedTask.structureRelation === "pre" || selectedTask.structureRelation === "post")){
      const trail=getBreadcrumb(selectedTask);
      const rootNode = trail[0] || null;
      if(rootNode){
        selectedId = rootNode.id;
        selectedTask = rootNode;
        state.project.view.selectedTaskId = selectedId;
      }
    }
    const isCatalogMount = catalogTarget && root === catalogTarget;
    root.innerHTML="";
    const screen=el("div","client-screen");
    root.appendChild(screen);

    if(isCatalogMount){
      const timeline=el("div","client-timeline");
      renderFixedTimeline(timeline, selectedId);
      screen.appendChild(timeline);

      const layout=el("div","client-layout");
      const catalog=el("div","task-catalog");
      const card=el("div","task-card");
      layout.appendChild(catalog);
      layout.appendChild(card);
      screen.appendChild(layout);

      renderCatalog(catalog, tasks, selectedId);
      renderTaskCard(card, selectedTask);
    }else{
      const timeline=el("div","client-timeline");
      renderTimeline(timeline, selectedId);
      screen.appendChild(timeline);

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

  const scheduleTargets = new Set();
  let scheduleSequence = 0;

  function notifyScheduleSubscribers(){
    if(typeof window.updateScheduleCatalogButton === "function") window.updateScheduleCatalogButton();
    if(typeof window.updateScheduleCatalogViews === "function") window.updateScheduleCatalogViews();
  }

  const ensureScheduleMeta = ()=>{
    state.scheduleMeta = state.scheduleMeta || {};
    if(typeof state.scheduleMeta.generatedAt === "undefined") state.scheduleMeta.generatedAt = null;
    state.scheduleMeta.warningsByStaff = state.scheduleMeta.warningsByStaff || {};
    state.scheduleMeta.globalWarnings = state.scheduleMeta.globalWarnings || [];
    if(typeof state.scheduleMeta.activeStaffId === "undefined") state.scheduleMeta.activeStaffId = null;
    state.scheduleMeta.metricsByStaff = state.scheduleMeta.metricsByStaff || {};
    state.scheduleMeta.globalMetrics = state.scheduleMeta.globalMetrics || {};
    if(typeof state.scheduleMeta.lastMethod === "undefined") state.scheduleMeta.lastMethod = null;
    state.scheduleMeta.parameters = state.scheduleMeta.parameters || {};
  };

  const normalizeMinute = (value)=>{
    if(!Number.isFinite(value)) return null;
    return roundToFive(Math.max(0, Math.min(DAY_MAX_MIN, Number(value)||0)));
  };

  const SCHEDULE_AI_MODEL = "gpt-4o-mini";
  const SCHEDULE_AI_RESPONSE_FORMAT = { type: "json_object" };
  const SCHEDULE_AI_STORAGE_KEY = "eventplan.openai.key";
  const SCHEDULE_AI_SYSTEM_PROMPT = `Eres un planificador de eventos. Recibirás un objeto JSON con el proyecto, el staff, las localizaciones y todas las tareas bloqueadas de un cliente. Debes proponer el horario de cada miembro del equipo devolviendo únicamente un JSON con el formato {"staff":[{"staffId":"ID_DEL_STAFF","sessions":[{"taskId":"ID_DE_TAREA","start":"HH:MM","end":"HH:MM"}]}],"warnings":[]}. Usa horas en formato 24h HH:MM, respeta los identificadores originales y no inventes tareas nuevas. Si una tarea no puede programarse incluye una advertencia en el array warnings o en warnings del miembro correspondiente. Prioriza que cada miembro del staff empiece lo más tarde posible sin comprometer la correcta ejecución de todas las tareas y minimiza los huecos vacíos dentro de su turno.`;

  const scheduleAiTimeToMinutes = (value)=>{
    if(value==null || value==="") return null;
    if(Number.isFinite(value)) return normalizeMinute(Number(value));
    const str = String(value).trim();
    if(!str) return null;
    const numeric = Number(str);
    if(Number.isFinite(numeric)) return normalizeMinute(numeric);
    const match = str.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
    if(!match) return null;
    const hour = Number(match[1]||0);
    const minute = Number(match[2]||0);
    const second = Number(match[3]||0);
    if(!Number.isFinite(hour) || hour<0 || hour>23) return null;
    if(!Number.isFinite(minute) || minute<0 || minute>59) return null;
    if(!Number.isFinite(second) || second<0 || second>59) return null;
    const total = hour*60 + minute + Math.round(second/60);
    return normalizeMinute(total);
  };

  const collectScheduleAiPayload = ()=>{
    const tasks=getTaskList();
    const staffList=(state.staff||[]);
    const staffById=new Map(staffList.map(st=>[st.id, st]));
    const taskPayload=tasks.map(task=>{
      const breadcrumb=getBreadcrumb(task).map(step=>({
        id:step.id,
        nombre:step.actionName||step.nombre||step.id,
        tipo:step.structureRelation||"milestone"
      }));
      const assigned=(task.assignedStaffIds||[]).map(id=>{
        const st=staffById.get(id);
        return st?{id:st.id,nombre:st.nombre||st.id}:{id,nombre:id};
      });
      const location = task.locationId ? {
        id:task.locationId,
        nombre:locationNameById(task.locationId)||task.locationId
      } : null;
      return {
        id:task.id,
        nombre:task.actionName||labelForTask(task),
        tipo:task.structureRelation||"milestone",
        tipoAccion:task.actionType||ACTION_TYPE_NORMAL,
        duracionMin:Number.isFinite(Number(task.durationMin))?Number(task.durationMin):null,
        inicioFijo:task.startMin!=null?toHHMM(task.startMin):null,
        finFijo:task.endMin!=null?toHHMM(task.endMin):null,
        limiteInferior:Number.isFinite(Number(task.limitEarlyMin))?toHHMM(task.limitEarlyMin):null,
        limiteSuperior:Number.isFinite(Number(task.limitLateMin))?toHHMM(task.limitLateMin):null,
        dependeDe:task.structureParentId||null,
        raiz:rootTaskFor(task)?.id||null,
        localizacion:location,
        asignadoA:assigned,
        jerarquia:breadcrumb,
        notas:task.comentario||""
      };
    });
    return {
      proyecto:{
        nombre:state.project?.nombre||"",
        fecha:state.project?.fecha||"",
        zonaHoraria:state.project?.tz||""
      },
      parametros:{
        criterios:[
          "El horario de todos los miembros del staff debe comenzar lo más tarde posible sin impedir que las tareas se completen correctamente.",
          "Debe minimizarse el número y la duración de huecos vacíos dentro del turno de cada miembro del staff."
        ]
      },
      staff:staffList.map(st=>({
        id:st.id,
        nombre:st.nombre||st.id,
        rol:st.rol||"STAFF"
      })),
      localizaciones:(state.locations||[]).map(loc=>({
        id:loc.id,
        nombre:loc.nombre||loc.id
      })),
      tareas:taskPayload
    };
  };

  const readOpenAiApiKey = ()=>{
    try{
      const stored=localStorage.getItem(SCHEDULE_AI_STORAGE_KEY);
      if(stored && stored.trim()) return stored.trim();
    }catch(e){}
    const input=window.prompt("Introduce tu API key de OpenAI (se guardará localmente en este navegador)");
    if(!input) return null;
    const trimmed=input.trim();
    if(!trimmed) return null;
    try{
      localStorage.setItem(SCHEDULE_AI_STORAGE_KEY, trimmed);
    }catch(e){}
    return trimmed;
  };

  const requestScheduleFromAI = async (payload)=>{
    const apiKey=readOpenAiApiKey();
    if(!apiKey) throw new Error("Es necesario introducir una API key de OpenAI.");
    const body={
      model:SCHEDULE_AI_MODEL,
      temperature:0.2,
      response_format:SCHEDULE_AI_RESPONSE_FORMAT,
      messages:[
        {role:"system",content:SCHEDULE_AI_SYSTEM_PROMPT},
        {role:"user",content:JSON.stringify(payload)}
      ]
    };
    let response;
    try{
      response=await fetch("https://api.openai.com/v1/chat/completions",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${apiKey}`
        },
        body:JSON.stringify(body)
      });
    }catch(err){
      throw new Error("No se pudo contactar con el servicio de OpenAI.");
    }
    if(response.status===401 || response.status===403){
      try{ localStorage.removeItem(SCHEDULE_AI_STORAGE_KEY); }catch(e){}
      throw new Error("La API key de OpenAI no es válida o ha expirado.");
    }
    if(!response.ok){
      let detail="";
      try{ detail=await response.text(); }catch(e){}
      const msg=detail?`OpenAI respondió con un error: ${detail}`:"OpenAI respondió con un error inesperado.";
      throw new Error(msg);
    }
    return response.json();
  };

  const parseAiScheduleResponse = (data)=>{
    const content=data?.choices?.[0]?.message?.content;
    if(!content) throw new Error("La IA devolvió una respuesta vacía.");
    let text=String(content).trim();
    const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if(fenced) text=fenced[1].trim();
    try{
      return JSON.parse(text);
    }catch(err){
      throw new Error("No se pudo interpretar la respuesta de la IA.");
    }
  };

  const computeMetricsFromSessions = (sessions)=>{
    const sorted=(sessions||[]).slice().sort((a,b)=>{
      const sa=Number.isFinite(Number(a?.startMin))?Number(a.startMin):Number.POSITIVE_INFINITY;
      const sb=Number.isFinite(Number(b?.startMin))?Number(b.startMin):Number.POSITIVE_INFINITY;
      return sa-sb;
    });
    const metrics={
      sessionCount:sorted.length,
      tasksScheduled:sorted.length,
      totalMinutes:0,
      gapMinutes:0,
      breakCount:0,
      earliestStart:null,
      latestEnd:null,
      unscheduled:0,
      windowViolations:0,
      fixedConflicts:0
    };
    let prevEnd=null;
    sorted.forEach(session=>{
      const start=Number.isFinite(Number(session?.startMin))?Number(session.startMin):null;
      const end=Number.isFinite(Number(session?.endMin))?Number(session.endMin):null;
      if(start!=null){
        if(metrics.earliestStart==null || start<metrics.earliestStart) metrics.earliestStart=start;
      }
      if(end!=null){
        if(metrics.latestEnd==null || end>metrics.latestEnd) metrics.latestEnd=end;
      }
      if(start!=null && end!=null && end>start){
        const dur=end-start;
        metrics.totalMinutes+=dur;
        if(prevEnd!=null && start>prevEnd){
          metrics.breakCount+=1;
          metrics.gapMinutes+=start-prevEnd;
        }
        if(prevEnd==null || end>prevEnd) prevEnd=end;
      }else{
        metrics.unscheduled+=1;
      }
    });
    return metrics;
  };

  const applyAiScheduleResult = (result)=>{
    ensureScheduleMeta();
    const staffList=(state.staff||[]);
    const tasks=getTaskList();
    const staffById=new Map(staffList.map(st=>[st.id, st]));
    const staffByName=new Map(staffList.map(st=>[(st.nombre||st.id||"").toLowerCase(), st]));
    const taskById=new Map(tasks.map(task=>[task.id, task]));
    const taskByName=new Map(tasks.map(task=>[(labelForTask(task)||"").toLowerCase(), task]));
    const schedules=Array.isArray(result?.staff)?result.staff:Array.isArray(result?.schedules)?result.schedules:[];
    const sessionsByStaff={};
    const warningsByStaff={};
    const globalWarnings=new Set();
    const scheduledTaskIds=new Set();

    schedules.forEach(entry=>{
      let staffId=entry?.staffId || entry?.id || entry?.personId || null;
      if(staffId && staffById.has(staffId)){
        staffId=staffById.get(staffId).id;
      }else{
        const nameKey=String(entry?.staffName || entry?.nombre || "").trim().toLowerCase();
        if(nameKey && staffByName.has(nameKey)){
          staffId=staffByName.get(nameKey).id;
        }
      }
      if(!staffId){
        const label=entry?.staffName || entry?.nombre || entry?.staffId || "desconocido";
        globalWarnings.add(`La IA devolvió un miembro del staff no reconocido: ${label}.`);
        return;
      }
      const sessions=[];
      const staffWarnings=new Set(Array.isArray(entry?.warnings)?entry.warnings.map(msg=>String(msg)):[]);
      const rawSessions=Array.isArray(entry?.sessions)?entry.sessions:[];
      rawSessions.forEach((session, idx)=>{
        const taskIdRaw=session?.taskId || session?.id || session?.actionId || null;
        let task=taskIdRaw ? taskById.get(taskIdRaw) : null;
        if(!task && session?.taskName){
          const taskNameKey=String(session.taskName).trim().toLowerCase();
          if(taskByName.has(taskNameKey)) task=taskByName.get(taskNameKey);
        }
        if(!task){
          staffWarnings.add(`Sesión ${idx+1}: tarea desconocida (${taskIdRaw || session?.taskName || "sin identificador"}).`);
          return;
        }
        const start=scheduleAiTimeToMinutes(session?.start ?? session?.startTime ?? session?.inicio ?? session?.horaInicio);
        let end=scheduleAiTimeToMinutes(session?.end ?? session?.endTime ?? session?.fin ?? session?.horaFin);
        const duration=Number(session?.durationMin ?? session?.duration ?? session?.duracionMin ?? session?.duracion);
        if(start!=null && (end==null || end<=start) && Number.isFinite(duration) && duration>0){
          end=normalizeMinute(start + duration);
        }
        if((start==null || end==null || end<=start)){
          staffWarnings.add(`${labelForTask(task)}: horario incompleto devuelto por la IA.`);
          return;
        }
        task.startMin=start;
        task.endMin=end;
        task.durationMin=Math.max(5, roundToFive(end-start));
        task.assignedStaffIds=[staffId];
        scheduledTaskIds.add(task.id);
        sessions.push(makeTaskSession(task, start, end));
      });
      if(!sessions.length && !staffWarnings.size){
        staffWarnings.add("La IA no generó sesiones para este miembro del staff.");
      }
      sessionsByStaff[staffId]=sessions;
      warningsByStaff[staffId]=[...staffWarnings];
    });

    staffList.forEach(st=>{
      if(!sessionsByStaff[st.id]) sessionsByStaff[st.id]=[];
      if(!warningsByStaff[st.id]) warningsByStaff[st.id]=[];
    });

    state.sessions = state.sessions || {};
    Object.keys(state.sessions).forEach(key=>{
      if(key!=="CLIENTE" && !sessionsByStaff[key]) delete state.sessions[key];
    });

    const metricsByStaff={};
    staffList.forEach(st=>{
      const sessions=(sessionsByStaff[st.id]||[]).slice().sort((a,b)=> (a.startMin||0)-(b.startMin||0));
      state.sessions[st.id]=sessions;
      if(sessions.length){
        state.horaInicial=state.horaInicial||{};
        state.horaInicial[st.id]=sessions[0].startMin ?? null;
        const firstLoc=sessions.find(s=>s.locationId)?.locationId || null;
        state.localizacionInicial=state.localizacionInicial||{};
        state.localizacionInicial[st.id]=firstLoc;
      }else{
        if(state.horaInicial && Object.prototype.hasOwnProperty.call(state.horaInicial, st.id)) delete state.horaInicial[st.id];
        if(state.localizacionInicial && Object.prototype.hasOwnProperty.call(state.localizacionInicial, st.id)) delete state.localizacionInicial[st.id];
      }
      metricsByStaff[st.id]=computeMetricsFromSessions(sessions);
      (warningsByStaff[st.id]||[]).forEach(msg=>globalWarnings.add(String(msg)));
    });

    const extraWarnings=Array.isArray(result?.warnings)?result.warnings:[];
    extraWarnings.forEach(msg=>globalWarnings.add(String(msg)));

    tasks.forEach(task=>{
      if(task.structureRelation==="milestone") return;
      if(!task.assignedStaffIds || !task.assignedStaffIds.length) return;
      if(scheduledTaskIds.has(task.id)) return;
      globalWarnings.add(`${labelForTask(task)}: la IA no devolvió horario para esta tarea.`);
    });

    state.scheduleMeta.generatedAt=new Date().toISOString();
    state.scheduleMeta.lastMethod="IA";
    state.scheduleMeta.warningsByStaff=warningsByStaff;
    state.scheduleMeta.metricsByStaff=metricsByStaff;
    state.scheduleMeta.globalMetrics=computeGlobalMetrics(metricsByStaff, staffList);
    state.scheduleMeta.globalWarnings=[...globalWarnings];

    touch();
    if(typeof window.renderClient === "function") window.renderClient();
    notifyScheduleSubscribers();
    return {warnings:[...globalWarnings]};
  };

  const generateSchedulesWithAI = async ()=>{
    ensureScheduleMeta();
    const tasks=getTaskList();
    if(!tasks.length) throw new Error("No hay tareas del cliente que planificar.");
    if(!window.isScheduleCatalogAvailable()) throw new Error("Bloquea todas las tareas del cliente antes de generar los horarios.");
    const staffList=(state.staff||[]);
    if(!staffList.length) throw new Error("Añade miembros del staff para generar los horarios.");
    const payload=collectScheduleAiPayload();
    const response=await requestScheduleFromAI(payload);
    const parsed=parseAiScheduleResponse(response);
    return applyAiScheduleResult(parsed);
  };

  const runScheduleAiGeneration = async (container, button)=>{
    if(!button || button.dataset.loading==="true") return;
    const previousLabel=button.textContent;
    button.dataset.loading="true";
    button.disabled=true;
    button.textContent="Consultando IA...";
    try{
      await generateSchedulesWithAI();
      if(typeof flashStatus === "function") flashStatus("Horarios generados con IA.");
    }catch(err){
      console.error(err);
      const message=err?.message || "No se pudieron generar los horarios con IA.";
      if(typeof flashStatus === "function") flashStatus(message);
      else alert(message);
    }finally{
      button.dataset.loading="false";
      button.textContent=previousLabel;
      renderScheduleCatalogInto(container);
    }
  };

  window.isScheduleCatalogAvailable = ()=>{
    const tasks=getTaskList();
    if(!tasks.length) return false;
    return tasks.every(isTaskLocked);
  };

  const nextScheduleSessionId = ()=>{
    scheduleSequence+=1;
    return `SCH_${Date.now().toString(36)}${scheduleSequence.toString(36)}`;
  };

  const cloneMaterialsForSession = (task)=> (task.materiales||[]).map(mat=>({
    materialTypeId: mat?.materialTypeId || null,
    cantidad: Math.max(0, Number(mat?.cantidad)||0)
  }));

  const makeTaskSession = (task, start, end)=>{
    const session={
      id:nextScheduleSessionId(),
      startMin:start,
      endMin:end,
      taskTypeId:task.taskTypeId||null,
      actionType: task.actionType===ACTION_TYPE_TRANSPORT?ACTION_TYPE_TRANSPORT:ACTION_TYPE_NORMAL,
      actionName: labelForTask(task),
      locationId: task.locationApplies===false ? null : (task.locationId||null),
      vehicleId:null,
      materiales:cloneMaterialsForSession(task),
      comentario: task.comentario||"",
      prevId:null,
      nextId:null,
      inheritFromId: task.id||null
    };
    if(session.actionType===ACTION_TYPE_TRANSPORT && !session.taskTypeId){
      session.taskTypeId = TASK_TRANSP;
      session.vehicleId = defaultVehicleId();
    }
    return session;
  };

  const computeGlobalMetrics = (metricsByStaff, staffList)=>{
    const summary={
      staffWithSessions:0,
      totalSessions:0,
      totalMinutes:0,
      totalGapMinutes:0,
      breakCount:0,
      earliestStart:null,
      latestEnd:null,
      averageStartMin:null,
      averageEndMin:null,
      averageLoadMinutes:0,
      unscheduledTotal:0
    };
    const startValues=[];
    const endValues=[];
    (staffList||[]).forEach(st=>{
      const stats=metricsByStaff[st.id];
      if(!stats) return;
      summary.totalSessions += Number(stats.sessionCount)||0;
      summary.totalMinutes += Number(stats.totalMinutes)||0;
      summary.totalGapMinutes += Number(stats.gapMinutes)||0;
      summary.breakCount += Number(stats.breakCount)||0;
      summary.unscheduledTotal += Number(stats.unscheduled)||0;
      if(stats.earliestStart!=null){
        summary.staffWithSessions+=1;
        startValues.push(stats.earliestStart);
        if(summary.earliestStart==null || stats.earliestStart<summary.earliestStart){
          summary.earliestStart = stats.earliestStart;
        }
      }
      if(stats.latestEnd!=null){
        endValues.push(stats.latestEnd);
        if(summary.latestEnd==null || stats.latestEnd>summary.latestEnd){
          summary.latestEnd = stats.latestEnd;
        }
      }else if(stats.earliestStart!=null){
        endValues.push(stats.earliestStart);
      }
    });
    if(startValues.length){
      const sumStart=startValues.reduce((acc,val)=>acc+val,0);
      const sumEnd=endValues.reduce((acc,val)=>acc+val,0);
      summary.averageStartMin = Math.round(sumStart/startValues.length);
      summary.averageEndMin = Math.round(sumEnd/startValues.length);
      summary.averageLoadMinutes = Math.round(summary.totalMinutes/startValues.length);
    }
    return summary;
  };

  const formatScheduleTimestamp = (iso)=>{
    if(!iso) return "Nunca";
    try{
      const d=new Date(iso);
      return d.toLocaleString();
    }catch(e){
      return String(iso);
    }
  };

  const renderScheduleCatalogInto = (container)=>{
    ensureScheduleMeta();
    if(!container) return;
    container.innerHTML="";
    const controls=el("div","schedule-controls");
    const availabilityMsg="Bloquea todas las tareas del cliente para generar los horarios.";
    const available=window.isScheduleCatalogAvailable();
    const aiLabel=state.scheduleMeta.generatedAt?"Regenerar horario con IA":"Generar horario con IA";
    const aiBtn=el("button","btn",aiLabel);
    aiBtn.type="button";
    aiBtn.onclick=()=> runScheduleAiGeneration(container, aiBtn);
    if(!available){
      aiBtn.disabled=true;
      aiBtn.title=availabilityMsg;
    }
    controls.appendChild(aiBtn);

    if(state.scheduleMeta.generatedAt){
      controls.appendChild(el("span","mini",`Última generación (IA): ${formatScheduleTimestamp(state.scheduleMeta.generatedAt)}`));
    }
    const staffList=(state.staff||[]);
    container.appendChild(controls);

    if(!available){
      container.appendChild(el("div","mini warn-text","Bloquea todas las tareas del cliente desde el catálogo para poder generar los horarios del staff."));
      return;
    }

    if(!staffList.length){
      container.appendChild(el("div","mini muted","Añade miembros del staff desde la barra lateral para poder generar los horarios."));
      return;
    }

    const warningsStore=state.scheduleMeta.warningsByStaff||{};
    let removed=false;
    Object.keys(warningsStore).forEach(id=>{
      if(!staffList.some(st=>st.id===id)){
        delete warningsStore[id];
        removed=true;
      }
    });
    if(removed) touch();

    const globalWarnings=state.scheduleMeta.globalWarnings||[];
    if(globalWarnings.length){
      const warnList=el("ul","warn-text");
      globalWarnings.forEach(msg=> warnList.appendChild(el("li",null,msg)));
      container.appendChild(warnList);
    }

    if(state.scheduleMeta.generatedAt){
      const globalMetrics=state.scheduleMeta.globalMetrics||{};
      const formatTime=(mins)=> Number.isFinite(Number(mins)) ? toHHMM(Number(mins)) : "-";
      const totalMinutes=Math.max(0, Number(globalMetrics.totalMinutes)||0);
      const gapMinutes=Math.max(0, Number(globalMetrics.totalGapMinutes)||0);
      const breakCount=Math.max(0, Number(globalMetrics.breakCount)||0);
      const gapText = gapMinutes ? `${gapMinutes} min${breakCount ? ` (${breakCount} huecos)` : ""}` : "0 min";
      const avgLoad = Number.isFinite(Number(globalMetrics.averageLoadMinutes)) && Number(globalMetrics.averageLoadMinutes)>0
        ? `${Math.round(Number(globalMetrics.averageLoadMinutes))} min`
        : (totalMinutes>0?"0 min":"-");
      const globalBox=el("div","schedule-global");
      globalBox.appendChild(el("div","mini","Resumen general"));
      const globalTable=el("table","schedule-metrics-table");
      const gBody=el("tbody");
      const rows=[
        ["Staff con turnos", String(Math.max(0, Number(globalMetrics.staffWithSessions)||0))],
        ["Sesiones totales", String(Math.max(0, Number(globalMetrics.totalSessions)||0))],
        ["Trabajo total", `${totalMinutes} min`],
        ["Huecos acumulados", gapText],
        ["Inicio más temprano", formatTime(globalMetrics.earliestStart)],
        ["Fin más tardío", formatTime(globalMetrics.latestEnd)],
        ["Inicio promedio", formatTime(globalMetrics.averageStartMin)],
        ["Fin promedio", formatTime(globalMetrics.averageEndMin)],
        ["Carga media", avgLoad],
        ["Tareas sin asignar", String(Math.max(0, Number(globalMetrics.unscheduledTotal)||0))]
      ];
      rows.forEach(([label,value])=>{
        const row=el("tr");
        row.appendChild(el("th",null,label));
        row.appendChild(el("td",null,value));
        gBody.appendChild(row);
      });
      globalTable.appendChild(gBody);
      globalBox.appendChild(globalTable);
      container.appendChild(globalBox);
    }

    let activeId=state.scheduleMeta.activeStaffId;
    if(!activeId || !staffList.some(st=>st.id===activeId)){
      const fallbackId=staffList[0]?.id||null;
      if(state.scheduleMeta.activeStaffId!==fallbackId){
        state.scheduleMeta.activeStaffId=fallbackId;
        touch();
      }
      activeId=fallbackId;
    }

    const tabs=el("div","schedule-tabs");
    staffList.forEach(st=>{
      const tab=el("button","tab"+(st.id===activeId?" active":""), st.nombre||st.id);
      tab.type="button";
      tab.onclick=()=>{
        if(state.scheduleMeta.activeStaffId===st.id) return;
        state.scheduleMeta.activeStaffId=st.id;
        touch();
        renderScheduleCatalogInto(container);
      };
      tabs.appendChild(tab);
    });
    container.appendChild(tabs);

    const body=el("div","schedule-body");
    if(!activeId){
      body.appendChild(el("div","mini muted","Selecciona un miembro del staff para ver su planificación."));
    }else{
      const sessions=(state.sessions?.[activeId]||[]).slice().sort((a,b)=> (a.startMin||0)-(b.startMin||0));
      if(!sessions.length){
        const msg = state.scheduleMeta.generatedAt
          ? "No hay acciones asignadas a este miembro del staff."
          : "Pulsa \"Generar horario con IA\" para crear la planificación.";
        body.appendChild(el("div","mini muted",msg));
      }else{
        const table=el("table","schedule-table");
        const thead=el("thead"); const trh=el("tr");
        ["Inicio","Fin","Duración","Acción","Localización"].forEach(label=> trh.appendChild(el("th",null,label)));
        thead.appendChild(trh); table.appendChild(thead);
        const tbody=el("tbody");
        sessions.forEach(session=>{
          const row=el("tr");
          row.appendChild(el("td",null, toHHMM(session.startMin||0)));
          row.appendChild(el("td",null, toHHMM(session.endMin||session.startMin||0)));
          const dur=(Number(session.endMin||0)-Number(session.startMin||0));
          row.appendChild(el("td",null, dur>0?`${dur} min`:"-"));
          row.appendChild(el("td",null, session.actionName||"Sin nombre"));
          let loc="Sin localización";
          if(session.actionType===ACTION_TYPE_TRANSPORT){
            loc = session.locationId ? (locationNameById(session.locationId)||"En ruta") : "En ruta";
          }else if(session.locationId){
            loc = locationNameById(session.locationId)||"Sin localización";
          }
          row.appendChild(el("td",null, loc));
          tbody.appendChild(row);
        });
        table.appendChild(tbody);
        body.appendChild(table);
      }
      const staffWarnings=(state.scheduleMeta.warningsByStaff||{})[activeId]||[];
      if(staffWarnings.length){
        const warnTitle=el("div","mini warn-text","Conflictos en la planificación:");
        const warnList=el("ul","warn-text");
        staffWarnings.forEach(msg=> warnList.appendChild(el("li",null,msg)));
        body.appendChild(warnTitle);
        body.appendChild(warnList);
      }
      const metrics=(state.scheduleMeta.metricsByStaff||{})[activeId]||null;
      if(metrics && state.scheduleMeta.generatedAt){
        const metricsBox=el("div","schedule-metrics");
        metricsBox.appendChild(el("div","mini","Resumen del turno"));
        const metricsTable=el("table","schedule-metrics-table");
        const mBody=el("tbody");
        const startTxt=metrics.earliestStart!=null?toHHMM(metrics.earliestStart):"-";
        const endTxt=metrics.latestEnd!=null?toHHMM(metrics.latestEnd):"-";
        const activeMinutes=Math.max(0, Number(metrics.totalMinutes)||0);
        const gapTxt = metrics.gapMinutes
          ? `${metrics.gapMinutes} min${metrics.breakCount ? ` (${metrics.breakCount} huecos)` : ""}`
          : "0 min";
        const rows=[
          ["Acciones planificadas", String(Math.max(0, Number(metrics.tasksScheduled)||0))],
          ["Sesiones totales", String(Math.max(0, Number(metrics.sessionCount)||0))],
          ["Inicio", startTxt],
          ["Fin", endTxt],
          ["Trabajo activo", `${activeMinutes} min`],
          ["Huecos", gapTxt],
          ["Transportes", String(Math.max(0, Number(metrics.transportSessions)||0))],
          ["Conflictos de ubicación", String(Math.max(0, Number(metrics.locationIssues)||0))],
          ["Incumplimientos de ventana", String(Math.max(0, Number(metrics.windowViolations)||0))],
          ["Conflictos de inicio fijo", String(Math.max(0, Number(metrics.fixedConflicts)||0))],
          ["Tareas sin hueco", String(Math.max(0, Number(metrics.unscheduled)||0))]
        ];
        rows.forEach(([label,value])=>{
          const row=el("tr");
          row.appendChild(el("th",null,label));
          row.appendChild(el("td",null,value));
          mBody.appendChild(row);
        });
        metricsTable.appendChild(mBody);
        metricsBox.appendChild(metricsTable);
        body.appendChild(metricsBox);
      }
    }
    container.appendChild(body);
  };

  window.setScheduleCatalogTarget = (container)=>{
    ensureScheduleMeta();
    [...scheduleTargets].forEach(target=>{
      if(!target || !target.isConnected || target===container){
        scheduleTargets.delete(target);
        if(target && target!==container) target.innerHTML="";
      }
    });
    if(container){
      scheduleTargets.add(container);
      renderScheduleCatalogInto(container);
    }
  };

  window.updateScheduleCatalogViews = ()=>{
    ensureScheduleMeta();
    [...scheduleTargets].forEach(target=>{
      if(!target || !target.isConnected){
        scheduleTargets.delete(target);
        return;
      }
      renderScheduleCatalogInto(target);
    });
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

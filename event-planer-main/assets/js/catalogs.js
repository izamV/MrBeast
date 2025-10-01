(function(){
  "use strict";
  const ACTION_TYPE_TRANSPORT = window.ACTION_TYPE_TRANSPORT || "TRANSPORTE";
  const ACTION_TYPE_NORMAL = window.ACTION_TYPE_NORMAL || "NORMAL";
  const TILE_SIZE = 256;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 18;
  const DEFAULT_MAP_VIEW = { lat: 40.4168, lng: -3.7038, zoom: 5 };
  const WALKING_SPEED_KMPH = 4.5;
  const DRIVING_SPEED_KMPH = 45;
  const GOOGLE_KEY_STORAGE = "eventplan.googleMapsKey";

  const toNumber = (value)=>{
    const str = String(value ?? "").trim().replace(/,/g, ".");
    if(!str) return NaN;
    return Number(str);
  };

  const clampLatLng = (lat, lng)=>{
    const clampedLat = Math.max(-85.0511, Math.min(85.0511, Number.isFinite(lat) ? lat : 0));
    let normLng = Number.isFinite(lng) ? lng : 0;
    normLng = ((normLng + 180) % 360 + 360) % 360 - 180;
    return { lat: clampedLat, lng: normLng };
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

  const computeInitialView = (locations, width, height)=>{
    if(!locations.length){
      return { center:{ lat:DEFAULT_MAP_VIEW.lat, lng:DEFAULT_MAP_VIEW.lng }, zoom:DEFAULT_MAP_VIEW.zoom };
    }
    const lats = locations.map(l=>l.lat);
    const lngs = locations.map(l=>l.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    let zoom = DEFAULT_MAP_VIEW.zoom;
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

  const haversineKm = (a, b)=>{
    const R = 6371;
    const toRad = (deg)=>deg * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + sinLng * sinLng * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    return R * c;
  };

  const estimateTimes = (distanceKm)=>{
    if(!Number.isFinite(distanceKm)){
      return { drive:null, walk:null };
    }
    const drive = (distanceKm / DRIVING_SPEED_KMPH) * 60;
    const walk = (distanceKm / WALKING_SPEED_KMPH) * 60;
    return { drive, walk };
  };

  const ensureGoogleConfig = ()=>{
    state.integrations = state.integrations || {};
    state.integrations.googleMaps = state.integrations.googleMaps || { apiKey:"" };
    return state.integrations.googleMaps;
  };

  const loadGoogleApiKey = ()=>{
    const cfg = ensureGoogleConfig();
    if(cfg.apiKey) return cfg.apiKey;
    try{
      return localStorage.getItem(GOOGLE_KEY_STORAGE) || "";
    }catch(err){
      return "";
    }
  };

  const persistGoogleApiKey = (key)=>{
    const cfg = ensureGoogleConfig();
    const trimmed = key.trim();
    if(cfg.apiKey !== trimmed){
      cfg.apiKey = trimmed;
      touch();
    }
    try{
      if(trimmed){
        localStorage.setItem(GOOGLE_KEY_STORAGE, trimmed);
      }else{
        localStorage.removeItem(GOOGLE_KEY_STORAGE);
      }
    }catch(err){
      // Ignore storage errors (e.g. private mode)
    }
    return trimmed;
  };

  const formatDistance = (km)=>{
    if(!Number.isFinite(km)) return "-";
    if(km >= 100) return `${km.toFixed(0)} km`;
    if(km >= 10) return `${km.toFixed(1)} km`;
    return `${km.toFixed(2)} km`;
  };

  const formatDuration = (mins)=>{
    if(!Number.isFinite(mins)) return "-";
    const total = Math.max(0, Math.round(mins));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if(h && m) return `${h}h ${m}m`;
    if(h) return `${h}h`;
    return `${m}m`;
  };

  const buildSegments = (locations)=>{
    const segments=[];
    for(let i=0; i<locations.length-1; i++){
      const from = locations[i];
      const to = locations[i+1];
      const distanceKm = haversineKm(from, to);
      const { drive, walk } = estimateTimes(distanceKm);
      segments.push({
        id:`${from.id||i}_${to.id||i+1}`,
        from,
        to,
        distanceKm,
        durationDriveMin: drive,
        durationWalkMin: walk,
        path:null,
        provider:"estimate",
        providerNote:"Estimación basada en distancia geodésica"
      });
    }
    return segments;
  };

  const updateSegmentEstimates = (seg)=>{
    if(!Number.isFinite(seg.distanceKm)) return;
    const { drive, walk } = estimateTimes(seg.distanceKm);
    if(!Number.isFinite(seg.durationDriveMin)) seg.durationDriveMin = drive;
    if(!Number.isFinite(seg.durationWalkMin)) seg.durationWalkMin = walk;
  };

  const fetchDistanceMatrix = async (from, to, mode, apiKey)=>{
    const params = new URLSearchParams({
      units:"metric",
      origins:`${from.lat},${from.lng}`,
      destinations:`${to.lat},${to.lng}`,
      mode,
      key:apiKey
    });
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(data.status !== "OK"){
      throw new Error(data.error_message || data.status || "Respuesta no válida");
    }
    const element = data.rows?.[0]?.elements?.[0];
    if(!element || element.status !== "OK"){
      throw new Error(element?.status || "Sin datos");
    }
    return {
      distanceKm: element.distance?.value!=null ? element.distance.value / 1000 : null,
      durationMin: element.duration?.value!=null ? element.duration.value / 60 : null
    };
  };

  const updateSegmentsWithGoogle = async (segments, apiKey)=>{
    const warnings=[];
    let updated=0;
    for(const seg of segments){
      let driving=null;
      let walking=null;
      try{
        driving = await fetchDistanceMatrix(seg.from, seg.to, "driving", apiKey);
      }catch(err){
        warnings.push(`Vehículo ${seg.from.nombre||seg.from.id} → ${seg.to.nombre||seg.to.id}: ${err.message}`);
      }
      try{
        walking = await fetchDistanceMatrix(seg.from, seg.to, "walking", apiKey);
      }catch(err){
        warnings.push(`Caminando ${seg.from.nombre||seg.from.id} → ${seg.to.nombre||seg.to.id}: ${err.message}`);
      }
      const distanceSource = driving?.distanceKm ?? walking?.distanceKm;
      if(Number.isFinite(distanceSource)){
        seg.distanceKm = distanceSource;
      }
      if(driving?.durationMin != null){
        seg.durationDriveMin = driving.durationMin;
      }
      if(walking?.durationMin != null){
        seg.durationWalkMin = walking.durationMin;
      }
      updateSegmentEstimates(seg);
      if(driving || walking){
        seg.provider = "google";
        seg.providerNote = `Actualizado con Google Maps (${new Date().toLocaleString()})`;
        updated++;
      }
    }
    return { updated, warnings };
  };

  const fetchOsrmRoute = async (from, to, profile)=>{
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const params = new URLSearchParams({ overview:"full", geometries:"geojson" });
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?${params.toString()}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(data.code !== "Ok" || !Array.isArray(data.routes) || !data.routes.length){
      throw new Error(data.message || data.code || "Ruta no disponible");
    }
    const route = data.routes[0];
    const coordsList = Array.isArray(route.geometry?.coordinates)
      ? route.geometry.coordinates.map(([lng, lat])=>({ lat, lng }))
      : null;
    return {
      distanceKm: route.distance!=null ? route.distance / 1000 : null,
      durationMin: route.duration!=null ? route.duration / 60 : null,
      path: coordsList
    };
  };

  const updateSegmentsWithOsrm = async (segments, callbacks={})=>{
    const warnings=[];
    let updated=0;
    for(const seg of segments){
      let driving=null;
      let walking=null;
      try{
        driving = await fetchOsrmRoute(seg.from, seg.to, "driving");
      }catch(err){
        warnings.push(`Vehículo ${seg.from.nombre||seg.from.id} → ${seg.to.nombre||seg.to.id}: ${err.message}`);
      }
      try{
        walking = await fetchOsrmRoute(seg.from, seg.to, "walking");
      }catch(err){
        warnings.push(`Caminando ${seg.from.nombre||seg.from.id} → ${seg.to.nombre||seg.to.id}: ${err.message}`);
      }
      let usedProvider=false;
      if(driving){
        if(Number.isFinite(driving.distanceKm)) seg.distanceKm = driving.distanceKm;
        if(Number.isFinite(driving.durationMin)) seg.durationDriveMin = driving.durationMin;
        if(!seg.path && Array.isArray(driving.path) && driving.path.length) seg.path = driving.path;
        usedProvider = true;
      }
      if(walking){
        if(Number.isFinite(walking.durationMin)) seg.durationWalkMin = walking.durationMin;
        if(!seg.path && Array.isArray(walking.path) && walking.path.length) seg.path = walking.path;
        usedProvider = true;
      }
      updateSegmentEstimates(seg);
      if(usedProvider){
        seg.provider = "osrm";
        seg.providerNote = `Ruta calculada con OpenStreetMap (${new Date().toLocaleString()})`;
        updated++;
      }
      if(callbacks.onSegmentUpdated){
        try{ callbacks.onSegmentUpdated(seg); }catch(err){}
      }
    }
    if(callbacks.onComplete){
      try{ callbacks.onComplete({ updated, warnings }); }catch(err){}
    }
    return { updated, warnings };
  };

  const setupCatalogMap = (container, locations, segments)=>{
    if(container._cleanup){
      try{ container._cleanup(); }catch(err){}
    }
    container.innerHTML="";
    if(!locations.length){
      container.appendChild(el("div","mini","Añade localizaciones con coordenadas para ver el mapa."));
      return { refresh:()=>{} };
    }

    const mapArea = el("div","loc-map-area");
    const canvas = document.createElement("canvas"); canvas.className="loc-map-canvas";
    const overlay = el("div","loc-map-overlay");
    mapArea.appendChild(canvas);
    mapArea.appendChild(overlay);
    container.appendChild(mapArea);

    const view={ center:{ lat:DEFAULT_MAP_VIEW.lat, lng:DEFAULT_MAP_VIEW.lng }, zoom:DEFAULT_MAP_VIEW.zoom, width:mapArea.clientWidth||760, height:mapArea.clientHeight||420 };
    const init = computeInitialView(locations, view.width, view.height);
    view.center = clampLatLng(init.center.lat, init.center.lng);
    view.zoom = init.zoom;

    const ctx = canvas.getContext("2d");
    const tileCache = new Map();

    const locationPins = locations.map((loc, idx)=>{
      const pin=el("div","loc-map-location");
      pin.appendChild(el("span","loc-map-dot"));
      pin.appendChild(el("span","loc-map-label", loc.nombre || loc.id || `Punto ${idx+1}`));
      overlay.appendChild(pin);
      return { loc, el:pin };
    });

    const segmentLabels = segments.map((seg)=>{
      const label = el("div","loc-map-segment","");
      overlay.appendChild(label);
      return { seg, el:label };
    });

    const resize = ()=>{
      view.width = mapArea.clientWidth || 760;
      view.height = mapArea.clientHeight || 420;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(view.width * dpr);
      canvas.height = Math.round(view.height * dpr);
      canvas.style.width = `${view.width}px`;
      canvas.style.height = `${view.height}px`;
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
      if(!segments.length) return;
      ctx.save();
      ctx.strokeStyle = "rgba(56,189,248,0.85)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      segments.forEach(seg=>{
        const path = Array.isArray(seg.path) && seg.path.length >= 2 ? seg.path : [seg.from, seg.to];
        path.forEach((point, idx)=>{
          const proj = projectPoint(point.lat, point.lng, view);
          if(idx===0){
            ctx.moveTo(proj.x, proj.y);
          }else{
            ctx.lineTo(proj.x, proj.y);
          }
        });
      });
      ctx.stroke();
      ctx.restore();
    };

    const drawPoints = ()=>{
      ctx.save();
      ctx.fillStyle="rgba(226,232,240,0.9)";
      locations.forEach(loc=>{
        const p = projectPoint(loc.lat, loc.lng, view);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.restore();
    };

    const segmentMidpoint = (seg)=>{
      const path = Array.isArray(seg.path) && seg.path.length >= 2 ? seg.path : [seg.from, seg.to];
      if(path.length < 2){
        const only = path[0] || seg.from || seg.to || { lat:0, lng:0 };
        return { lat: only.lat || 0, lng: only.lng || 0 };
      }
      let total = 0;
      const distances = [];
      for(let i=0; i<path.length-1; i++){
        const d = haversineKm(path[i], path[i+1]);
        distances.push(d);
        total += d;
      }
      if(total === 0){
        const first = path[0];
        return { lat:first.lat, lng:first.lng };
      }
      const half = total / 2;
      let acc = 0;
      for(let i=0; i<distances.length; i++){
        const segLen = distances[i];
        if(acc + segLen >= half){
          const start = path[i];
          const end = path[i+1];
          const t = segLen ? (half - acc) / segLen : 0;
          return {
            lat: start.lat + (end.lat - start.lat) * t,
            lng: start.lng + (end.lng - start.lng) * t
          };
        }
        acc += segLen;
      }
      const last = path[path.length-1];
      return { lat:last.lat, lng:last.lng };
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
      segmentLabels.forEach(item=>{
        const seg = item.seg;
        const mid = segmentMidpoint(seg);
        const pos = projectPoint(mid.lat, mid.lng, view);
        const text = `${formatDistance(seg.distanceKm)}\nVehículo: ${formatDuration(seg.durationDriveMin)}\nCaminando: ${formatDuration(seg.durationWalkMin)}`;
        item.el.textContent = text;
        if(pos.x < -120 || pos.x > view.width+120 || pos.y < -120 || pos.y > view.height+120){
          item.el.style.display="none";
        }else{
          item.el.style.display="";
          item.el.style.left = `${pos.x}px`;
          item.el.style.top = `${pos.y}px`;
        }
      });
    };

    const render = ()=>{
      drawTiles();
      drawRoutes();
      drawPoints();
      updateOverlay();
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
      window.removeEventListener("resize", onResize);
      mapArea.classList.remove("panning");
    };
    container._cleanup = cleanup;

    resize();

    return { refresh: render };
  };

  const buildDistancePanel = (segments, mapController)=>{
    const wrapper = el("div","loc-distance-panel");
    const controls = el("div","loc-distance-controls");
    const keyInput = el("input","input loc-distance-key");
    keyInput.type = "text";
    keyInput.placeholder = "API key de Google Maps";
    keyInput.value = loadGoogleApiKey();
    const saveBtn = el("button","btn small","Guardar API key");
    const refreshBtn = el("button","btn small","Actualizar con Google Maps");
    const status = el("div","mini","Las distancias se calculan automáticamente con estimaciones básicas.");

    controls.appendChild(keyInput);
    controls.appendChild(saveBtn);
    controls.appendChild(refreshBtn);

    const tableHolder = el("div","loc-distance-table-holder");

    const renderTable = ()=>{
      tableHolder.innerHTML="";
      if(!segments.length){
        tableHolder.appendChild(el("div","mini","Añade al menos dos localizaciones para calcular distancias."));
        return;
      }
      const tbl = el("table","loc-distance-table");
      const thead = el("thead");
      const thr = el("tr");
      ["Desde","Hasta","Distancia","En vehículo","Caminando","Fuente"].forEach(label=>{
        thr.appendChild(el("th",null,label));
      });
      thead.appendChild(thr);
      tbl.appendChild(thead);
      const tbody = el("tbody");
      segments.forEach(seg=>{
        const tr = el("tr");
        tr.appendChild(el("td",null,seg.from.nombre || seg.from.id || "-"));
        tr.appendChild(el("td",null,seg.to.nombre || seg.to.id || "-"));
        tr.appendChild(el("td",null,formatDistance(seg.distanceKm)));
        tr.appendChild(el("td",null,formatDuration(seg.durationDriveMin)));
        tr.appendChild(el("td",null,formatDuration(seg.durationWalkMin)));
        let providerLabel = "Estimación";
        if(seg.provider === "google") providerLabel = "Google Maps";
        else if(seg.provider === "osrm") providerLabel = "OpenStreetMap";
        tr.appendChild(el("td",null, providerLabel ));
        if(seg.providerNote){
          tr.title = seg.providerNote;
        }
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      tableHolder.appendChild(tbl);
    };

    renderTable();

    const api = {
      element: wrapper,
      refresh: ()=>{ renderTable(); },
      setStatus: (text)=>{ status.textContent = text; }
    };

    saveBtn.onclick=()=>{
      const key = keyInput.value || "";
      const saved = persistGoogleApiKey(key);
      api.setStatus(saved ? "API key guardada en el proyecto actual." : "API key eliminada.");
    };

    refreshBtn.onclick=async()=>{
      const key = (keyInput.value || "").trim();
      if(!key){
        api.setStatus("Introduce una API key de Google Maps para actualizar las distancias.");
        keyInput.focus();
        return;
      }
      if(!segments.length){
        api.setStatus("Añade al menos dos localizaciones antes de consultar Google Maps.");
        return;
      }
      persistGoogleApiKey(key);
      refreshBtn.disabled = true;
      saveBtn.disabled = true;
      api.setStatus("Consultando Google Maps...");
      try{
        const { updated, warnings } = await updateSegmentsWithGoogle(segments, key);
        if(updated){
          api.setStatus(warnings.length
            ? `Distancias actualizadas. Algunas advertencias: ${warnings[0]}`
            : "Distancias actualizadas con Google Maps.");
        }else{
          api.setStatus(warnings[0] || "No se pudieron actualizar las distancias con Google Maps.");
        }
      }catch(err){
        api.setStatus(err.message || "No se pudieron obtener distancias de Google Maps.");
      }finally{
        refreshBtn.disabled = false;
        saveBtn.disabled = false;
        segments.forEach(updateSegmentEstimates);
        api.refresh();
        if(mapController && typeof mapController.refresh === "function") mapController.refresh();
      }
    };

    wrapper.appendChild(controls);
    wrapper.appendChild(tableHolder);
    wrapper.appendChild(status);
    return api;
  };
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

    const validLocations = (state.locations||[])
      .map(l=>{
        const lat = toNumber(l.lat);
        const lng = toNumber(l.lng);
        if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { ...l, lat, lng };
      })
      .filter(Boolean);

    const infoSection = el("div","loc-map-section");
    infoSection.appendChild(el("h4",null,"Mapa y distancias"));

    const invalidCount = (state.locations?.length || 0) - validLocations.length;
    if(invalidCount>0){
      infoSection.appendChild(el("div","mini warn-text",`${invalidCount} localización${invalidCount===1?"":"es"} no tienen coordenadas válidas.`));
    }

    const mapContainer = el("div","loc-map-container");
    infoSection.appendChild(mapContainer);

    const segments = buildSegments(validLocations);
    segments.forEach(updateSegmentEstimates);
    const mapController = setupCatalogMap(mapContainer, validLocations, segments);
    const distancePanel = buildDistancePanel(segments, mapController);
    infoSection.appendChild(distancePanel.element);
    if(segments.length){
      distancePanel.setStatus("Calculando rutas con OpenStreetMap...");
      updateSegmentsWithOsrm(segments, {
        onSegmentUpdated: ()=>{
          distancePanel.refresh();
          if(mapController && typeof mapController.refresh === "function") mapController.refresh();
        },
        onComplete: ({ updated, warnings })=>{
          if(updated){
            distancePanel.setStatus(warnings.length
              ? `Distancias calculadas con OpenStreetMap. Advertencia: ${warnings[0]}`
              : "Distancias calculadas con OpenStreetMap.");
          }else{
            distancePanel.setStatus(warnings[0] || "No se pudieron calcular rutas con OpenStreetMap.");
          }
        }
      }).catch(err=>{
        distancePanel.setStatus(err?.message ? `Error calculando rutas: ${err.message}` : "Error calculando rutas con OpenStreetMap.");
      });
    }

    cont.appendChild(infoSection);
  };

  window.openCatTask = (cont)=>{
    cont.innerHTML=""; cont.appendChild(el("h3",null,"Catálogo: Tareas"));
    // Lista
    const tbl=el("table"); const tb=el("tbody"); tbl.appendChild(tb);
    // Orden: bloqueados primero
    const order=id=>({[TASK_TRANSP]:0,[TASK_MONTAGE]:1,[TASK_DESMONT]:2}[id]??9);
    const hiddenBaseTasks=new Set([TASK_TRANSP,TASK_MONTAGE,TASK_DESMONT]);
    [...state.taskTypes]
      .filter(t=>!(t.locked && hiddenBaseTasks.has(t.id)))
      .sort((a,b)=> (a.locked===b.locked? order(a.id)-order(b.id) : (a.locked?-1:1)) || (a.nombre||"").localeCompare(b.nombre||"") )
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

  window.openCatSchedule = (cont)=>{
    cont.innerHTML="";
    cont.appendChild(el("h3",null,"Catálogo: Horarios"));
    const mount=el("div","schedule-catalog");
    cont.appendChild(mount);
    if(typeof window.setScheduleCatalogTarget === "function"){
      window.setScheduleCatalogTarget(mount);
    }else{
      mount.appendChild(el("div","mini","La herramienta de horarios no está disponible."));
    }
  };
})();

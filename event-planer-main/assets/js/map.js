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

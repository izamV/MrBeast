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

const $=s=>document.querySelector(s);
let token=localStorage.getItem("token");
let user=JSON.parse(localStorage.getItem("user")||"null");

async function api(url,opt={}){
  opt.headers={...(opt.headers||{}),"Content-Type":"application/json"};
  if(token) opt.headers.Authorization=`Bearer ${token}`;
  const r=await fetch(url,opt);
  const data=await r.json().catch(()=>({}));
  if(r.status===401){logout();throw new Error("Sessão expirada");}
  if(!r.ok) throw new Error(data.erro||"Erro na operação");
  return data;
}
async function boot(){
  if(token){showApp();return loadDashboard();}
  const s=await api("/api/setup/status");
  $("#auth").classList.remove("hidden");
  if(s.precisa_configurar){$("#setupForm").classList.remove("hidden");$("#authSubtitle").textContent="Crie o primeiro administrador";}
  else $("#loginForm").classList.remove("hidden");
}
$("#setupForm").onsubmit=async e=>{
  e.preventDefault(); try{
    await api("/api/setup/admin",{method:"POST",body:JSON.stringify({nome:$("#setupNome").value,email:$("#setupEmail").value,senha:$("#setupSenha").value})});
    $("#setupForm").classList.add("hidden");$("#loginForm").classList.remove("hidden");$("#loginEmail").value=$("#setupEmail").value;$("#authMsg").textContent="Administrador criado. Faça login.";
  }catch(x){$("#authMsg").textContent=x.message}
};
$("#loginForm").onsubmit=async e=>{
  e.preventDefault(); try{
    const r=await api("/api/login",{method:"POST",body:JSON.stringify({email:$("#loginEmail").value,senha:$("#loginSenha").value})});
    token=r.token;user=r.usuario;localStorage.setItem("token",token);localStorage.setItem("user",JSON.stringify(user));showApp();loadDashboard();
  }catch(x){$("#authMsg").textContent=x.message}
};
function showApp(){$("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#userBox").textContent=`Olá, ${user?.nome||"Gestor"} • ${user?.perfil||""}`;}
function logout(){localStorage.clear();location.reload()} $("#logout").onclick=logout;
$("#nav").onclick=e=>{
  const b=e.target.closest("[data-page]");if(!b)return;
  document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  if(b.dataset.page==="dashboard") loadDashboard();
  else if(b.dataset.page==="pneus") loadPneus();
  else loadList(b.dataset.page,b.textContent.trim());
};

async function loadDashboard(){
  $("#pageTitle").textContent="Dashboard";
  const [d,alertas]=await Promise.all([api("/api/dashboard"),api("/api/pneus-alertas")]);
  const f=d.frota, ex=d.expedicoes, p=d.pneus;
  const alertaHtml=alertas.length?`
    <section class="panel" style="margin-top:16px;border:2px solid #f59e0b">
      <h3>⚠️ ALERTA DE PNEUS — ATENÇÃO NECESSÁRIA</h3>
      <p>Veículos abaixo possuem pneus para recapagem ou troca imediata.</p>
      <div style="display:grid;gap:10px">
        ${alertas.map(a=>`<div style="padding:12px;border-radius:10px;background:${Number(a.criticos)>0?"#fee2e2":"#fff7ed"}">
          <b>🚚 Veículo ${fmt(a.prefixo)}</b> ${a.placa?`• ${fmt(a.placa)}`:""}
          <div>${Number(a.criticos)>0?`🔴 <b>${a.criticos} crítico(s) — TROCA IMEDIATA</b>`:""}
          ${Number(a.recapagem)>0?` 🟠 <b>${a.recapagem} para recapagem</b>`:""}</div>
        </div>`).join("")}
      </div>
    </section>`:`<section class="panel" style="margin-top:16px"><h3>✅ Pneus sem alertas críticos</h3></section>`;
  $("#content").innerHTML=`<div class="cards">
   ${card("Total de Veículos",f.total,"🚚")}${card("Disponíveis",f.disponiveis,"✓")}${card("Em Manutenção",f.manutencao,"🛠")}${card("Em Rota",f.em_rota,"➜")}${card("Ocorrências Abertas",d.ocorrencias.abertas,"⚠")}
  </div><div class="grid2"><section class="panel"><h3>Indicadores de Expedição</h3>
  ${metric("Entregues",ex.entregues,ex.total)}${metric("Pendentes",ex.pendentes,ex.total)}
  <p><b>${ex.total}</b> expedições cadastradas</p></section>
  <section class="panel"><h3>Pneus</h3><p>🟢 Bons: <b>${p.bons}</b></p><p>🟠 Recapagem: <b>${p.recapagem}</b></p><p>🔴 Críticos: <b>${p.criticos}</b></p><p>Total: <b>${p.total}</b></p></section></div>
  ${alertaHtml}`;
}
function card(t,n,i){return `<div class="card"><small>${i} ${t}</small><div class="num">${n||0}</div></div>`}
function metric(t,n,total){const pc=total?Math.round(n/total*100):0;return `<div><small>${t} — ${n||0} (${pc}%)</small><div class="bar"><i style="width:${pc}%"></i></div></div>`}

const labels={veiculos:"Frota",expedicoes:"Expedição",pneus:"Pneus",manutencoes:"Manutenção",checklists:"Checklist",abastecimentos:"Combustível",ocorrencias:"Ocorrências",colaboradores:"Equipe"};

async function loadPneus(){
  $("#pageTitle").textContent="Pneus";
  $("#content").innerHTML=`
    <section class="panel">
      <h3>🔎 Consultar pneus por veículo</h3>
      <form id="pneuSearch" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
        <div style="min-width:240px;flex:1">
          <label style="display:block;margin-bottom:6px">Prefixo do veículo</label>
          <input id="pneuPrefixo" placeholder="Ex.: 5043" required style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px">
        </div>
        <button class="primary">Pesquisar veículo</button>
        <button type="button" class="secondary" id="todosPneus">Ver todos</button>
      </form>
      <div id="pneuResultado" style="margin-top:16px"></div>
    </section>`;
  $("#pneuSearch").onsubmit=async e=>{e.preventDefault();await pesquisarPneus($("#pneuPrefixo").value)};
  $("#todosPneus").onclick=()=>listarTodosPneus();
}

async function pesquisarPneus(prefixo){
  const box=$("#pneuResultado");
  box.innerHTML="<p>Consultando...</p>";
  try{
    const d=await api(`/api/pneus/veiculo/${encodeURIComponent(prefixo.trim())}`);
    const v=d.veiculo,r=d.resumo;
    box.innerHTML=`
      <div class="cards">
        ${card("Total de Pneus",r.total,"◉")}
        ${card("Bons",r.bons,"🟢")}
        ${card("Atenção",r.atencao,"🟡")}
        ${card("Recapagem",r.recapagem,"🟠")}
        ${card("Troca imediata",r.criticos,"🔴")}
      </div>
      <section class="panel" style="margin-top:14px">
        <h3>🚚 Veículo ${fmt(v.prefixo)}</h3>
        <p><b>Placa:</b> ${fmt(v.placa)} &nbsp; <b>Tipo:</b> ${fmt(v.tipo)} &nbsp; <b>Modelo:</b> ${fmt(v.modelo)}</p>
        <p><b>Capacidade:</b> ${fmt(v.capacidade_kg)} kg &nbsp; <b>KM:</b> ${fmt(v.km_atual)} &nbsp; <b>Status:</b> ${fmt(v.status)}</p>
      </section>
      ${tabelaPneus(d.pneus)}`;
  }catch(e){box.innerHTML=`<div class="panel"><h3>Veículo não encontrado</h3><p>${fmt(e.message)}</p></div>`}
}

async function listarTodosPneus(){
  const rows=await api("/api/pneus");
  $("#pneuResultado").innerHTML=`<p><b>${rows.length}</b> pneus cadastrados</p>${tabelaPneus(rows)}`;
}

function tabelaPneus(rows){
  if(!rows.length)return `<div class="panel"><p>Nenhum pneu cadastrado para este veículo.</p></div>`;
  return `<div class="table-wrap" style="margin-top:14px"><table><thead><tr>
    <th>Código</th><th>Posição</th><th>Marca</th><th>Modelo</th><th>Sulco mm</th><th>Status</th><th>Ação</th>
  </tr></thead><tbody>${rows.map(p=>{
    const s=String(p.status||"Bom");
    const crit=/crít|crit/i.test(s), rec=/recap/i.test(s), ate=/aten/i.test(s);
    const acao=crit?"🔴 TROCA IMEDIATA":rec?"🟠 PROGRAMAR RECAPAGEM":ate?"🟡 MONITORAR":"🟢 OK";
    return `<tr style="${crit?"background:#fee2e2":rec?"background:#fff7ed":""}">
      <td>${fmt(p.codigo)}</td><td>${fmt(p.posicao)}</td><td>${fmt(p.marca)}</td><td>${fmt(p.modelo)}</td>
      <td><b>${fmt(p.sulco_mm)}</b></td><td>${fmt(p.status)}</td><td><b>${acao}</b></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

async function loadList(resource,title){
  $("#pageTitle").textContent=labels[resource]||title;
  const rows=await api(`/api/${resource}`);
  let action=resource==="veiculos"?`<button class="primary" onclick="vehicleModal()">+ Novo veículo</button>`:"<span>Estrutura V1 pronta para evolução</span>";
  let html=`<div class="toolbar"><div><b>${rows.length}</b> registros</div>${action}</div>`;
  if(!rows.length) html+=`<div class="panel"><h3>Nenhum registro ainda</h3><p>Este módulo já está conectado ao PostgreSQL.</p></div>`;
  else{
    const keys=Object.keys(rows[0]).filter(k=>!["senha_hash","itens"].includes(k)).slice(0,8);
    if(resource==="veiculos") keys.push("__acoes");
    html+=`<div class="table-wrap"><table><thead><tr>${keys.map(k=>`<th>${k==="__acoes"?"Ações":k.replaceAll("_"," ")}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>k==="__acoes"?`<td><button class="secondary" onclick='editVehicle(${JSON.stringify(r)})'>Editar</button> <button class="secondary" onclick="deleteVehicle(${r.id},'${String(r.prefixo).replaceAll("'","")}')">Excluir</button></td>`:`<td>${fmt(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  $("#content").innerHTML=html;
}
function fmt(v){if(v===null||v===undefined||v==="")return "-";if(typeof v==="boolean")return v?"Sim":"Não";return String(v).slice(0,80)}

function vehicleFormHtml(v={}){
  return `<div class="modal-grid">
<input name="prefixo" value="${v.prefixo||""}" placeholder="Prefixo (ex.: 5003)" required><input name="placa" value="${v.placa||""}" placeholder="Placa">
<select name="tipo" required>${["","Toco","Trucado","Carreta","3/4","Hyundai HR"].map(x=>`<option ${x===v.tipo?"selected":""}>${x||"Tipo"}</option>`).join("")}</select>
<input name="modelo" value="${v.modelo||""}" placeholder="Modelo"><input name="capacidade_kg" value="${v.capacidade_kg||0}" type="number" placeholder="Capacidade kg"><input name="km_atual" value="${v.km_atual||0}" type="number" placeholder="KM atual">
<select name="status">${["Disponível","Em rota","Manutenção","Inativo"].map(x=>`<option ${x===v.status?"selected":""}>${x}</option>`).join("")}</select><input name="observacao" value="${v.observacao||""}" placeholder="Observação">
</div>`;
}
window.vehicleModal=()=>{document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modal"><form class="modal" id="vehicleForm"><h3>Novo veículo</h3>${vehicleFormHtml()}<div class="actions"><button type="button" class="secondary" onclick="modal.remove()">Cancelar</button><button class="primary">Salvar veículo</button></div></form></div>`);
$("#vehicleForm").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api("/api/veiculos",{method:"POST",body:JSON.stringify(o)});$("#modal").remove();loadList("veiculos","Frota")}catch(x){alert(x.message)}}};

window.editVehicle=v=>{document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modal"><form class="modal" id="vehicleForm"><h3>Editar veículo ${fmt(v.prefixo)}</h3>${vehicleFormHtml(v)}<div class="actions"><button type="button" class="secondary" onclick="modal.remove()">Cancelar</button><button class="primary">Salvar alterações</button></div></form></div>`);
$("#vehicleForm").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api(`/api/veiculos/${v.id}`,{method:"PUT",body:JSON.stringify(o)});$("#modal").remove();loadList("veiculos","Frota")}catch(x){alert(x.message)}}};

window.deleteVehicle=async(id,prefixo)=>{if(!confirm(`Excluir o veículo ${prefixo}?`))return;try{await api(`/api/veiculos/${id}`,{method:"DELETE"});loadList("veiculos","Frota")}catch(x){alert(x.message)}};

boot().catch(e=>{$("#auth").classList.remove("hidden");$("#authMsg").textContent="Falha ao iniciar: "+e.message});

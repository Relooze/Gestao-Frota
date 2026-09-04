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
$("#nav").onclick=e=>{const b=e.target.closest("[data-page]");if(!b)return;document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));b.classList.add("active");b.dataset.page==="dashboard"?loadDashboard():loadList(b.dataset.page,b.textContent.trim())};

async function loadDashboard(){
  $("#pageTitle").textContent="Dashboard";
  const d=await api("/api/dashboard"), f=d.frota, ex=d.expedicoes, p=d.pneus;
  $("#content").innerHTML=`<div class="cards">
   ${card("Total de Veículos",f.total,"🚚")}${card("Disponíveis",f.disponiveis,"✓")}${card("Em Manutenção",f.manutencao,"🛠")}${card("Em Rota",f.em_rota,"➜")}${card("Ocorrências Abertas",d.ocorrencias.abertas,"⚠")}
  </div><div class="grid2"><section class="panel"><h3>Indicadores de Expedição</h3>
  ${metric("Entregues",ex.entregues,ex.total)}${metric("Pendentes",ex.pendentes,ex.total)}
  <p><b>${ex.total}</b> expedições cadastradas</p></section>
  <section class="panel"><h3>Pneus</h3><p>🟢 Bons: <b>${p.bons}</b></p><p>🟠 Recapagem: <b>${p.recapagem}</b></p><p>🔴 Críticos: <b>${p.criticos}</b></p><p>Total: <b>${p.total}</b></p></section></div>`;
}
function card(t,n,i){return `<div class="card"><small>${i} ${t}</small><div class="num">${n||0}</div></div>`}
function metric(t,n,total){const pc=total?Math.round(n/total*100):0;return `<div><small>${t} — ${n||0} (${pc}%)</small><div class="bar"><i style="width:${pc}%"></i></div></div>`}

const labels={veiculos:"Frota",expedicoes:"Expedição",pneus:"Pneus",manutencoes:"Manutenção",checklists:"Checklist",abastecimentos:"Combustível",ocorrencias:"Ocorrências",colaboradores:"Equipe"};
async function loadList(resource,title){
  $("#pageTitle").textContent=labels[resource]||title;
  const rows=await api(`/api/${resource}`);
  let action=resource==="veiculos"?`<button class="primary" onclick="vehicleModal()">+ Novo veículo</button>`:"<span>Estrutura V1 pronta para evolução</span>";
  let html=`<div class="toolbar"><div><b>${rows.length}</b> registros</div>${action}</div>`;
  if(!rows.length) html+=`<div class="panel"><h3>Nenhum registro ainda</h3><p>Este módulo já está conectado ao PostgreSQL.</p></div>`;
  else{
    const keys=Object.keys(rows[0]).filter(k=>!["senha_hash","itens"].includes(k)).slice(0,8);
    html+=`<div class="table-wrap"><table><thead><tr>${keys.map(k=>`<th>${k.replaceAll("_"," ")}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${fmt(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  $("#content").innerHTML=html;
}
function fmt(v){if(v===null||v===undefined)return "-";if(typeof v==="boolean")return v?"Sim":"Não";return String(v).slice(0,80)}
window.vehicleModal=()=>{document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modal"><form class="modal" id="vehicleForm"><h3>Novo veículo</h3><div class="modal-grid">
<input name="prefixo" placeholder="Prefixo (ex.: 5003)" required><input name="placa" placeholder="Placa">
<select name="tipo" required><option value="">Tipo</option><option>Toco</option><option>Trucado</option><option>Carreta</option><option>3/4</option><option>Hyundai HR</option></select>
<input name="modelo" placeholder="Modelo"><input name="capacidade_kg" type="number" placeholder="Capacidade kg"><input name="km_atual" type="number" placeholder="KM atual">
<select name="status"><option>Disponível</option><option>Em rota</option><option>Manutenção</option><option>Inativo</option></select><input name="observacao" placeholder="Observação">
</div><div class="actions"><button type="button" class="secondary" onclick="modal.remove()">Cancelar</button><button class="primary">Salvar veículo</button></div></form></div>`);
$("#vehicleForm").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api("/api/veiculos",{method:"POST",body:JSON.stringify(o)});$("#modal").remove();loadList("veiculos","Frota")}catch(x){alert(x.message)}}};
boot().catch(e=>{$("#auth").classList.remove("hidden");$("#authMsg").textContent="Falha ao iniciar: "+e.message});
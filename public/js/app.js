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
      ${tabelaPneus(d.pneus)}
      <div id="demandasOS" style="margin-top:16px"></div>`;
    await carregarDemandasOS(v.prefixo);
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
    const c=String(p.classificacao||"");
    const crit=/crít|crit/i.test(s+" "+c), rec=/recap/i.test(s+" "+c), ate=/aten/i.test(s+" "+c);
    const acao=crit?"🔴 TROCA IMEDIATA":rec?"🟠 PROGRAMAR RECAPAGEM":ate?"🟡 MONITORAR":"🟢 OK";
    const dados=encodeURIComponent(JSON.stringify(p));
    return `<tr onclick="abrirPneu('${dados}')" style="cursor:pointer;${crit?"background:#fee2e2":rec?"background:#fff7ed":""}" title="Clique para visualizar localização e editar">
      <td><b>${fmt(p.codigo)}</b></td><td>${fmt(p.posicao)}</td><td>${fmt(p.marca)}</td><td>${fmt(p.modelo)}</td>
      <td><b>${fmt(p.sulco_mm)}</b></td><td>${fmt(p.status)}</td><td><b>${acao}</b></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

window.abrirPneu=function(dados){
  const p=JSON.parse(decodeURIComponent(dados));
  const posicao=String(p.posicao||"");
  document.body.insertAdjacentHTML("beforeend",`
  <div class="modal-bg" id="modalPneu">
    <div class="modal tire-modal">
      <div class="tire-modal-head">
        <div><h2>🛞 Pneu ${fmt(p.codigo)}</h2><small>${fmt(p.posicao)}</small></div>
        <button type="button" class="secondary" id="fecharModalPneu">✕</button>
      </div>
      <div class="tire-modal-grid">
        <section class="panel">
          <h3>🚚 Localização do pneu</h3>
          ${desenhoCaminhao(posicao)}
          <div class="tire-location"><b>Posição selecionada</b><br>${fmt(posicao)}</div>
        </section>
        <section class="panel">
          <h3>✏️ Editar informações do pneu</h3>
          <form id="formEditarPneu">
            <div class="modal-grid">
              <label>Código<input name="codigo" value="${escapeHtml(p.codigo||"")}" required></label>
              <label>Posição<select name="posicao">${opcoesPosicao(p.posicao)}</select></label>
              <label>Marca<input name="marca" value="${escapeHtml(p.marca||"")}"></label>
              <label>Modelo<input name="modelo" value="${escapeHtml(p.modelo||"")}"></label>
              <label>Sulco (mm)<input name="sulco_mm" type="number" step="0.01" min="0" value="${p.sulco_mm??""}"></label>
              <label>KM do pneu<input name="km_pneu" type="number" step="0.1" min="0" value="${p.km_pneu??0}"></label>
              <label>Nº de recapagens<input name="recapagens" type="number" min="0" value="${p.recapagens??0}"></label>
              <label>Custo (R$)<input name="custo" type="number" step="0.01" min="0" value="${p.custo??0}"></label>
              <label>Status automático<input id="pneuStatusAuto" value="${escapeHtml(p.status||"Bom")}" readonly></label>
              <label>Classificação automática<input id="pneuClassAuto" value="${escapeHtml(p.classificacao||"BOM")}" readonly></label>
            </div>
            <div id="alertaSulco" class="sulco-alert"></div>
            <label>Ação sugerida<input id="pneuAcaoAuto" value="${escapeHtml(p.acao_sugerida||"")}" readonly></label>
            <label>Última inspeção<input name="ultima_inspecao" type="date" value="${formatarDataInput(p.ultima_inspecao)}"></label>
            <label>Observação<textarea name="observacao" rows="4">${escapeHtml(p.observacao||"")}</textarea></label>
            <div class="actions">
              <button type="button" class="secondary" id="cancelarPneu">Cancelar</button>
              <button class="primary" type="submit">💾 Salvar alterações</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  </div>`);
  $("#fecharModalPneu").onclick=()=>$("#modalPneu").remove();
  $("#cancelarPneu").onclick=()=>$("#modalPneu").remove();
  const sulcoInput=$("#formEditarPneu [name='sulco_mm']");
  const atualizarIndicadorSulco=()=>{
    const n=Number(String(sulcoInput.value).replace(",","."));
    let st="Bom",cl="BOM",acao="Manter acompanhamento normal",icone="🟢";
    if(!Number.isNaN(n)){
      if(n<=0){st="Crítico";cl="CRÍTICO";acao="Parar e providenciar troca imediata";icone="🔴";}
      else if(n<5){st="Recapagem";cl="RECAPAGEM";acao="Programar retirada, conferência e orçamento";icone="🟠";}
      else if(n<7){st="Atenção";cl="ATENÇÃO";acao="Monitorar sulco e programar nova inspeção";icone="🟡";}
    }
    $("#pneuStatusAuto").value=st;$("#pneuClassAuto").value=cl;$("#pneuAcaoAuto").value=acao;
    $("#alertaSulco").innerHTML=`${icone} <b>${st}</b> — ${acao}`;
    $("#alertaSulco").className=`sulco-alert ${st.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}`;
  };
  sulcoInput.addEventListener("input",atualizarIndicadorSulco);
  atualizarIndicadorSulco();

  $("#formEditarPneu").onsubmit=async e=>{
    e.preventDefault();
    const o=Object.fromEntries(new FormData(e.target));
    try{
      await api(`/api/pneus/${p.id}`,{method:"PUT",body:JSON.stringify(o)});
      alert("Pneu atualizado com sucesso!");
      $("#modalPneu").remove();
      const prefixo=$("#pneuPrefixo")?.value;
      if(prefixo) await pesquisarPneus(prefixo); else await listarTodosPneus();
    }catch(x){alert(x.message)}
  };
};

function desenhoCaminhao(posicao){
  const txt=String(posicao||"").toLowerCase();
  const eixo=(txt.includes("3º")||txt.includes("3°"))?3:(txt.includes("2º")||txt.includes("2°"))?2:1;
  const esquerda=txt.includes("esq");
  const interna=txt.includes("int");
  const step=txt.includes("step")||txt.includes("estepe");
  if(step)return `<div class="spare-view"><div>🛞</div><h3>Estepe</h3><p>Pneu reserva do veículo</p></div>`;
  function pneu(e,lado,interno=false){
    const selecionado=eixo===e && esquerda===(lado==="E") && interna===interno;
    return `<div class="truck-tire ${selecionado?"selected":""}" title="${selecionado?escapeHtml(posicao):"Pneu"}"></div>`;
  }
  function conjunto(e,lado){
    return `<div class="tire-set">${e===1?pneu(e,lado,false):pneu(e,lado,true)+pneu(e,lado,false)}</div>`;
  }
  return `<div class="truck-map">
    <div class="truck-front-label">FRENTE</div>
    <div class="truck-cab">🚚</div>
    ${[1,2,3].map(e=>`<div class="axle-block"><div class="axle-label">${e}º EIXO</div><div class="axle-row">${conjunto(e,"E")}<div class="axle-line"></div>${conjunto(e,"D")}</div></div>`).join("")}
    <div class="truck-side-labels"><span>← ESQUERDO</span><span>DIREITO →</span></div>
    <div class="selected-note">🔴 <b>Pneu selecionado</b><br>${fmt(posicao)}</div>
  </div>`;
}

function opcoesPosicao(atual){
  const posicoes=[
    "1º Eixo Esq. Ext","1º Eixo Esq. Int","1º Eixo Dir. Int","1º Eixo Dir. Ext",
    "2º Eixo Esq. Ext","2º Eixo Esq. Int","2º Eixo Dir. Int","2º Eixo Dir. Ext",
    "3º Eixo Esq. Ext","3º Eixo Esq. Int","3º Eixo Dir. Int","3º Eixo Dir. Ext",
    "Step 1","Step 2"
  ];
  if(atual&&!posicoes.includes(atual))posicoes.unshift(atual);
  return posicoes.map(x=>`<option value="${escapeHtml(x)}" ${x===atual?"selected":""}>${escapeHtml(x)}</option>`).join("");
}
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function formatarDataInput(v){return v?String(v).slice(0,10):""}

async function carregarDemandasOS(prefixo){
  const box=$("#demandasOS"); if(!box)return;
  try{
    const [d,ordens]=await Promise.all([
      api(`/api/veiculos/${encodeURIComponent(prefixo)}/demandas`),
      api(`/api/ordens-servico/veiculo/${encodeURIComponent(prefixo)}`)
    ]);
    const itens=[
      ...d.pneus.map(x=>`🛞 ${fmt(x.codigo)} • ${fmt(x.posicao)} • ${fmt(x.sulco_mm)} mm • <b>${fmt(x.status)}</b>`),
      ...d.manutencoes.map(x=>`🛠 ${fmt(x.tipo)} • ${fmt(x.descricao)}`),
      ...d.ocorrencias.map(x=>`⚠ ${fmt(x.tipo)} • ${fmt(x.descricao)}`)
    ];
    box.innerHTML=`<section class="panel os-panel">
      <div class="os-head"><div><h3>📋 Demandas do veículo / Ordem de Serviço</h3>
      <p><b>${d.total}</b> demanda(s) aberta(s) para conferência e orçamento.</p></div>
      <button class="primary" id="gerarOS" ${d.total===0?"disabled":""}>+ Gerar Ordem de Serviço</button></div>
      ${itens.length?`<div class="demand-list">${itens.map(x=>`<div>${x}</div>`).join("")}</div>`:"<p>✅ Nenhuma demanda aberta para este veículo.</p>"}
      ${ordens.length?`<h4>Ordens já geradas</h4><div class="os-list">${ordens.map(o=>`
        <button type="button" class="os-row" data-os="${o.id}">
          <b>${fmt(o.numero)}</b><span>${fmt(o.status)}</span><span>R$ ${Number(o.valor_orcado||0).toFixed(2).replace(".",",")}</span>
        </button>`).join("")}</div>`:""}
    </section>`;
    const btn=$("#gerarOS");
    if(btn)btn.onclick=async()=>{
      if(!confirm(`Gerar uma Ordem de Serviço com as ${d.total} demandas abertas do veículo ${prefixo}?`))return;
      try{const r=await api(`/api/ordens-servico/veiculo/${encodeURIComponent(prefixo)}`,{method:"POST",body:"{}"});
        alert(`${r.numero} gerada com sucesso.`);await carregarDemandasOS(prefixo);await abrirOS(r.id);
      }catch(e){alert(e.message)}
    };
    box.querySelectorAll("[data-os]").forEach(b=>b.onclick=()=>abrirOS(b.dataset.os));
  }catch(e){box.innerHTML=`<section class="panel"><p>Não foi possível carregar as demandas: ${fmt(e.message)}</p></section>`}
}

async function abrirOS(id){
  try{
    const d=await api(`/api/ordens-servico/${id}`),o=d.ordem;
    document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modalOS"><div class="modal os-modal">
      <div class="tire-modal-head"><div><h2>📋 ${fmt(o.numero)}</h2><small>Veículo ${fmt(o.prefixo)} • ${fmt(o.placa)}</small></div>
      <button class="secondary" type="button" id="fecharOS">✕</button></div>
      <div class="os-statusbar"><b>Status:</b> ${fmt(o.status)} <b>Valor total:</b> R$ ${Number(o.valor_orcado||0).toFixed(2).replace(".",",")}</div>
      <p><b>Fluxo:</b> Conferência → Em orçamento → Aguardando aprovação → Aprovada → Em execução → Concluída</p>
      <div class="table-wrap"><table><thead><tr><th>Origem</th><th>Serviço / Demanda</th><th>Prioridade</th><th>Valor R$</th><th>Status</th></tr></thead>
      <tbody>${d.itens.map(i=>`<tr><td>${fmt(i.origem)}</td><td class="wrapcell">${fmt(i.descricao)}</td><td>${fmt(i.prioridade)}</td>
      <td><input class="os-value" data-item="${i.id}" type="number" min="0" step="0.01" value="${Number(i.valor_estimado||0)}"></td>
      <td><select class="os-item-status" data-item="${i.id}">${["Pendente","Em orçamento","Aprovado","Em execução","Concluído"].map(s=>`<option ${s===i.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>
      <form id="formOS" style="margin-top:16px">
        <div class="modal-grid">
          <label>Status da O.S.<select name="status">${["Conferência","Em orçamento","Aguardando aprovação","Aprovada","Em execução","Concluída"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></label>
          <label>Aprovado por<input name="aprovado_por" value="${escapeHtml(o.aprovado_por||"")}" placeholder="Nome do responsável pela aprovação"></label>
        </div>
        <label>Observação<textarea name="observacao" rows="3">${escapeHtml(o.observacao||"")}</textarea></label>
        <div class="actions"><button type="button" class="secondary" id="cancelOS">Fechar</button><button class="primary">💾 Atualizar O.S.</button></div>
      </form>
    </div></div>`);
    $("#fecharOS").onclick=$("#cancelOS").onclick=()=>$("#modalOS").remove();
    document.querySelectorAll(".os-value").forEach(x=>x.onchange=()=>salvarItemOS(x.dataset.item,{valor_estimado:x.value}));
    document.querySelectorAll(".os-item-status").forEach(x=>x.onchange=()=>salvarItemOS(x.dataset.item,{status:x.value}));
    $("#formOS").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));
      try{await api(`/api/ordens-servico/${id}`,{method:"PUT",body:JSON.stringify(body)});alert("Ordem de Serviço atualizada.");
        $("#modalOS").remove();const prefixo=$("#pneuPrefixo")?.value;if(prefixo)await pesquisarPneus(prefixo);
      }catch(x){alert(x.message)}};
  }catch(e){alert(e.message)}
}
async function salvarItemOS(id,body){try{await api(`/api/ordens-servico-itens/${id}`,{method:"PUT",body:JSON.stringify(body)});}catch(e){alert(e.message)}}


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

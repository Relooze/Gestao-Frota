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
  if(token){
    showApp();
    await checarPrimeiroAcesso();
    await aplicarMenuPorPerfil();
    if(String(user?.perfil||"").toLowerCase()==="motorista"){ return abrirSelecaoVeiculoDia(); }
    return loadDashboard();
  }
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
    token=r.token;user=r.usuario;localStorage.setItem("token",token);localStorage.setItem("user",JSON.stringify(user));showApp();
    await checarPrimeiroAcesso();
    await aplicarMenuPorPerfil();
    if(String(user?.perfil||"").toLowerCase()==="motorista"){ return abrirSelecaoVeiculoDia(); }
    loadDashboard();
  }catch(x){$("#authMsg").textContent=x.message}
};
function showApp(){$("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#userBox").textContent=`Olá, ${user?.nome||"Gestor"} • ${user?.perfil||""}`;}
function logout(){localStorage.clear();location.reload()} $("#logout").onclick=logout;
$("#nav").onclick=e=>{
  const b=e.target.closest("[data-page]");if(!b)return;
  document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  if(b.dataset.page==="dashboard") String(user?.perfil||"").toLowerCase()==="motorista"?loadDashboardMotorista():loadDashboard();
  else if(b.dataset.page==="pneus") loadPneus();
  else if(b.dataset.page==="ordens-servico") loadOrdensServico();
  else if(b.dataset.page==="manutencao-caminhoes") loadManutencaoCategoria("CAMINHAO");
  else if(b.dataset.page==="manutencao-empilhadeiras") loadManutencaoCategoria("EMPILHADEIRA");
  else if(b.dataset.page==="checklist-diario") loadChecklistDiario();
  else if(b.dataset.page==="checklist-tratamento") loadTratamentoChecklist();
  else if(b.dataset.page==="usuarios") loadUsuarios();
  else if(b.dataset.page==="abertura-chamado") loadAberturaChamado();
  else if(b.dataset.page==="minhas-os") loadMinhasOS();
  else if(b.dataset.page==="chamados-abertos") loadChamadosAbertos();
  else if(b.dataset.page==="perfil-motorista") loadPerfilMotorista();
  else loadList(b.dataset.page,b.textContent.trim());
};


async function loadDashboardMotorista(){
  $("#pageTitle").textContent="Meu Veículo Hoje";
  try{
    const d=await api("/api/motorista/dashboard");
    const v=d.veiculo,p=d.pneus;
    const alertas=[];
    if(Number(p.criticos)>0) alertas.push(`<div class="driver-alert critical">🔴 <b>${p.criticos} pneu(s) CRÍTICO(S)</b><br>Necessária avaliação/troca imediata.</div>`);
    if(Number(p.recapagem)>0) alertas.push(`<div class="driver-alert recap">🟠 <b>${p.recapagem} pneu(s) para RECAPAGEM</b><br>Informar ao supervisor e acompanhar programação.</div>`);
    if(Number(p.atencao)>0) alertas.push(`<div class="driver-alert attention">🟡 <b>${p.atencao} pneu(s) em ATENÇÃO</b><br>Acompanhar condição durante a operação.</div>`);
    if(Number(d.os_abertas)>0) alertas.push(`<div class="driver-alert os">🔧 <b>${d.os_abertas} O.S. em aberto</b> para este veículo.</div>`);
    if(Number(d.chamados_abertos)>0) alertas.push(`<div class="driver-alert os">🆘 <b>${d.chamados_abertos} chamado(s) em aberto</b>.</div>`);
    if(!d.checklist) alertas.unshift(`<div class="driver-alert critical">☑ <b>CHECKLIST DIÁRIO PENDENTE</b><br>Realize o checklist antes de sair com o veículo.</div>`);

    $("#content").innerHTML=`<section class="panel driver-vehicle">
      <div><small>VEÍCULO SELECIONADO PARA HOJE</small><h2>🚚 ${escapeHtml(v.prefixo)}</h2>
      <p><b>Placa:</b> ${escapeHtml(v.placa||"-")} &nbsp; <b>Modelo:</b> ${escapeHtml(v.modelo||"-")} &nbsp; <b>Tipo:</b> ${escapeHtml(v.tipo||"-")}</p></div>
      <div><span class="driver-status">${escapeHtml(v.status||"-")}</span></div>
    </section>
    <div class="cards driver-cards">
      ${card("Pneus bons",p.bons,"🟢")}${card("Atenção",p.atencao,"🟡")}${card("Recapagem",p.recapagem,"🟠")}${card("Críticos",p.criticos,"🔴")}
      ${card("O.S. abertas",d.os_abertas,"🔧")}${card("Chamados",d.chamados_abertos,"🆘")}
    </div>
    <section class="panel" style="margin-top:16px"><h3>⚠️ Alertas do veículo de hoje</h3>
      <div class="driver-alerts">${alertas.join("")||'<div class="driver-alert ok">✅ Nenhum alerta operacional para o veículo.</div>'}</div>
    </section>
    <section class="panel driver-actions" style="margin-top:16px"><h3>Ações do motorista</h3>
      <button class="primary" data-driver-go="checklist-diario">☑ Fazer Checklist Diário</button>
      <button class="secondary" data-driver-go="abertura-chamado">🆘 Abrir Chamado</button>
      <button class="secondary" data-driver-go="minhas-os">🔧 Ver O.S. em andamento</button>
    </section>`;
    document.querySelectorAll("[data-driver-go]").forEach(b=>b.onclick=()=>{
      document.querySelector(`[data-page="${b.dataset.driverGo}"]`)?.click();
    });
  }catch(e){
    if(e.message==="SELECIONAR_VEICULO_DIA") return abrirSelecaoVeiculoDia();
    $("#content").innerHTML=`<section class="panel"><h3>Dashboard do motorista</h3><p>${escapeHtml(e.message)}</p></section>`;
  }
}

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

async function loadOrdensServico(){
  $("#pageTitle").textContent="Ordens de Serviço";
  $("#content").innerHTML=`<section class="panel"><h3>📋 Acompanhamento de Ordens de Serviço</h3><p>Carregando...</p></section>`;
  try{
    const rows=await api("/api/ordens-servico");
    const abertas=rows.filter(o=>!/^conclu[ií]da$/i.test(String(o.status||"")));
    const concluidas=rows.filter(o=>/^conclu[ií]da$/i.test(String(o.status||"")));
    const aguardando=rows.filter(o=>/aguardando aprova/i.test(String(o.status||"")));
    const execucao=rows.filter(o=>/execu/i.test(String(o.status||"")));
    $("#content").innerHTML=`
      <div class="cards os-summary">
        ${card("O.S. em aberto",abertas.length,"📋")}
        ${card("Aguardando aprovação",aguardando.length,"⏳")}
        ${card("Em execução",execucao.length,"🛠")}
        ${card("Concluídas",concluidas.length,"✅")}
      </div>
      <section class="panel" style="margin-top:16px">
        <div class="os-head"><div><h3>Ordens em acompanhamento</h3><p>Consulte, atualize ou imprima uma O.S.</p></div>
        <select id="filtroOS" style="max-width:240px"><option value="abertas">Em aberto</option><option value="todas">Todas</option><option value="concluidas">Concluídas</option></select></div>
        <div id="listaOS"></div>
      </section>`;
    const render=()=>{
      const f=$("#filtroOS").value;
      const lista=f==="todas"?rows:f==="concluidas"?concluidas:abertas;
      $("#listaOS").innerHTML=lista.length?`<div class="table-wrap"><table><thead><tr>
        <th>O.S.</th><th>Veículo</th><th>Placa</th><th>Abertura</th><th>Status</th><th>Pendências</th><th>Valor</th><th>Ações</th>
      </tr></thead><tbody>${lista.map(o=>`<tr>
        <td><b>${fmt(o.numero)}</b></td><td>${fmt(o.prefixo)}</td><td>${fmt(o.placa)}</td>
        <td>${formatarDataBR(o.data_abertura)}</td><td><span class="os-badge">${fmt(o.status)}</span></td>
        <td>${Number(o.itens_pendentes||0)} / ${Number(o.total_itens||0)}</td>
        <td>R$ ${Number(o.valor_orcado||0).toFixed(2).replace(".",",")}</td>
        <td><button class="secondary" data-open-os="${o.id}">Abrir</button> <button class="secondary" data-print-os="${o.id}">🖨 Imprimir</button></td>
      </tr>`).join("")}</tbody></table></div>`:`<p>Não há Ordens de Serviço nesta situação.</p>`;
      $("#listaOS").querySelectorAll("[data-open-os]").forEach(b=>b.onclick=()=>abrirOS(b.dataset.openOs));
      $("#listaOS").querySelectorAll("[data-print-os]").forEach(b=>b.onclick=()=>imprimirOS(b.dataset.printOs));
    };
    $("#filtroOS").onchange=render; render();
  }catch(e){$("#content").innerHTML=`<section class="panel"><h3>Ordens de Serviço</h3><p>${fmt(e.message)}</p></section>`}
}
function formatarDataBR(v){
  if(!v)return "-";const s=String(v).slice(0,10).split("-");return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:fmt(v);
}


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
        <div class="actions"><button type="button" class="secondary" id="imprimirOSAtual">🖨 Imprimir O.S.</button><button type="button" class="secondary" id="cancelOS">Fechar</button><button class="primary">💾 Atualizar O.S.</button></div>
      </form>
    </div></div>`);
    $("#fecharOS").onclick=$("#cancelOS").onclick=()=>$("#modalOS").remove();
    $("#imprimirOSAtual").onclick=()=>imprimirOS(id);
    document.querySelectorAll(".os-value").forEach(x=>x.onchange=()=>salvarItemOS(x.dataset.item,{valor_estimado:x.value}));
    document.querySelectorAll(".os-item-status").forEach(x=>x.onchange=()=>salvarItemOS(x.dataset.item,{status:x.value}));
    $("#formOS").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));
      try{await api(`/api/ordens-servico/${id}`,{method:"PUT",body:JSON.stringify(body)});alert("Ordem de Serviço atualizada.");
        $("#modalOS").remove();const prefixo=$("#pneuPrefixo")?.value;if(prefixo)await pesquisarPneus(prefixo);
      }catch(x){alert(x.message)}};
  }catch(e){alert(e.message)}
}

async function imprimirOS(id){
  try{
    const d=await api(`/api/ordens-servico/${id}`),o=d.ordem;
    const total=d.itens.reduce((s,i)=>s+Number(i.valor_estimado||0),0);
    const w=window.open("","_blank","width=1000,height=800");
    if(!w){alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");return;}
    const doc=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(o.numero)}</title>
    <style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:11px;margin:0}
      .head{display:flex;justify-content:space-between;border-bottom:3px solid #0b2545;padding-bottom:10px;margin-bottom:12px}
      h1{font-size:21px;margin:0;color:#0b2545}h2{font-size:14px;margin:14px 0 7px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0}
      .box{border:1px solid #aaa;padding:7px;min-height:43px}.label{font-size:9px;color:#555;text-transform:uppercase}.value{font-weight:bold;margin-top:3px}
      table{width:100%;border-collapse:collapse;margin-top:7px}th,td{border:1px solid #aaa;padding:6px;text-align:left;vertical-align:top}th{background:#eaf1f8;font-size:9px;text-transform:uppercase}
      .total{text-align:right;font-size:14px;font-weight:bold;margin-top:10px}.obs{border:1px solid #aaa;min-height:55px;padding:7px}
      .sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:25px;margin-top:45px;text-align:center}.line{border-top:1px solid #222;padding-top:5px}
      .check{font-size:15px}.footer{margin-top:18px;font-size:9px;color:#555;text-align:center}.no-print{margin:10px 0}
      @media print{.no-print{display:none}}
    </style></head><body>
      <div class="no-print"><button onclick="window.print()">🖨 Imprimir</button></div>
      <div class="head"><div><h1>ORDEM DE SERVIÇO</h1><b>FROTA & EXPEDIÇÃO</b></div><div style="text-align:right"><h1>${escapeHtml(o.numero)}</h1><div>Emissão: ${new Date().toLocaleDateString("pt-BR")}</div></div></div>
      <div class="meta">
        <div class="box"><div class="label">Veículo</div><div class="value">${escapeHtml(o.prefixo)}</div></div>
        <div class="box"><div class="label">Placa</div><div class="value">${escapeHtml(o.placa||"-")}</div></div>
        <div class="box"><div class="label">Tipo / Modelo</div><div class="value">${escapeHtml((o.tipo||"-")+" / "+(o.modelo||"-"))}</div></div>
        <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(o.status)}</div></div>
      </div>
      <h2>ITENS PARA CONFERÊNCIA / ORÇAMENTO</h2>
      <table><thead><tr><th style="width:25px">OK</th><th>Origem</th><th>Serviço / Demanda</th><th>Prioridade</th><th>Valor orçado</th><th>Situação</th></tr></thead>
      <tbody>${d.itens.map(i=>`<tr><td class="check">☐</td><td>${escapeHtml(i.origem)}</td><td>${escapeHtml(i.descricao)}</td><td>${escapeHtml(i.prioridade)}</td><td>R$ ${Number(i.valor_estimado||0).toFixed(2).replace(".",",")}</td><td>${escapeHtml(i.status)}</td></tr>`).join("")}</tbody></table>
      <div class="total">VALOR TOTAL ORÇADO: R$ ${total.toFixed(2).replace(".",",")}</div>
      <h2>OBSERVAÇÕES</h2><div class="obs">${escapeHtml(o.observacao||"")}</div>
      <h2>APROVAÇÃO / EXECUÇÃO</h2>
      <div class="meta">
        <div class="box"><div class="label">Aprovado por</div><div class="value">${escapeHtml(o.aprovado_por||"")}</div></div>
        <div class="box"><div class="label">Data aprovação</div><div class="value">${formatarDataBR(o.data_aprovacao)}</div></div>
        <div class="box"><div class="label">Data conclusão</div><div class="value">${formatarDataBR(o.data_conclusao)}</div></div>
        <div class="box"><div class="label">Situação final</div><div class="value">${escapeHtml(o.status)}</div></div>
      </div>
      <div class="sign"><div class="line">Responsável pela conferência</div><div class="line">Responsável pela aprovação</div><div class="line">Responsável pela execução</div></div>
      <div class="footer">Documento gerado pelo sistema Gestão de Frota & Expedição • ${escapeHtml(o.numero)}</div>
      <script>setTimeout(()=>window.print(),350)<\/script>
    </body></html>`;
    w.document.open();w.document.write(doc);w.document.close();
  }catch(e){alert(e.message)}
}

async function salvarItemOS(id,body){try{await api(`/api/ordens-servico-itens/${id}`,{method:"PUT",body:JSON.stringify(body)});}catch(e){alert(e.message)}}


async function loadManutencaoCategoria(categoria="CAMINHAO"){
  $("#pageTitle").textContent=categoria==="EMPILHADEIRA"?"Manutenção de Empilhadeiras":"Manutenção de Caminhões";
  $("#content").innerHTML=`<section class="panel"><h3>🛠 Gestão de manutenção por veículo</h3><p>Carregando histórico...</p></section>`;
  try{
    const vs=await api(`/api/manutencao/ativos/${categoria}`);
    window.__manutVeiculos=vs; window.__manutCategoria=categoria;
    $("#content").innerHTML=`
      <section class="panel manut-top">
        <div class="os-head"><div><h3>🚚 Veículos</h3><p>Clique no veículo para abrir o histórico individual.</p></div>
        <button class="primary" id="novaManut">+ Registrar manutenção</button></div>
        <div class="vehicle-chips"><button type="button" class="vehicle-chip active" data-prefixo="">TODOS</button>${vs.map(v=>`<button type="button" class="vehicle-chip" data-prefixo="${escapeHtml(String(v.prefixo))}">${escapeHtml(String(v.prefixo))}<small>${v.registros} registros</small></button>`).join("")}</div>
      </section>
      <section class="panel manut-filtros">
        <div class="filter-grid"><label>Data inicial<input id="manInicio" type="date"></label><label>Data final<input id="manFim" type="date"></label>
        <label>Empresa<input id="manEmpresa" placeholder="Filtrar empresa"></label><label>Serviço / sistema<input id="manServico" placeholder="Ex.: Motor, Elétrico"></label>
        <button class="primary" id="aplicarMan">Aplicar filtros</button><button class="secondary" id="limparMan">Limpar</button></div>
      </section>
      <div id="manDashboard"></div>`;
    window.__manutPrefixo="";
    document.querySelectorAll(".vehicle-chip").forEach(b=>b.addEventListener("click",async()=>{document.querySelectorAll(".vehicle-chip").forEach(x=>x.classList.remove("active"));b.classList.add("active");window.__manutPrefixo=String(b.getAttribute("data-prefixo")||"").trim();await carregarPainelManutencao();}));
    $("#aplicarMan").onclick=carregarPainelManutencao;
    $("#limparMan").onclick=()=>{$("#manInicio").value="";$("#manFim").value="";$("#manEmpresa").value="";$("#manServico").value="";carregarPainelManutencao()};
    $("#novaManut").onclick=modalNovaManutencao;
    await carregarPainelManutencao();
  }catch(e){$("#content").innerHTML=`<section class="panel"><h3>Manutenção</h3><p>${fmt(e.message)}</p></section>`}
}
async function carregarPainelManutencao(){
  const q=new URLSearchParams();
  if($("#manInicio")?.value)q.set("inicio",$("#manInicio").value);
  if($("#manFim")?.value)q.set("fim",$("#manFim").value);

  // Busca o histórico do período e aplica o veículo também no navegador.
  // Assim o botão funciona mesmo se houver registros antigos sem veiculo_id.
  const d=await api(`/api/manutencao/dashboard?${q.toString()}`);
  const prefixo=String(window.__manutPrefixo||"").trim();
  const emp=($("#manEmpresa")?.value||"").trim().toLowerCase();
  const srv=($("#manServico")?.value||"").trim().toLowerCase();

  let hist=(d.historico||[]).filter(x=>{
    const xp=String(x.prefixo||x.veiculo_prefixo||"").trim();
    const okVeiculo=!prefixo || xp===prefixo;
    const okEmpresa=!emp || String(x.empresa||"").toLowerCase().includes(emp);
    const texto=`${x.servico||x.tipo||""} ${x.sistema||""} ${x.produto||""} ${x.descricao||""}`.toLowerCase();
    const okServico=!srv || texto.includes(srv);
    return okVeiculo && okEmpresa && okServico;
  });

  const total=hist.reduce((s,x)=>s+Number(x.custo||0),0);
  const countBy=(key)=>Object.entries(hist.reduce((o,x)=>{
    const k=String(x[key]||"Não informado").trim()||"Não informado";
    o[k]=(o[k]||0)+1; return o;
  },{})).sort((a,b)=>b[1]-a[1]).slice(0,8);

  const serv=countBy("sistema"), empRank=countBy("empresa");
  const maxS=Math.max(1,...serv.map(x=>x[1])),maxE=Math.max(1,...empRank.map(x=>x[1]));
  const veiculoInfo=(window.__manutVeiculos||[]).find(v=>String(v.prefixo)===prefixo);

  $("#manDashboard").innerHTML=`
    ${prefixo?`<section class="panel selected-vehicle">
      <div><h2>${window.__manutCategoria==="EMPILHADEIRA"?"🏗 Empilhadeira":"🚚 Veículo"} ${escapeHtml(prefixo)}</h2>
      <p><b>Placa/ID:</b> ${escapeHtml(veiculoInfo?.placa||"-")} • <b>Modelo:</b> ${escapeHtml(veiculoInfo?.modelo||"-")} • <b>Ano:</b> ${escapeHtml(veiculoInfo?.ano||"-")}</p>
      <p><b>Tipo:</b> ${escapeHtml(veiculoInfo?.tipo||"-")} • <b>Função:</b> ${escapeHtml(veiculoInfo?.funcao||"-")}</p></div>
      <div><b>${hist.length}</b><small> serviços no filtro</small></div>
      <div><b>R$ ${total.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</b><small> gasto no período</small></div>
    </section>`:""}
    <div class="cards manut-kpis">
      ${card("Gasto no período",`R$ ${total.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`,"💰")}
      ${card("Registros",hist.length,"🔧")}
      ${card("Ticket médio",`R$ ${(hist.length?total/hist.length:0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`,"📊")}
      ${card("Veículo selecionado",prefixo||"Todos","🚚")}
    </div>
    <div class="manut-dash-grid">
      <section class="panel"><h3>🏆 Serviços mais realizados ${prefixo?`— ${escapeHtml(prefixo)}`:""}</h3>
        ${serv.length?serv.map(([n,v],i)=>`<div class="rank-row"><b>${i+1}. ${escapeHtml(n)}</b><span>${v}</span><div class="rank-bar"><i style="width:${v/maxS*100}%"></i></div></div>`).join(""):"<p>Sem serviços para o filtro selecionado.</p>"}
      </section>
      <section class="panel"><h3>🏢 Empresas mais utilizadas ${prefixo?`— ${escapeHtml(prefixo)}`:""}</h3>
        ${empRank.length?empRank.map(([n,v],i)=>`<div class="rank-row"><b>${i+1}. ${escapeHtml(n)}</b><span>${v}</span><div class="rank-bar"><i style="width:${v/maxE*100}%"></i></div></div>`).join(""):"<p>Sem empresas para o filtro selecionado.</p>"}
      </section>
    </div>
    <section class="panel manut-history" style="margin-top:16px">
      <div class="os-head"><div>
        <h3>📚 ${prefixo?`Histórico individual — Veículo ${escapeHtml(prefixo)}`:"Histórico geral de manutenção"}</h3>
        <p>${hist.length} serviço(s) encontrado(s). Cada linha abaixo representa um lançamento da manutenção.</p>
      </div><div class="history-total">TOTAL<br><b>R$ ${total.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</b></div></div>
      ${hist.length?`<div class="table-wrap"><table class="history-table"><thead><tr>
        <th>Data</th><th>Veículo</th><th>Serviço</th><th>Sistema</th><th>Descrição / item executado</th><th>Loja / Empresa</th><th>NF</th><th>Local</th><th>Valor</th>
      </tr></thead><tbody>${hist.map(x=>`<tr>
        <td>${formatarDataBR(x.data_emissao||x.data_abertura)}</td>
        <td><b>${fmt(x.prefixo||x.veiculo_prefixo)}</b></td>
        <td><b>${fmt(x.servico||x.tipo)}</b></td>
        <td>${fmt(x.sistema)}</td>
        <td class="wrapcell">${escapeHtml(x.produto||x.descricao||"-")}</td>
        <td><b>${fmt(x.empresa)}</b></td>
        <td>${fmt(x.nota_fiscal)}</td>
        <td>${fmt(x.local)}</td>
        <td class="money-cell"><b>R$ ${Number(x.custo||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</b></td>
      </tr>`).join("")}</tbody></table></div>`:
      `<div class="empty-history"><b>Nenhuma manutenção encontrada para o veículo ${escapeHtml(prefixo||"selecionado")}.</b><br>Altere o período ou limpe os filtros.</div>`}
    </section>`;
}
function modalNovaManutencao(){
  const opts=(window.__manutVeiculos||[]).map(v=>`<option>${escapeHtml(v.prefixo)}</option>`).join("");
  document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modalMan"><form class="modal" id="formMan"><div class="tire-modal-head"><h2>🛠 Registrar manutenção</h2><button type="button" class="secondary" id="xMan">✕</button></div>
  <div class="modal-grid"><label>Veículo<select name="prefixo" required><option value="">Selecione</option>${opts}</select></label><label>Data<input name="data_emissao" type="date" required></label>
  <label>Serviço<input name="servico" placeholder="Manutenção / Serviço"></label><label>Sistema<input name="sistema" placeholder="Motor, Elétrico, Freio..."></label>
  <label>Empresa<input name="empresa" placeholder="Fornecedor / oficina"></label><label>Nota fiscal<input name="nota_fiscal"></label>
  <label>Local<select name="local"><option>EXTERNO</option><option>INTERNO</option></select></label><label>Valor (R$)<input name="custo" type="number" min="0" step="0.01"></label></div>
  <label>Produto / serviço executado<textarea name="produto" rows="3"></textarea></label><label>Descrição<textarea name="descricao" rows="2" required></textarea></label>
  <div class="actions"><button type="button" class="secondary" id="cancelMan">Cancelar</button><button class="primary">💾 Salvar manutenção</button></div></form></div>`);
  $("#xMan").onclick=$("#cancelMan").onclick=()=>$("#modalMan").remove();
  $("#formMan").onsubmit=async e=>{e.preventDefault();try{await api("/api/manutencoes",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});$("#modalMan").remove();await loadManutencao()}catch(x){alert(x.message)}};
}


const CHECK_ITENS=["Nível de óleo","Nível da água","Estado de conservação dos pneus","Existência de vazamentos","Luz de pisca, luz de ré, luz alta e luz baixa","Balão de ar","Embreagem","Para-brisa livre de trincos ou rachaduras","Documentação válida","Espelhos retrovisores","Faixas refletivas","Buzina","Triângulo, macaco, cinta, lona e corda","Revisão visual das placas (quebrada, segura, legível)","Tacógrafo"];

async function loadChecklistDiario(){
  $("#pageTitle").textContent="Checklist Diário";
  const [cfg,vs]=await Promise.all([api("/api/checklist-diario/config"),api("/api/veiculos")]);
  const u=cfg.usuario||{};
  const itensSalvos=Array(CHECK_ITENS.length).fill(null);

  $("#content").innerHTML=`<section class="panel checklist-mobile-panel">
    <div class="check-top"><div><h2>☑ Checklist do veículo</h2><p>Toque em cada item para avaliar.</p></div><div class="check-progress"><b id="ckDone">0</b>/${CHECK_ITENS.length}<small> preenchidos</small></div></div>
    ${cfg.checklist_hoje?`<div class="check-sent">✅ Checklist de hoje já enviado. Situação: <b>${escapeHtml(cfg.checklist_hoje.status_tratamento)}</b></div>`:""}
    <div class="check-meta"><label>Motorista<input value="${escapeHtml(u.nome||"")}" disabled></label>
      <label>Veículo<select id="ckVehicle" required><option value="">Selecione</option>${vs.map(v=>`<option value="${v.id}" ${String(v.id)===String(u.veiculo_id)?"selected":""}>${escapeHtml(v.prefixo)} • ${escapeHtml(v.placa||"-")} • ${escapeHtml(v.modelo||"")}</option>`).join("")}</select></label>
    </div>
    <div class="check-item-list">${CHECK_ITENS.map((item,i)=>`<button type="button" class="check-item-card" data-check-item="${i}">
      <span class="check-number">${i+1}</span><span class="check-name">${escapeHtml(item)}</span><span class="check-result" id="ckResult${i}">Toque para avaliar ›</span>
    </button>`).join("")}</div>
    <label class="check-general">Observação geral<textarea id="ckGeneral" rows="3" placeholder="Observação geral do veículo (opcional)"></textarea></label>
    <div class="check-warning">⚠️ Avalie todos os ${CHECK_ITENS.length} itens antes de enviar.</div>
    <button class="primary check-submit" id="sendDailyCheck" disabled>📤 Finalizar e enviar checklist</button>
  </section>`;

  function atualizarProgresso(){
    const n=itensSalvos.filter(Boolean).length;
    $("#ckDone").textContent=n;
    $("#sendDailyCheck").disabled=n!==CHECK_ITENS.length;
  }
  function abrirItem(i){
    const old=itensSalvos[i]||{status:"",observacao:""};
    document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg check-modal-bg" id="checkItemModal">
      <div class="modal check-item-modal">
        <div class="tire-modal-head"><div><small>ITEM ${i+1} DE ${CHECK_ITENS.length}</small><h2>${escapeHtml(CHECK_ITENS[i])}</h2></div><button type="button" class="secondary" id="closeCheckItem">✕</button></div>
        <p class="check-question">Qual é a condição deste item?</p>
        <div class="status-choice">
          ${[["EXCELENTE","🟢","Excelente"],["BOM","🟢","Bom"],["REGULAR","🟡","Regular"],["RUIM","🟠","Ruim"],["CRITICO","🔴","Crítico"],["NA","⚪","Não se aplica"]].map(x=>`<button type="button" class="status-option ${old.status===x[0]?"selected":""}" data-status="${x[0]}"><span>${x[1]}</span><b>${x[2]}</b></button>`).join("")}
        </div>
        <label>Observação<textarea id="checkItemObs" rows="4" placeholder="Descreva qualquer anormalidade ou detalhe...">${escapeHtml(old.observacao||"")}</textarea></label>
        <button type="button" class="primary save-check-item" id="saveCheckItem" ${old.status?"":"disabled"}>✓ Salvar item</button>
      </div></div>`);
    let escolhido=old.status;
    document.querySelectorAll(".status-option").forEach(b=>b.onclick=()=>{
      escolhido=b.dataset.status;
      document.querySelectorAll(".status-option").forEach(x=>x.classList.toggle("selected",x===b));
      $("#saveCheckItem").disabled=false;
    });
    $("#closeCheckItem").onclick=()=>$("#checkItemModal").remove();
    $("#saveCheckItem").onclick=()=>{
      if(!escolhido)return;
      itensSalvos[i]={item:CHECK_ITENS[i],status:escolhido,observacao:$("#checkItemObs").value.trim()};
      const card=document.querySelector(`[data-check-item="${i}"]`);
      const result=$("#ckResult"+i);
      const map={EXCELENTE:"🟢 Excelente",BOM:"🟢 Bom",REGULAR:"🟡 Regular",RUIM:"🟠 Ruim",CRITICO:"🔴 Crítico",NA:"⚪ N/A"};
      result.textContent=map[escolhido];
      card.classList.add("completed");
      card.dataset.status=escolhido;
      $("#checkItemModal").remove();
      atualizarProgresso();
    };
  }
  document.querySelectorAll("[data-check-item]").forEach(b=>b.onclick=()=>abrirItem(Number(b.dataset.checkItem)));
  $("#sendDailyCheck").onclick=async()=>{
    if(itensSalvos.some(x=>!x))return alert(`Avalie todos os ${CHECK_ITENS.length} itens.`);
    const veiculo_id=Number($("#ckVehicle").value);
    if(!veiculo_id)return alert("Selecione o veículo.");
    if(!confirm("Confirma o envio do checklist diário?"))return;
    try{
      const r=await api("/api/checklist-diario",{method:"POST",body:JSON.stringify({veiculo_id,itens:itensSalvos,observacao:$("#ckGeneral").value.trim()})});
      alert(r.possui_critico?"Checklist enviado. Existem itens que exigem atenção do supervisor.":"Checklist enviado com sucesso.");
      loadDashboardMotorista();
    }catch(x){alert(x.message)}
  };
}

async function loadTratamentoChecklist(){
  $("#pageTitle").textContent="Tratamento de Manutenção Diária";
  try{
    const rows=await api("/api/checklist-tratamento");
    const pend=rows.filter(x=>x.status_tratamento==="Pendente");
    $("#content").innerHTML=`<div class="cards manut-kpis">${card("Recebidos hoje",rows.filter(x=>String(x.data_checklist).slice(0,10)===new Date().toISOString().slice(0,10)).length,"📥")}
      ${card("Pendentes",pend.length,"⚠️")}${card("Com alerta",rows.filter(x=>x.possui_critico).length,"🚨")}${card("O.S. geradas",rows.filter(x=>x.ordem_servico_id).length,"📋")}</div>
      <section class="panel" style="margin-top:16px"><h3>🩺 Checklists recebidos dos motoristas</h3>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>Motorista</th><th>Alertas</th><th>Situação</th><th>O.S.</th><th>Ação</th></tr></thead>
      <tbody>${rows.map(x=>{const probs=(x.itens||[]).filter(i=>["RUIM","CRITICO"].includes(i.status));return `<tr class="${probs.length?"check-problem":""}">
        <td>${formatarDataBR(x.data_checklist)}</td><td><b>${escapeHtml(x.prefixo)}</b><br>${escapeHtml(x.placa||"")}</td><td>${escapeHtml(x.motorista||"-")}</td>
        <td>${probs.length?`<b>🚨 ${probs.length}</b><br>${probs.map(p=>`${escapeHtml(p.item)} (${p.status})`).join("<br>")}`:"✅ Sem pendência"}</td>
        <td><select data-ckstatus="${x.id}">${["Pendente","Em análise","Sem pendência","Tratado","O.S. gerada"].map(st=>`<option ${x.status_tratamento===st?"selected":""} ${st==="O.S. gerada"?"disabled":""}>${st}</option>`).join("")}</select></td>
        <td>${x.ordem_servico_id?`<button class="secondary" data-open-os="${x.ordem_servico_id}">Abrir O.S.</button>`:"-"}</td>
        <td>${probs.length&&!x.ordem_servico_id?`<button class="primary" data-genck="${x.id}">📋 Gerar O.S.</button>`:""}</td></tr>`}).join("")}</tbody></table></div></section>`;
    document.querySelectorAll("[data-ckstatus]").forEach(el=>el.onchange=async()=>{try{await api(`/api/checklist-tratamento/${el.dataset.ckstatus}/status`,{method:"PUT",body:JSON.stringify({status:el.value})})}catch(e){alert(e.message)}});
    document.querySelectorAll("[data-genck]").forEach(b=>b.onclick=async()=>{if(!confirm("Gerar Ordem de Serviço com todos os itens RUIM/CRÍTICO deste checklist?"))return;try{const r=await api(`/api/checklist-tratamento/${b.dataset.genck}/gerar-os`,{method:"POST",body:"{}"});alert(`${r.numero} gerada com sucesso.`);loadTratamentoChecklist()}catch(e){alert(e.message)}});
    document.querySelectorAll("[data-open-os]").forEach(b=>b.onclick=()=>abrirOS(b.dataset.openOs));
  }catch(e){$("#content").innerHTML=`<section class="panel"><h3>Acesso restrito</h3><p>${escapeHtml(e.message)}</p></section>`}
}

async function loadUsuarios(){
  $("#pageTitle").textContent="Usuários";
  try{
    const [rows,vs]=await Promise.all([api("/api/usuarios"),api("/api/veiculos")]);
    $("#content").innerHTML=`<section class="panel"><div class="os-head"><div><h3>👤 Usuários e perfis de acesso</h3><p>Motorista: checklist diário. Supervisor: tratamento e O.S. Admin: acesso completo.</p></div><button class="primary" id="novoUser">+ Novo usuário</button></div>
    <div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Veículo padrão</th><th>Status</th></tr></thead><tbody>${rows.map(u=>`<tr><td><b>${escapeHtml(u.nome)}</b></td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.perfil)}</td><td>${escapeHtml(u.veiculo_prefixo||"-")}</td><td>${u.ativo?"Ativo":"Inativo"}</td></tr>`).join("")}</tbody></table></div></section>`;
    $("#novoUser").onclick=()=>modalUsuario(vs);
  }catch(e){$("#content").innerHTML=`<section class="panel"><h3>Acesso restrito</h3><p>${escapeHtml(e.message)}</p></section>`}
}
function modalUsuario(vs){
 document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modalUser"><form class="modal" id="formUser"><div class="tire-modal-head"><h2>👤 Novo usuário</h2><button type="button" class="secondary" id="xUser">✕</button></div>
 <div class="modal-grid"><label>Nome<input name="nome" required></label><label>E-mail<input name="email" type="email" required></label><div class="info-box"><b>Senha inicial:</b> 1234<br><small>O usuário será obrigado a criar uma nova senha no primeiro acesso.</small></div>
 <label>Perfil<select name="perfil" required><option value="motorista">Motorista</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select></label>
 <label>Veículo padrão<select name="veiculo_id"><option value="">Sem veículo fixo</option>${vs.map(v=>`<option value="${v.id}">${escapeHtml(v.prefixo)} • ${escapeHtml(v.placa||"-")}</option>`).join("")}</select></label></div>
 <div class="actions"><button type="button" class="secondary" id="cancelUser">Cancelar</button><button class="primary">Criar usuário</button></div></form></div>`);
 $("#xUser").onclick=$("#cancelUser").onclick=()=>$("#modalUser").remove();
 $("#formUser").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));if(!o.veiculo_id)o.veiculo_id=null;try{await api("/api/usuarios",{method:"POST",body:JSON.stringify(o)});$("#modalUser").remove();loadUsuarios()}catch(x){alert(x.message)}};
}


async function checarPrimeiroAcesso(){
  try{
    const s=await api("/api/sessao");
    window.__sessao=s;
    if(s.primeiro_acesso) abrirTrocaSenhaObrigatoria();
    return s;
  }catch(e){return null}
}
function abrirTrocaSenhaObrigatoria(){
  if($("#modalPrimeiroAcesso"))return;
  document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modalPrimeiroAcesso"><form class="modal" id="formPrimeiroAcesso">
    <h2>🔐 Primeiro acesso</h2><p>Por segurança, altere a senha padrão <b>1234</b> antes de utilizar o sistema.</p>
    <label>Nova senha<input name="senha" type="password" minlength="6" required autocomplete="new-password"></label>
    <label>Confirmar nova senha<input name="confirmar" type="password" minlength="6" required autocomplete="new-password"></label>
    <div class="actions"><button class="primary">Salvar nova senha</button></div></form></div>`);
  $("#formPrimeiroAcesso").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);if(f.get("senha")!==f.get("confirmar"))return alert("As senhas não conferem.");
    try{await api("/api/primeiro-acesso/alterar-senha",{method:"POST",body:JSON.stringify({senha:f.get("senha")})});$("#modalPrimeiroAcesso").remove();alert("Senha alterada com sucesso.");location.reload()}catch(x){alert(x.message)}};
}

async function loadAberturaChamado(){
 $("#pageTitle").textContent="Abertura de Chamado";
 try{
  const [s,meus]=await Promise.all([api("/api/sessao"),api("/api/chamados/meus")]);
  $("#content").innerHTML=`<section class="panel"><h2>🆘 Solicitar manutenção</h2><p>Use esta tela quando surgir um problema durante a rota ou operação.</p>
   <div class="vehicle-info"><b>Veículo:</b> ${escapeHtml(s.veiculo_prefixo||"-")} • <b>Placa:</b> ${escapeHtml(s.placa||"-")} • <b>Modelo:</b> ${escapeHtml(s.modelo||"-")}</div>
   <form id="formChamado"><div class="modal-grid"><label>Problema / componente<input name="titulo" placeholder="Ex.: Balão de ar" required></label>
   <label>Prioridade<select name="prioridade"><option>Normal</option><option>Alta</option><option>Crítica</option></select></label>
   <label>Localização atual<input name="localizacao" placeholder="Ex.: Parnamirim / Em rota"></label></div>
   <label>Descreva a ocorrência<textarea name="descricao" rows="5" placeholder="Explique o que aconteceu, sintomas e condição do veículo." required></textarea></label>
   <div class="actions"><button class="primary">📨 Enviar chamado ao supervisor</button></div></form></section>
   <section class="panel" style="margin-top:16px"><h3>Meus chamados</h3><div class="table-wrap"><table><thead><tr><th>Chamado</th><th>Data</th><th>Problema</th><th>Prioridade</th><th>Status</th><th>Retorno</th></tr></thead>
   <tbody>${meus.map(x=>`<tr><td><b>${escapeHtml(x.numero||"-")}</b></td><td>${new Date(x.criado_em).toLocaleString("pt-BR")}</td><td>${escapeHtml(x.titulo)}</td><td>${escapeHtml(x.prioridade)}</td><td><b>${escapeHtml(x.status)}</b></td><td>${escapeHtml(x.resposta_supervisor||"-")}</td></tr>`).join("")||'<tr><td colspan="6">Nenhum chamado aberto.</td></tr>'}</tbody></table></div></section>`;
  $("#formChamado").onsubmit=async e=>{e.preventDefault();if(!confirm("Enviar esta ocorrência ao supervisor?"))return;const o=Object.fromEntries(new FormData(e.target));try{const r=await api("/api/chamados",{method:"POST",body:JSON.stringify(o)});alert(`${r.numero} aberto com sucesso.`);loadAberturaChamado()}catch(x){alert(x.message)}};
 }catch(e){$("#content").innerHTML=`<section class="panel"><h3>Não foi possível abrir a tela</h3><p>${escapeHtml(e.message)}</p></section>`}
}

async function loadMinhasOS(){
 $("#pageTitle").textContent="Andamento das Ordens de Serviço";
 try{
  const [s,rows]=await Promise.all([api("/api/sessao"),api("/api/motorista/minhas-os")]);
  $("#content").innerHTML=`<section class="panel"><h2>🔧 O.S. do veículo ${escapeHtml(s.veiculo_prefixo||"-")}</h2><p>Acompanhe o andamento das manutenções do seu veículo.</p>
  <div class="table-wrap"><table><thead><tr><th>O.S.</th><th>Abertura</th><th>Status</th><th>Serviços / demandas</th><th>Observação</th></tr></thead><tbody>
  ${rows.map(x=>`<tr><td><b>${escapeHtml(x.numero||String(x.id))}</b></td><td>${x.criado_em?new Date(x.criado_em).toLocaleString("pt-BR"):"-"}</td><td><b>${escapeHtml(x.status)}</b></td>
  <td>${(x.itens||[]).map(i=>escapeHtml(i.descricao)).join("<br>")||"-"}</td><td>${escapeHtml(x.observacao||"-")}</td></tr>`).join("")||'<tr><td colspan="5">Nenhuma O.S. para este veículo.</td></tr>'}</tbody></table></div></section>`;
 }catch(e){$("#content").innerHTML=`<section class="panel"><p>${escapeHtml(e.message)}</p></section>`}
}

async function loadChamadosAbertos(){
 $("#pageTitle").textContent="Chamados em Aberto";
 try{
  const rows=await api("/api/chamados/abertos");
  $("#content").innerHTML=`<div class="cards manut-kpis">${card("Chamados",rows.length,"📨")}${card("Abertos",rows.filter(x=>x.status==="Aberto").length,"⚠️")}${card("Críticos",rows.filter(x=>x.prioridade==="Crítica"&&x.status==="Aberto").length,"🚨")}${card("O.S. geradas",rows.filter(x=>x.ordem_servico_id).length,"📋")}</div>
  <section class="panel" style="margin-top:16px"><h3>📨 Ocorrências enviadas pelos motoristas</h3><div class="table-wrap"><table><thead><tr><th>Chamado</th><th>Data</th><th>Veículo</th><th>Motorista</th><th>Problema</th><th>Local</th><th>Prioridade</th><th>Status</th><th>Ação</th></tr></thead>
  <tbody>${rows.map(x=>`<tr class="${x.prioridade==="Crítica"?"check-problem":""}"><td><b>${escapeHtml(x.numero||"-")}</b></td><td>${new Date(x.criado_em).toLocaleString("pt-BR")}</td><td><b>${escapeHtml(x.prefixo)}</b><br>${escapeHtml(x.placa||"")}</td><td>${escapeHtml(x.motorista||"-")}</td><td><b>${escapeHtml(x.titulo)}</b><br>${escapeHtml(x.descricao)}</td><td>${escapeHtml(x.localizacao||"-")}</td><td>${escapeHtml(x.prioridade)}</td><td>${escapeHtml(x.status)}</td>
  <td>${!x.ordem_servico_id?`<button class="primary" data-chos="${x.id}">📋 Gerar O.S.</button>`:`<button class="secondary" data-open-os="${x.ordem_servico_id}">Abrir O.S.</button>`}</td></tr>`).join("")}</tbody></table></div></section>`;
  document.querySelectorAll("[data-chos]").forEach(b=>b.onclick=async()=>{if(!confirm("Gerar O.S. a partir deste chamado?"))return;try{const r=await api(`/api/chamados/${b.dataset.chos}/gerar-os`,{method:"POST",body:"{}"});alert(`${r.numero} gerada.`);loadChamadosAbertos()}catch(e){alert(e.message)}});
  document.querySelectorAll("[data-open-os]").forEach(b=>b.onclick=()=>abrirOS(b.dataset.openOs));
 }catch(e){$("#content").innerHTML=`<section class="panel"><h3>Acesso do supervisor</h3><p>${escapeHtml(e.message)}</p></section>`}
}

async function aplicarMenuPorPerfil(){
  try{
    const s=await api("/api/sessao");
    window.__sessao=s;
    user={...(user||{}),...s}; localStorage.setItem("user",JSON.stringify(user));
    const motorista=String(s.perfil||"").toLowerCase()==="motorista";
    const permitidasMotorista=["dashboard","checklist-diario","abertura-chamado","minhas-os","perfil-motorista"];
    document.body.classList.toggle("perfil-motorista",motorista);
    document.querySelectorAll("#nav [data-page]").forEach(b=>{
      b.hidden=motorista && !permitidasMotorista.includes(b.dataset.page);
      b.style.display=(motorista && !permitidasMotorista.includes(b.dataset.page))?"none":"";
    });
    if(motorista){
      const dia=await api("/api/motorista/veiculo-dia");
      if(!dia) return abrirSelecaoVeiculoDia();
      window.__veiculoDia=dia;
    }
  }catch(e){}
}

async function abrirSelecaoVeiculoDia(){
  if($("#modalVeiculoDia"))return;
  const vs=await api("/api/veiculos");
  document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modalVeiculoDia"><form class="modal" id="formVeiculoDia">
    <h2>🚚 Qual veículo você utilizará hoje?</h2>
    <p>Antes de iniciar a operação, selecione o veículo. Em seguida você será direcionado para o Checklist Diário.</p>
    <label>Veículo de hoje<select name="veiculo_id" required><option value="">Selecione o veículo</option>${vs.map(v=>`<option value="${v.id}">${escapeHtml(v.prefixo)} • ${escapeHtml(v.placa||"-")} • ${escapeHtml(v.modelo||"")}</option>`).join("")}</select></label>
    <div class="actions"><button class="primary">Continuar para o Checklist</button></div></form></div>`);
  $("#formVeiculoDia").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);try{
    await api("/api/motorista/veiculo-dia",{method:"POST",body:JSON.stringify({veiculo_id:Number(fd.get("veiculo_id"))})});
    $("#modalVeiculoDia").remove();
    await aplicarMenuPorPerfil();
    const b=document.querySelector('[data-page="checklist-diario"]'); if(b){b.click()} else loadChecklistDiario();
  }catch(x){alert(x.message)}};
}

async function loadPerfilMotorista(){
 $("#pageTitle").textContent="Meu Perfil";
 try{
  const u=await api("/api/motorista/perfil");
  $("#content").innerHTML=`<div class="profile-grid">
   <section class="panel"><h2>👤 Meu perfil</h2><form id="formMeuPerfil"><label>Nome<input name="nome" value="${escapeHtml(u.nome||"")}" required></label><label>E-mail<input name="email" type="email" value="${escapeHtml(u.email||"")}" required></label><div class="actions"><button class="primary">Salvar perfil</button></div></form></section>
   <section class="panel"><h2>🔐 Alterar senha</h2><form id="formSenhaMotorista"><label>Senha atual<input name="senha_atual" type="password" required></label><label>Nova senha<input name="nova_senha" type="password" minlength="6" required></label><label>Confirmar nova senha<input name="confirmar" type="password" minlength="6" required></label><div class="actions"><button class="primary">Alterar senha</button></div></form></section></div>`;
  $("#formMeuPerfil").onsubmit=async e=>{e.preventDefault();try{await api("/api/motorista/perfil",{method:"PUT",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});alert("Perfil atualizado.")}catch(x){alert(x.message)}};
  $("#formSenhaMotorista").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));if(o.nova_senha!==o.confirmar)return alert("As novas senhas não conferem.");try{await api("/api/motorista/alterar-senha",{method:"PUT",body:JSON.stringify(o)});e.target.reset();alert("Senha alterada com sucesso.")}catch(x){alert(x.message)}};
 }catch(e){$("#content").innerHTML=`<section class="panel"><p>${escapeHtml(e.message)}</p></section>`}
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



document.addEventListener("click",(e)=>{
 if(e.target?.id==="mobileMenuBtn"){document.body.classList.toggle("sidebar-open");return;}
 if(window.innerWidth<=900 && e.target?.closest?.("#nav [data-page]"))document.body.classList.remove("sidebar-open");
});

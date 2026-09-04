# Gestão de Frota V2.4
Atualizada com HISTORICO DA FROTA V3.xlsx.
- 27 caminhões cadastrados.
- 12 empilhadeiras cadastradas.
- 360 lançamentos detalhados de manutenção importados.
- Abas separadas para Caminhões e Empilhadeiras.
- Cadastro mostra placa/ID, modelo, ano, tipo e função.
- Histórico mostra serviço, sistema, produto/descrição, empresa, NF, local e valor.
- Importações antigas de planilha são substituídas para evitar duplicidade; lançamentos manuais são preservados.
Não apague o PostgreSQL.


## V2.4.1 — Carreta 5041
Histórico específico atualizado a partir de 5041.xlsx:
- 144 lançamentos.
- Total histórico: R$ 131,148.97.
- Dados preservados por lançamento: data, serviço, descrição, sistema, local, NF, produto, valor, fornecedor e empresa.
- Histórico importado anterior da 5041 é substituído; lançamentos manuais são preservados.


## V2.5 — Checklist diário + usuários
Checklist baseado no arquivo fornecido pelo usuário, com 18 itens obrigatórios.
Fluxo:
Motorista -> Checklist diário -> envio -> Tratamento de Manutenção Diária -> Supervisor -> O.S. -> execução/acompanhamento.

Perfis:
- motorista
- supervisor
- admin

Itens RUIM e CRITICO são destacados e podem virar uma O.S. com um clique.
O motorista pode ter um veículo padrão associado ao usuário.


## V2.6 — Usuários, primeiro acesso e chamados
- Cadastro de usuários com senha padrão 1234.
- Primeiro acesso obriga troca para senha pessoal com mínimo de 6 caracteres.
- Motorista associado a veículo.
- Motorista: Checklist Diário, Abertura de Chamado e acompanhamento das O.S. do próprio veículo.
- Supervisor/Admin: Cadastro de Usuários, Tratamento Checklist, Chamados em Aberto e geração de O.S.
- Chamado registra veículo, motorista, ocorrência, localização, prioridade e andamento.
- Supervisor pode transformar chamado em O.S.
- Corrigido fluxo do checklist para evitar o alerta genérico "Erro na operação" e retornar mensagens de validação.


## V2.7 — Portal restrito do motorista
Ao entrar:
1. Se for primeiro acesso, troca obrigatória da senha padrão.
2. Motorista seleciona o veículo que utilizará naquele dia.
3. Sistema registra Motorista + Veículo + Data.
4. Redirecionamento direto para Checklist Diário.

Menu do motorista fica limitado a:
- Meu Perfil / alterar senha
- Checklist Diário
- Abertura de Chamado
- Andamento das O.S.

O motorista não visualiza Dashboard geral, Frota, Pneus, Manutenção, Usuários, Tratamento, Combustível, Ocorrências ou Equipe.
As O.S. exibidas ao motorista são vinculadas ao veículo selecionado para o dia.


## V2.8 — Correção definitiva do perfil Motorista
- Corrigido o carregamento que mostrava Dashboard/Frota antes da aplicação do perfil.
- Menu do motorista limitado a Dashboard do Motorista, Meu Perfil, Checklist Diário, Abertura de Chamado e Andamento das O.S.
- Bloqueio de APIs administrativas no servidor para perfil motorista.
- Dashboard do motorista mostra somente o veículo selecionado no dia.
- Alertas: checklist pendente, pneus em atenção, recapagem, críticos, chamados e O.S. abertas.
- Ao selecionar o veículo do dia, motorista é enviado diretamente ao Checklist Diário.


## V2.9 — Checklist Mobile
- Checklist redesenhado para celular.
- Motorista toca no item; abre uma janela para selecionar status, inserir observação e salvar.
- Progresso mostra quantos itens já foram preenchidos.
- Envio fica bloqueado até todos os itens serem avaliados.
- Removidos: Palhetas do para-brisa, Cinto de segurança e Lameira de plástico.
- Checklist passou de 18 para 15 itens obrigatórios.


## V3.0 — Template Profissional COMJOL
Identidade visual COMJOL integrada, sidebar corporativa azul, detalhes laranja, cards/tabelas/formulários modernizados e menu recolhível no celular. Todas as funções da V2.9 e o PostgreSQL são preservados.


## V3.1 — Veículo obrigatório a cada login do motorista
- Em todo novo login do perfil motorista, o sistema solicita o veículo que será utilizado.
- Após confirmar o veículo, o motorista é encaminhado diretamente ao Checklist Diário.
- A escolha fica vinculada à sessão de login, evitando pular a seleção apenas porque já houve uso do veículo no mesmo dia.

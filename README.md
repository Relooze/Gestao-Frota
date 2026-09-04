# Gestão de Frota & Expedição — V2.1

## Novidades
- Classificação automática pelo sulco:
  - >= 7 mm: Bom
  - 5 a 6,99 mm: Atenção
  - 1 a 4,99 mm: Recapagem
  - <= 0 mm: Crítico
- O status e a ação sugerida mudam na tela enquanto o sulco é digitado.
- O servidor recalcula a classificação ao salvar, evitando divergência.
- Geração de Ordem de Serviço por veículo reunindo:
  - pneus com demanda;
  - manutenções abertas;
  - ocorrências abertas.
- Fluxo da O.S.: Conferência → Em orçamento → Aguardando aprovação → Aprovada → Em execução → Concluída.
- Valores de orçamento por item e total automático.
- Registro de responsável pela aprovação.
- Correção importante: a carga inicial não sobrescreve mais alterações manuais após reinício/deploy do Railway.

## Instalação
Substitua os arquivos do repositório pelos arquivos deste pacote e faça commit na branch principal.
O PostgreSQL existente é migrado automaticamente; não apague o banco.

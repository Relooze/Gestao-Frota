# Gestão-Frota V3.5.8

Correções:
- corrige atualização/autorização das solicitações de abastecimento em bancos criados por versões anteriores;
- preserva solicitações existentes;
- registra usuário e data/hora ao autorizar, atender ou recusar;
- WhatsApp do posto atualizado para +55 84 99104-4202;
- ao autorizar com sucesso, abre o WhatsApp com a mensagem pronta.

Não é necessário apagar o PostgreSQL.

## V3.5.9
- Corrigido erro PostgreSQL `text versus character varying` ao autorizar solicitação de abastecimento.
- Removido CASE parametrizado da atualização de status e adicionados casts explícitos.
- Mantido WhatsApp do posto: +55 84 99104-4202.

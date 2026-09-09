# Gestão de Frota V3.5.7 — Autorização de abastecimento via WhatsApp

## Alteração
Ao alterar uma solicitação de abastecimento para **Autorizado**, o sistema primeiro salva o novo status no PostgreSQL e, após sucesso, abre o WhatsApp do posto com a autorização preenchida.

WhatsApp configurado: **+55 84 99894-6047**.

A mensagem inclui veículo, placa, motorista, data, hora da solicitação e status AUTORIZADO.

## Importante
O envio não é silencioso: o WhatsApp é aberto com a mensagem pronta e o administrador/supervisor confirma o envio. Isso evita depender de API paga/credenciais do WhatsApp Business.

## Instalação
Substitua os arquivos da versão anterior pelos deste pacote, faça commit no GitHub, aguarde o Railway ficar ACTIVE e use Ctrl+F5 no navegador.

# Gestão de Frota & Expedição — V1

Base funcional para Railway + PostgreSQL.

## Incluído
- Primeiro acesso / administrador
- Login JWT
- Dashboard
- Cadastro e listagem de veículos
- Estrutura PostgreSQL para equipe, expedições, pneus, manutenção, checklist, combustível e ocorrências
- Interface responsiva

## Railway
Variáveis necessárias no serviço da aplicação:
- `DATABASE_URL` = referência `${{Postgres.DATABASE_URL}}`
- `JWT_SECRET` = uma chave longa e aleatória criada por você

O servidor usa `process.env.PORT` automaticamente.

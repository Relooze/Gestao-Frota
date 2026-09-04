const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "ALTERE_ESTA_CHAVE_NA_RAILWAY";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function initDatabase() {
  const sql = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      email VARCHAR(160) UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      perfil VARCHAR(30) NOT NULL DEFAULT 'operador',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS veiculos (
      id SERIAL PRIMARY KEY,
      prefixo VARCHAR(30) UNIQUE NOT NULL,
      placa VARCHAR(20),
      tipo VARCHAR(40) NOT NULL,
      modelo VARCHAR(80),
      capacidade_kg NUMERIC(12,2) DEFAULT 0,
      km_atual NUMERIC(12,1) DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Disponível',
      observacao TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS colaboradores (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      funcao VARCHAR(50) NOT NULL,
      telefone VARCHAR(30),
      cnh VARCHAR(30),
      validade_cnh DATE,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expedicoes (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(30) UNIQUE NOT NULL,
      destino VARCHAR(180) NOT NULL,
      peso_kg NUMERIC(12,2) DEFAULT 0,
      volumes INTEGER DEFAULT 0,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      motorista_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
      previsao_entrega TIMESTAMPTZ,
      status VARCHAR(40) NOT NULL DEFAULT 'Programada',
      observacao TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pneus (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(40) UNIQUE NOT NULL,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      posicao VARCHAR(40),
      marca VARCHAR(60),
      modelo VARCHAR(60),
      sulco_mm NUMERIC(5,2),
      km_pneu NUMERIC(12,1) DEFAULT 0,
      recapagens INTEGER DEFAULT 0,
      custo NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Bom',
      classificacao VARCHAR(40),
      acao_sugerida TEXT,
      ultima_inspecao DATE,
      observacao TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE pneus ADD COLUMN IF NOT EXISTS classificacao VARCHAR(40);
    ALTER TABLE pneus ADD COLUMN IF NOT EXISTS acao_sugerida TEXT;
    ALTER TABLE pneus ADD COLUMN IF NOT EXISTS ultima_inspecao DATE;
    ALTER TABLE pneus ADD COLUMN IF NOT EXISTS observacao TEXT;

    CREATE TABLE IF NOT EXISTS manutencoes (
      id SERIAL PRIMARY KEY,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE CASCADE,
      tipo VARCHAR(30) NOT NULL,
      descricao TEXT NOT NULL,
      data_abertura DATE NOT NULL DEFAULT CURRENT_DATE,
      vencimento DATE,
      custo NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Aberta',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );



    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS veiculo_prefixo VARCHAR(30);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS mes VARCHAR(20);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS servico VARCHAR(80);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS sistema VARCHAR(80);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS local VARCHAR(40);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS nota_fiscal VARCHAR(60);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS data_emissao DATE;
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS produto TEXT;
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS fornecedor_codigo VARCHAR(60);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS empresa VARCHAR(160);
    ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS origem_importacao VARCHAR(80);

    CREATE TABLE IF NOT EXISTS ordens_servico (
      id SERIAL PRIMARY KEY,
      numero VARCHAR(30) UNIQUE,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE CASCADE,
      data_abertura DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'Conferência',
      observacao TEXT,
      valor_orcado NUMERIC(12,2) DEFAULT 0,
      aprovado_por VARCHAR(120),
      data_aprovacao TIMESTAMPTZ,
      data_conclusao TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ordem_servico_itens (
      id SERIAL PRIMARY KEY,
      ordem_id INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
      origem VARCHAR(30) NOT NULL,
      origem_id INTEGER,
      descricao TEXT NOT NULL,
      prioridade VARCHAR(20) NOT NULL DEFAULT 'Atenção',
      valor_estimado NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'Pendente',
      observacao TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sistema_config (
      chave VARCHAR(80) PRIMARY KEY,
      valor TEXT,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS abastecimentos (
      id SERIAL PRIMARY KEY,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE CASCADE,
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      km NUMERIC(12,1),
      litros NUMERIC(12,2) NOT NULL,
      valor_litro NUMERIC(12,3) NOT NULL,
      valor_total NUMERIC(12,2),
      posto VARCHAR(120),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ocorrencias (
      id SERIAL PRIMARY KEY,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      expedicao_id INTEGER REFERENCES expedicoes(id) ON DELETE SET NULL,
      tipo VARCHAR(60) NOT NULL,
      descricao TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Aberta',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS checklists (
      id SERIAL PRIMARY KEY,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE CASCADE,
      colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
      itens JSONB NOT NULL DEFAULT '{}'::jsonb,
      possui_critico BOOLEAN NOT NULL DEFAULT FALSE,
      observacao TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(sql);
}


// CARGA INICIAL DA FROTA E PNEUS - baseada na planilha de 29/08/2026
const VEICULOS_INICIAIS = [
  {
    "prefixo": "5002",
    "placa": "MYX3659",
    "tipo": "Toco",
    "modelo": null,
    "capacidade_kg": 8000,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO OK, SEM PNEUS COM SULCO PARA RECAPAGEM"
  },
  {
    "prefixo": "5003",
    "placa": "MYK9319",
    "tipo": "Trucado",
    "modelo": null,
    "capacidade_kg": 15000,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO COM 2 PNEUS PARA RECAPAR"
  },
  {
    "prefixo": "5009",
    "placa": "MYN9450",
    "tipo": "3/4",
    "modelo": null,
    "capacidade_kg": 3500,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO OK, NENHUM PNEU COM SULCO PARA RECAPAGEM"
  },
  {
    "prefixo": "5015",
    "placa": "MYY3679",
    "tipo": "Toco",
    "modelo": null,
    "capacidade_kg": 7500,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO COM 03 PNEUS PRONTOS PARA RECAPAGEM"
  },
  {
    "prefixo": "5016",
    "placa": "MY53600",
    "tipo": "3/4",
    "modelo": null,
    "capacidade_kg": 3500,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO OK, NENHUM PNEU AINDA NO LIMITE DE SULCO PARA COBERTURA"
  },
  {
    "prefixo": "5017",
    "placa": null,
    "tipo": "Não informado",
    "modelo": null,
    "capacidade_kg": 0,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO OK, NENHUM PNEU COM SULCO PARA RECAPAGEM"
  },
  {
    "prefixo": "5028",
    "placa": "NNY4449",
    "tipo": "Toco",
    "modelo": null,
    "capacidade_kg": 7500,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO OK, NENHUM PNEU AINDA NO LIMITE DE SULCO PARA COBERTURA"
  },
  {
    "prefixo": "5029",
    "placa": "NNY4449",
    "tipo": "Toco",
    "modelo": null,
    "capacidade_kg": 7500,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "1 PNEU PARA RECAPAGEM"
  },
  {
    "prefixo": "5033",
    "placa": "NOF8459",
    "tipo": "Toco",
    "modelo": null,
    "capacidade_kg": 7500,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO COM 3 PNEUS PARA RECAPAR"
  },
  {
    "prefixo": "5038",
    "placa": "OJZ4269",
    "tipo": "Trucado",
    "modelo": null,
    "capacidade_kg": 15000,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO COM 1 PNEU COM SULCO JÁ NA CONDIÇÃO DE COBERTURA"
  },
  {
    "prefixo": "5039",
    "placa": "OKB6889",
    "tipo": "Toco",
    "modelo": null,
    "capacidade_kg": 7500,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO COM 2 PNEUS PARA RECAPAR"
  },
  {
    "prefixo": "5041",
    "placa": "OVZ4256",
    "tipo": "Não informado",
    "modelo": null,
    "capacidade_kg": 0,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "ATENÇÃO: foram enviados dois checklists do mesmo carro/data com dados divergentes. Esta aba registra o CHECKLIST 5041.pdf (sem pneus para recapagem). Consulte a aba 'Divergências'."
  },
  {
    "prefixo": "5043",
    "placa": "QGA8147",
    "tipo": "Trucado",
    "modelo": null,
    "capacidade_kg": 15000,
    "km_atual": 0,
    "status": "Disponível",
    "observacao": "CARRO COM 7 PNEUS COM SULCO JÁ NA CONDIÇÃO DE COBERTURA"
  }
];

const PNEUS_INICIAIS = [
  {
    "codigo": "5002-01",
    "prefixo": "5002",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "SPEED MAX",
    "modelo": null,
    "sulco_mm": 18,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5002-04",
    "prefixo": "5002",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "METROMAX",
    "modelo": null,
    "sulco_mm": 18,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5002-05",
    "prefixo": "5002",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5002-06",
    "prefixo": "5002",
    "posicao": "2º Eixo Esq. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5002-07",
    "prefixo": "5002",
    "posicao": "2º Eixo Dir. Int",
    "marca": "APOLO",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5002-08",
    "prefixo": "5002",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "APOLO",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-01",
    "prefixo": "5003",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "GENERAL",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-04",
    "prefixo": "5003",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "GENERAL",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-05",
    "prefixo": "5003",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 6,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "ATENÇÃO",
    "acao_sugerida": "Acompanhar com maior frequência",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-06",
    "prefixo": "5003",
    "posicao": "2º Eixo Esq. Int",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 6,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "ATENÇÃO",
    "acao_sugerida": "Acompanhar com maior frequência",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-07",
    "prefixo": "5003",
    "posicao": "2º Eixo Dir. Int",
    "marca": "DRC",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-08",
    "prefixo": "5003",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "DRC",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-09",
    "prefixo": "5003",
    "posicao": "3º Eixo Esq. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 0,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Crítico",
    "classificacao": "CRÍTICO",
    "acao_sugerida": "Retirar / avaliar recapagem imediatamente",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-10",
    "prefixo": "5003",
    "posicao": "3º Eixo Esq. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 0,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Crítico",
    "classificacao": "CRÍTICO",
    "acao_sugerida": "Retirar / avaliar recapagem imediatamente",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-11",
    "prefixo": "5003",
    "posicao": "3º Eixo Dir. Int",
    "marca": "DRC",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-12",
    "prefixo": "5003",
    "posicao": "3º Eixo Dir. Ext",
    "marca": "DRC",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5003-13",
    "prefixo": "5003",
    "posicao": "Step 1",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 12,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5009-01",
    "prefixo": "5009",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 12,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5009-04",
    "prefixo": "5009",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 12,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5009-05",
    "prefixo": "5009",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5009-06",
    "prefixo": "5009",
    "posicao": "2º Eixo Esq. Int",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5009-07",
    "prefixo": "5009",
    "posicao": "2º Eixo Dir. Int",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5009-08",
    "prefixo": "5009",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5009-09",
    "prefixo": "5009",
    "posicao": "Step 1",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5015-01",
    "prefixo": "5015",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "ANTEO",
    "modelo": null,
    "sulco_mm": 3,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5015-04",
    "prefixo": "5015",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "ANTEO",
    "modelo": null,
    "sulco_mm": 4,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5015-05",
    "prefixo": "5015",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5015-06",
    "prefixo": "5015",
    "posicao": "2º Eixo Esq. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5015-07",
    "prefixo": "5015",
    "posicao": "2º Eixo Dir. Int",
    "marca": "CONTIN",
    "modelo": null,
    "sulco_mm": 8,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5015-08",
    "prefixo": "5015",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "CONTIN",
    "modelo": null,
    "sulco_mm": 8,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5015-09",
    "prefixo": "5015",
    "posicao": "Step 1",
    "marca": "MICHEL",
    "modelo": null,
    "sulco_mm": 0,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Crítico",
    "classificacao": "CRÍTICO",
    "acao_sugerida": "Retirar / avaliar recapagem imediatamente",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5016-02",
    "prefixo": "5016",
    "posicao": "1º Eixo Esq. Int",
    "marca": "CENTELYA",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5016-04",
    "prefixo": "5016",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "CENTELYA",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5016-05",
    "prefixo": "5016",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "ANTEO",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5016-06",
    "prefixo": "5016",
    "posicao": "2º Eixo Esq. Int",
    "marca": "ANTEO",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5016-07",
    "prefixo": "5016",
    "posicao": "2º Eixo Dir. Int",
    "marca": "ANTEO",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5016-08",
    "prefixo": "5016",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "ANTEO",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5016-09",
    "prefixo": "5016",
    "posicao": "Step 1",
    "marca": "JET TRAK",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5017-01",
    "prefixo": "5017",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "CONTINEN",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5017-04",
    "prefixo": "5017",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "CONTINEN",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5017-05",
    "prefixo": "5017",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5017-06",
    "prefixo": "5017",
    "posicao": "2º Eixo Esq. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5017-07",
    "prefixo": "5017",
    "posicao": "2º Eixo Dir. Int",
    "marca": "PIRELLI",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5017-08",
    "prefixo": "5017",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "PIRELLI",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5017-09",
    "prefixo": "5017",
    "posicao": "Step 1",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5028-02",
    "prefixo": "5028",
    "posicao": "1º Eixo Esq. Int",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5028-04",
    "prefixo": "5028",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5028-05",
    "prefixo": "5028",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5028-06",
    "prefixo": "5028",
    "posicao": "2º Eixo Esq. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5028-07",
    "prefixo": "5028",
    "posicao": "2º Eixo Dir. Int",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5028-08",
    "prefixo": "5028",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5028-09",
    "prefixo": "5028",
    "posicao": "Step 1",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5029-02",
    "prefixo": "5029",
    "posicao": "1º Eixo Esq. Int",
    "marca": "SPED MAX",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5029-04",
    "prefixo": "5029",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "SPED MAX",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5029-05",
    "prefixo": "5029",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 12,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5029-06",
    "prefixo": "5029",
    "posicao": "2º Eixo Esq. Int",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5029-07",
    "prefixo": "5029",
    "posicao": "2º Eixo Dir. Int",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 0,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Crítico",
    "classificacao": "CRÍTICO",
    "acao_sugerida": "Retirar / avaliar recapagem imediatamente",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5029-08",
    "prefixo": "5029",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 5,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "ATENÇÃO",
    "acao_sugerida": "Acompanhar com maior frequência",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5029-09",
    "prefixo": "5029",
    "posicao": "Step 1",
    "marca": "BRIDGEST",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5033-01",
    "prefixo": "5033",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5033-04",
    "prefixo": "5033",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 12,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5033-05",
    "prefixo": "5033",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "DRC",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5033-06",
    "prefixo": "5033",
    "posicao": "2º Eixo Esq. Int",
    "marca": "RDC",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5033-07",
    "prefixo": "5033",
    "posicao": "2º Eixo Dir. Int",
    "marca": "ALTURA",
    "modelo": null,
    "sulco_mm": 3,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5033-08",
    "prefixo": "5033",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "ALTURA",
    "modelo": null,
    "sulco_mm": 3,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5033-09",
    "prefixo": "5033",
    "posicao": "Step 1",
    "marca": "BRID",
    "modelo": null,
    "sulco_mm": 0,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Crítico",
    "classificacao": "CRÍTICO",
    "acao_sugerida": "Retirar / avaliar recapagem imediatamente",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-01",
    "prefixo": "5038",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "SPEDDMAX",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-04",
    "prefixo": "5038",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "SPEEDMAX",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-05",
    "prefixo": "5038",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-06",
    "prefixo": "5038",
    "posicao": "2º Eixo Esq. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-07",
    "prefixo": "5038",
    "posicao": "2º Eixo Dir. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 8,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-08",
    "prefixo": "5038",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-09",
    "prefixo": "5038",
    "posicao": "3º Eixo Esq. Ext",
    "marca": "CEAT",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-10",
    "prefixo": "5038",
    "posicao": "3º Eixo Esq. Int",
    "marca": "CEAT",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-11",
    "prefixo": "5038",
    "posicao": "3º Eixo Dir. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 10,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-12",
    "prefixo": "5038",
    "posicao": "3º Eixo Dir. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5038-13",
    "prefixo": "5038",
    "posicao": "Step 1",
    "marca": "APOLO",
    "modelo": null,
    "sulco_mm": 3,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5039-01",
    "prefixo": "5039",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "CEAT",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5039-04",
    "prefixo": "5039",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "CEAT",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5039-05",
    "prefixo": "5039",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "ALTURA",
    "modelo": null,
    "sulco_mm": 5,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "ATENÇÃO",
    "acao_sugerida": "Acompanhar com maior frequência",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5039-06",
    "prefixo": "5039",
    "posicao": "2º Eixo Esq. Int",
    "marca": "ALTURA",
    "modelo": null,
    "sulco_mm": 4,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5039-07",
    "prefixo": "5039",
    "posicao": "2º Eixo Dir. Int",
    "marca": "CONTIN",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5039-08",
    "prefixo": "5039",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "CONTIN",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-01",
    "prefixo": "5041",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "AMULET",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-04",
    "prefixo": "5041",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "AMULET",
    "modelo": null,
    "sulco_mm": 11,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-05",
    "prefixo": "5041",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "SPEDMAX",
    "modelo": null,
    "sulco_mm": 15,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-06",
    "prefixo": "5041",
    "posicao": "2º Eixo Esq. Int",
    "marca": "SPEDMAX",
    "modelo": null,
    "sulco_mm": 15,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-07",
    "prefixo": "5041",
    "posicao": "2º Eixo Dir. Int",
    "marca": "MILESTONE",
    "modelo": null,
    "sulco_mm": 13,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-08",
    "prefixo": "5041",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "MILESTONE",
    "modelo": null,
    "sulco_mm": 13,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-09",
    "prefixo": "5041",
    "posicao": "3º Eixo Esq. Ext",
    "marca": "SPEDMAX",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-10",
    "prefixo": "5041",
    "posicao": "3º Eixo Esq. Int",
    "marca": "SPEDMAX",
    "modelo": null,
    "sulco_mm": 14,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-11",
    "prefixo": "5041",
    "posicao": "3º Eixo Dir. Int",
    "marca": "CONTINENT",
    "modelo": null,
    "sulco_mm": 7,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-12",
    "prefixo": "5041",
    "posicao": "3º Eixo Dir. Ext",
    "marca": "CONTINENT",
    "modelo": null,
    "sulco_mm": 5,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "ATENÇÃO",
    "acao_sugerida": "Acompanhar com maior frequência",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-13",
    "prefixo": "5041",
    "posicao": "Step 1",
    "marca": "MICHELIN",
    "modelo": null,
    "sulco_mm": 16,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5041-14",
    "prefixo": "5041",
    "posicao": "Step 2",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 5,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "ATENÇÃO",
    "acao_sugerida": "Acompanhar com maior frequência",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-01",
    "prefixo": "5043",
    "posicao": "1º Eixo Esq. Ext",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 4,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-04",
    "prefixo": "5043",
    "posicao": "1º Eixo Dir. Ext",
    "marca": "MAGNUM",
    "modelo": null,
    "sulco_mm": 8,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-05",
    "prefixo": "5043",
    "posicao": "2º Eixo Esq. Ext",
    "marca": "DRC",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-06",
    "prefixo": "5043",
    "posicao": "2º Eixo Esq. Int",
    "marca": "DRC",
    "modelo": null,
    "sulco_mm": 9,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Bom",
    "classificacao": "OK",
    "acao_sugerida": "Manter em operação e monitorar",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-07",
    "prefixo": "5043",
    "posicao": "2º Eixo Dir. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 2,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-08",
    "prefixo": "5043",
    "posicao": "2º Eixo Dir. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 4,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-09",
    "prefixo": "5043",
    "posicao": "3º Eixo Esq. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 1,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-10",
    "prefixo": "5043",
    "posicao": "3º Eixo Esq. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 1,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-11",
    "prefixo": "5043",
    "posicao": "3º Eixo Dir. Int",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 2,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  },
  {
    "codigo": "5043-12",
    "prefixo": "5043",
    "posicao": "3º Eixo Dir. Ext",
    "marca": "DUNLOP",
    "modelo": null,
    "sulco_mm": 2,
    "km_pneu": 0,
    "recapagens": 0,
    "custo": 0,
    "status": "Recapagem",
    "classificacao": "RECAPAGEM / ATENÇÃO",
    "acao_sugerida": "Programar retirada e avaliação",
    "ultima_inspecao": "2026-08-29",
    "observacao": null
  }
];

async function importarDadosIniciais() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const v of VEICULOS_INICIAIS) {
      await client.query(`
        INSERT INTO veiculos(prefixo, placa, tipo, modelo, capacidade_kg, km_atual, status, observacao)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (prefixo) DO UPDATE SET
          placa = COALESCE(EXCLUDED.placa, veiculos.placa),
          tipo = CASE WHEN EXCLUDED.tipo <> 'Não informado' THEN EXCLUDED.tipo ELSE veiculos.tipo END,
          capacidade_kg = CASE WHEN EXCLUDED.capacidade_kg > 0 THEN EXCLUDED.capacidade_kg ELSE veiculos.capacidade_kg END,
          observacao = COALESCE(EXCLUDED.observacao, veiculos.observacao)
      `, [v.prefixo,v.placa,v.tipo,v.modelo,v.capacidade_kg,v.km_atual,v.status,v.observacao]);
    }

    for (const p of PNEUS_INICIAIS) {
      const vr = await client.query("SELECT id FROM veiculos WHERE prefixo=$1", [p.prefixo]);
      if (!vr.rowCount) continue;
      await client.query(`
        INSERT INTO pneus(codigo,veiculo_id,posicao,marca,modelo,sulco_mm,km_pneu,recapagens,custo,status,classificacao,acao_sugerida,ultima_inspecao,observacao)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (codigo) DO UPDATE SET
          veiculo_id=EXCLUDED.veiculo_id,
          posicao=EXCLUDED.posicao,
          marca=EXCLUDED.marca,
          sulco_mm=EXCLUDED.sulco_mm,
          status=EXCLUDED.status,
          classificacao=EXCLUDED.classificacao,
          acao_sugerida=EXCLUDED.acao_sugerida,
          ultima_inspecao=EXCLUDED.ultima_inspecao,
          observacao=EXCLUDED.observacao
      `, [p.codigo,vr.rows[0].id,p.posicao,p.marca,p.modelo,p.sulco_mm,p.km_pneu,p.recapagens,p.custo,p.status,p.classificacao,p.acao_sugerida,p.ultima_inspecao,p.observacao]);
    }

    await client.query("COMMIT");
    console.log(`Carga inicial concluída: ${VEICULOS_INICIAIS.length} veículos e ${PNEUS_INICIAIS.length} pneus medidos.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function tokenFrom(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
function auth(req, res, next) {
  try {
    const token = tokenFrom(req);
    if (!token) return res.status(401).json({ erro: "Não autenticado" });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ erro: "Sessão inválida ou expirada" });
  }
}

app.get("/api/health", (req, res) =>
  res.json({ sistema: "Gestão de Frota & Expedição", servidor: "online", data: new Date() })
);

app.get("/api/database", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() horario");
    res.json({ banco: "online", postgres: true, horario: r.rows[0].horario });
  } catch (e) {
    res.status(500).json({ banco: "offline", postgres: false, erro: e.message });
  }
});

app.get("/api/setup/status", async (req, res) => {
  const r = await pool.query("SELECT COUNT(*)::int total FROM usuarios");
  res.json({ precisa_configurar: r.rows[0].total === 0 });
});

app.post("/api/setup/admin", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha || senha.length < 6)
    return res.status(400).json({ erro: "Informe nome, e-mail e senha com pelo menos 6 caracteres." });

  const count = await pool.query("SELECT COUNT(*)::int total FROM usuarios");
  if (count.rows[0].total > 0)
    return res.status(403).json({ erro: "Configuração inicial já concluída." });

  const hash = await bcrypt.hash(senha, 12);
  const r = await pool.query(
    "INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES($1,$2,$3,'admin') RETURNING id,nome,email,perfil",
    [nome.trim(), email.trim().toLowerCase(), hash]
  );
  res.status(201).json(r.rows[0]);
});

app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;
  const r = await pool.query("SELECT * FROM usuarios WHERE email=$1 AND ativo=TRUE", [(email || "").trim().toLowerCase()]);
  if (!r.rowCount || !(await bcrypt.compare(senha || "", r.rows[0].senha_hash)))
    return res.status(401).json({ erro: "E-mail ou senha inválidos." });

  const u = r.rows[0];
  const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil } });
});

app.get("/api/me", auth, (req, res) => res.json(req.user));

app.get("/api/dashboard", auth, async (req, res) => {
  const [v, e, p, m, o] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE status='Disponível')::int disponiveis,
      COUNT(*) FILTER (WHERE status='Em rota')::int em_rota,
      COUNT(*) FILTER (WHERE status='Manutenção')::int manutencao FROM veiculos`),
    pool.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE status='Entregue')::int entregues,
      COUNT(*) FILTER (WHERE status NOT IN ('Entregue','Cancelada'))::int pendentes FROM expedicoes`),
    pool.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE status='Bom')::int bons,
      COUNT(*) FILTER (WHERE status='Recapagem')::int recapagem,
      COUNT(*) FILTER (WHERE status='Crítico')::int criticos FROM pneus`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE status NOT IN ('Concluída','Cancelada'))::int abertas FROM manutencoes`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE status='Aberta')::int abertas FROM ocorrencias`)
  ]);
  res.json({ frota:v.rows[0], expedicoes:e.rows[0], pneus:p.rows[0], manutencoes:m.rows[0], ocorrencias:o.rows[0] });
});

app.get("/api/veiculos", auth, async (req,res) => {
  const r = await pool.query("SELECT * FROM veiculos ORDER BY prefixo");
  res.json(r.rows);
});
app.post("/api/veiculos", auth, async (req,res) => {
  const { prefixo, placa, tipo, modelo, capacidade_kg, km_atual, status, observacao } = req.body;
  if (!prefixo || !tipo) return res.status(400).json({erro:"Prefixo e tipo são obrigatórios."});
  const r = await pool.query(`INSERT INTO veiculos(prefixo,placa,tipo,modelo,capacidade_kg,km_atual,status,observacao)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [prefixo,placa||null,tipo,modelo||null,capacidade_kg||0,km_atual||0,status||"Disponível",observacao||null]);
  res.status(201).json(r.rows[0]);
});
app.put("/api/veiculos/:id", auth, async (req,res) => {
  const { prefixo, placa, tipo, modelo, capacidade_kg, km_atual, status, observacao } = req.body;
  const r = await pool.query(`UPDATE veiculos SET prefixo=$1,placa=$2,tipo=$3,modelo=$4,capacidade_kg=$5,km_atual=$6,status=$7,observacao=$8 WHERE id=$9 RETURNING *`,
    [prefixo,placa||null,tipo,modelo||null,capacidade_kg||0,km_atual||0,status||"Disponível",observacao||null,req.params.id]);
  res.json(r.rows[0]);
});
// EXCLUIR VEÍCULO
app.delete("/api/veiculos/:id", auth, async (req, res) => {
  try {
    const id = req.params.id;
    const veiculo = await pool.query("SELECT * FROM veiculos WHERE id=$1", [id]);
    if (!veiculo.rowCount) return res.status(404).json({ erro: "Veículo não encontrado." });

    await pool.query("DELETE FROM veiculos WHERE id=$1", [id]);
    res.json({ sucesso: true, mensagem: "Veículo excluído com sucesso." });
  } catch (erro) {
    console.error("Erro ao excluir veículo:", erro);
    res.status(500).json({ erro: "Não foi possível excluir o veículo. Verifique se existem registros vinculados." });
  }
});


// ======================================================
// PNEUS - CONSULTA POR VEÍCULO E ALERTAS
// ======================================================
app.get("/api/pneus/veiculo/:prefixo", auth, async (req, res) => {
  try {
    const prefixo = String(req.params.prefixo || "").trim();
    const v = await pool.query(
      `SELECT id,prefixo,placa,tipo,modelo,capacidade_kg,km_atual,status,observacao
       FROM veiculos WHERE prefixo=$1 LIMIT 1`, [prefixo]
    );
    if (!v.rowCount) return res.status(404).json({ erro: "Veículo não encontrado." });

    const p = await pool.query(
      `SELECT id,codigo,veiculo_id,posicao,marca,modelo,sulco_mm,km_pneu,recapagens,custo,status,
              classificacao,acao_sugerida,ultima_inspecao,observacao
       FROM pneus WHERE veiculo_id=$1 ORDER BY id`, [v.rows[0].id]
    );

    const resumo = { total:p.rowCount, bons:0, atencao:0, recapagem:0, criticos:0 };
    for (const pneu of p.rows) {
      const s = String(pneu.status || "").toLowerCase();
      const c = String(pneu.classificacao || "").toLowerCase();
      if (s.includes("crít") || s.includes("crit") || c.includes("crít") || c.includes("crit")) resumo.criticos++;
      else if (s.includes("recap") || c.includes("recap")) resumo.recapagem++;
      else if (s.includes("aten") || c.includes("aten")) resumo.atencao++;
      else resumo.bons++;
    }
    res.json({ veiculo:v.rows[0], resumo, pneus:p.rows });
  } catch (e) {
    console.error("Erro consulta pneus/veículo:", e);
    res.status(500).json({ erro:"Erro ao consultar pneus do veículo." });
  }
});

app.get("/api/pneus-alertas", auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT v.id, v.prefixo, v.placa, v.tipo, v.modelo,
        COUNT(p.id)::int AS total_pneus,
        COUNT(p.id) FILTER (WHERE LOWER(COALESCE(p.status,'')) LIKE '%recap%' OR LOWER(COALESCE(p.classificacao,'')) LIKE '%recap%')::int AS recapagem,
        COUNT(p.id) FILTER (WHERE LOWER(COALESCE(p.status,'')) LIKE '%crít%' OR LOWER(COALESCE(p.status,'')) LIKE '%crit%'
          OR LOWER(COALESCE(p.classificacao,'')) LIKE '%crít%' OR LOWER(COALESCE(p.classificacao,'')) LIKE '%crit%')::int AS criticos
      FROM veiculos v
      JOIN pneus p ON p.veiculo_id=v.id
      GROUP BY v.id,v.prefixo,v.placa,v.tipo,v.modelo
      HAVING COUNT(p.id) FILTER (
        WHERE LOWER(COALESCE(p.status,'')) LIKE '%recap%'
           OR LOWER(COALESCE(p.classificacao,'')) LIKE '%recap%'
           OR LOWER(COALESCE(p.status,'')) LIKE '%crít%'
           OR LOWER(COALESCE(p.status,'')) LIKE '%crit%'
           OR LOWER(COALESCE(p.classificacao,'')) LIKE '%crít%'
           OR LOWER(COALESCE(p.classificacao,'')) LIKE '%crit%'
      ) > 0
      ORDER BY criticos DESC, recapagem DESC, v.prefixo
    `);
    res.json(r.rows);
  } catch (e) {
    console.error("Erro alertas pneus:", e);
    res.status(500).json({ erro:"Erro ao carregar alertas de pneus." });
  }
});


// ======================================================
// PNEUS - EDITAR DADOS
// ======================================================
app.put("/api/pneus/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro:"ID do pneu inválido." });

    const { codigo,posicao,marca,modelo,sulco_mm,km_pneu,recapagens,custo,ultima_inspecao,observacao } = req.body;
    if (!codigo || !String(codigo).trim()) return res.status(400).json({ erro:"O código do pneu é obrigatório." });

    const sulco = sulco_mm === "" || sulco_mm == null ? null : Number(sulco_mm);
    let status = "Bom", classificacao = "BOM", acao_sugerida = "Manter acompanhamento normal";

    // Parâmetro operacional V2.1:
    // >= 7 mm Bom | 5 a 6,99 Atenção | 1 a 4,99 Recapagem | <= 0 Crítico
    if (sulco !== null) {
      if (sulco <= 0) {
        status = "Crítico"; classificacao = "CRÍTICO"; acao_sugerida = "Parar e providenciar troca imediata";
      } else if (sulco < 5) {
        status = "Recapagem"; classificacao = "RECAPAGEM"; acao_sugerida = "Programar retirada, conferência e orçamento";
      } else if (sulco < 7) {
        status = "Atenção"; classificacao = "ATENÇÃO"; acao_sugerida = "Monitorar sulco e programar nova inspeção";
      }
    }

    const r = await pool.query(`
      UPDATE pneus SET codigo=$1,posicao=$2,marca=$3,modelo=$4,sulco_mm=$5,km_pneu=$6,
        recapagens=$7,custo=$8,status=$9,classificacao=$10,acao_sugerida=$11,
        ultima_inspecao=$12,observacao=$13
      WHERE id=$14 RETURNING *
    `, [
      String(codigo).trim(),posicao||null,marca||null,modelo||null,sulco,
      Number(km_pneu||0),Number(recapagens||0),Number(custo||0),
      status,classificacao,acao_sugerida,ultima_inspecao||null,observacao||null,id
    ]);

    if (!r.rowCount) return res.status(404).json({ erro:"Pneu não encontrado." });
    res.json({ sucesso:true, pneu:r.rows[0], classificacao_automatica:{status,classificacao,acao_sugerida} });
  } catch(e) {
    console.error("Erro ao editar pneu:",e);
    if (e.code==="23505") return res.status(400).json({ erro:"Já existe outro pneu com este código." });
    res.status(500).json({ erro:"Não foi possível atualizar o pneu." });
  }
});


// ======================================================
// ORDEM DE SERVIÇO - CONFERÊNCIA, ORÇAMENTO, APROVAÇÃO E CONCLUSÃO
// ======================================================
app.get("/api/veiculos/:prefixo/demandas", auth, async (req,res) => {
  try {
    const v = await pool.query("SELECT * FROM veiculos WHERE prefixo=$1 LIMIT 1",[String(req.params.prefixo).trim()]);
    if (!v.rowCount) return res.status(404).json({erro:"Veículo não encontrado."});
    const id=v.rows[0].id;

    const pneus=await pool.query(`
      SELECT id,codigo,posicao,marca,sulco_mm,status,classificacao,acao_sugerida
      FROM pneus WHERE veiculo_id=$1
        AND (status IN ('Atenção','Recapagem','Crítico') OR classificacao ILIKE '%ATEN%')
      ORDER BY CASE status WHEN 'Crítico' THEN 1 WHEN 'Recapagem' THEN 2 ELSE 3 END, id
    `,[id]);
    const manut=await pool.query(`
      SELECT id,tipo,descricao,vencimento,custo,status FROM manutencoes
      WHERE veiculo_id=$1 AND LOWER(status) NOT IN ('concluída','concluida','finalizada','fechada')
      ORDER BY id DESC
    `,[id]);
    const ocorr=await pool.query(`
      SELECT id,tipo,descricao,status FROM ocorrencias
      WHERE veiculo_id=$1 AND LOWER(status) NOT IN ('concluída','concluida','finalizada','fechada')
      ORDER BY id DESC
    `,[id]);

    res.json({veiculo:v.rows[0],pneus:pneus.rows,manutencoes:manut.rows,ocorrencias:ocorr.rows,
      total:pneus.rowCount+manut.rowCount+ocorr.rowCount});
  } catch(e){console.error(e);res.status(500).json({erro:"Erro ao carregar demandas."});}
});

app.post("/api/ordens-servico/veiculo/:prefixo", auth, async (req,res) => {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const v=await client.query("SELECT * FROM veiculos WHERE prefixo=$1 LIMIT 1",[String(req.params.prefixo).trim()]);
    if(!v.rowCount){await client.query("ROLLBACK");return res.status(404).json({erro:"Veículo não encontrado."});}
    const vid=v.rows[0].id;

    const pneus=await client.query(`
      SELECT id,codigo,posicao,sulco_mm,status,acao_sugerida FROM pneus
      WHERE veiculo_id=$1 AND status IN ('Atenção','Recapagem','Crítico')
      ORDER BY id
    `,[vid]);
    const manut=await client.query(`
      SELECT id,tipo,descricao,custo FROM manutencoes WHERE veiculo_id=$1
      AND LOWER(status) NOT IN ('concluída','concluida','finalizada','fechada') ORDER BY id
    `,[vid]);
    const ocorr=await client.query(`
      SELECT id,tipo,descricao FROM ocorrencias WHERE veiculo_id=$1
      AND LOWER(status) NOT IN ('concluída','concluida','finalizada','fechada') ORDER BY id
    `,[vid]);

    if(!pneus.rowCount&&!manut.rowCount&&!ocorr.rowCount){
      await client.query("ROLLBACK");return res.status(400).json({erro:"Este veículo não possui demandas abertas para gerar O.S."});
    }

    const os=await client.query(`
      INSERT INTO ordens_servico(numero,veiculo_id,status,observacao)
      VALUES(NULL,$1,'Conferência',$2) RETURNING *
    `,[vid,req.body?.observacao||"Ordem gerada a partir das demandas abertas do veículo."]);
    const oid=os.rows[0].id;
    const numero=`OS-${String(oid).padStart(6,"0")}`;
    await client.query("UPDATE ordens_servico SET numero=$1 WHERE id=$2",[numero,oid]);

    for(const p of pneus.rows){
      const prioridade=p.status==="Crítico"?"Crítica":p.status==="Recapagem"?"Alta":"Atenção";
      await client.query(`INSERT INTO ordem_servico_itens(ordem_id,origem,origem_id,descricao,prioridade)
        VALUES($1,'Pneu',$2,$3,$4)`,[oid,p.id,`Pneu ${p.codigo} • ${p.posicao} • Sulco ${p.sulco_mm} mm • ${p.acao_sugerida||p.status}`,prioridade]);
    }
    for(const x of manut.rows){
      await client.query(`INSERT INTO ordem_servico_itens(ordem_id,origem,origem_id,descricao,prioridade,valor_estimado)
        VALUES($1,'Manutenção',$2,$3,'Atenção',$4)`,[oid,x.id,`${x.tipo}: ${x.descricao}`,Number(x.custo||0)]);
    }
    for(const x of ocorr.rows){
      await client.query(`INSERT INTO ordem_servico_itens(ordem_id,origem,origem_id,descricao,prioridade)
        VALUES($1,'Ocorrência',$2,$3,'Atenção')`,[oid,x.id,`${x.tipo}: ${x.descricao}`]);
    }
    await client.query("COMMIT");
    res.json({sucesso:true,id:oid,numero});
  } catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({erro:"Erro ao gerar ordem de serviço."});}
  finally{client.release();}
});


app.get("/api/ordens-servico", auth, async (req,res) => {
  try {
    const r = await pool.query(`
      SELECT os.id,os.numero,os.data_abertura,os.status,os.valor_orcado,os.aprovado_por,
             os.data_aprovacao,os.data_conclusao,os.observacao,os.atualizado_em,
             v.prefixo,v.placa,v.tipo,v.modelo,
             COUNT(osi.id)::int AS total_itens,
             COUNT(osi.id) FILTER (WHERE LOWER(osi.status) IN ('concluído','concluido'))::int AS itens_concluidos,
             COUNT(osi.id) FILTER (WHERE LOWER(osi.status) NOT IN ('concluído','concluido'))::int AS itens_pendentes
      FROM ordens_servico os
      JOIN veiculos v ON v.id=os.veiculo_id
      LEFT JOIN ordem_servico_itens osi ON osi.ordem_id=os.id
      GROUP BY os.id,v.id
      ORDER BY
        CASE WHEN LOWER(os.status) IN ('concluída','concluida') THEN 1 ELSE 0 END,
        os.id DESC
    `);
    res.json(r.rows);
  } catch(e) {
    console.error("Erro ao listar O.S.:",e);
    res.status(500).json({erro:"Erro ao carregar acompanhamento das Ordens de Serviço."});
  }
});

app.get("/api/ordens-servico/veiculo/:prefixo", auth, async (req,res) => {
  try {
    const r=await pool.query(`
      SELECT os.*,v.prefixo,v.placa FROM ordens_servico os JOIN veiculos v ON v.id=os.veiculo_id
      WHERE v.prefixo=$1 ORDER BY os.id DESC
    `,[String(req.params.prefixo).trim()]);
    res.json(r.rows);
  }catch(e){res.status(500).json({erro:"Erro ao listar ordens de serviço."});}
});

app.get("/api/ordens-servico/:id", auth, async (req,res) => {
  try {
    const os=await pool.query(`SELECT os.*,v.prefixo,v.placa,v.tipo,v.modelo FROM ordens_servico os
      JOIN veiculos v ON v.id=os.veiculo_id WHERE os.id=$1`,[req.params.id]);
    if(!os.rowCount)return res.status(404).json({erro:"O.S. não encontrada."});
    const itens=await pool.query("SELECT * FROM ordem_servico_itens WHERE ordem_id=$1 ORDER BY id",[req.params.id]);
    res.json({ordem:os.rows[0],itens:itens.rows});
  }catch(e){res.status(500).json({erro:"Erro ao abrir ordem de serviço."});}
});

app.put("/api/ordens-servico/:id", auth, async (req,res) => {
  try {
    const {status,valor_orcado,observacao,aprovado_por}=req.body;
    const atual=await pool.query("SELECT * FROM ordens_servico WHERE id=$1",[req.params.id]);
    if(!atual.rowCount)return res.status(404).json({erro:"O.S. não encontrada."});
    const novoStatus=status||atual.rows[0].status;
    const aprovacao=novoStatus==="Aprovada" ? "NOW()" : "data_aprovacao";
    const conclusao=novoStatus==="Concluída" ? "NOW()" : "data_conclusao";
    const r=await pool.query(`
      UPDATE ordens_servico SET status=$1,valor_orcado=$2,observacao=$3,aprovado_por=$4,
        data_aprovacao=${aprovacao},data_conclusao=${conclusao},atualizado_em=NOW()
      WHERE id=$5 RETURNING *
    `,[novoStatus,Number(valor_orcado??atual.rows[0].valor_orcado??0),observacao??atual.rows[0].observacao,
       aprovado_por??atual.rows[0].aprovado_por,req.params.id]);
    if(novoStatus==="Concluída"){
      await pool.query("UPDATE ordem_servico_itens SET status='Concluído' WHERE ordem_id=$1",[req.params.id]);
    }
    res.json({sucesso:true,ordem:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({erro:"Erro ao atualizar O.S."});}
});

app.put("/api/ordens-servico-itens/:id", auth, async (req,res) => {
  try{
    const {valor_estimado,status,observacao}=req.body;
    const r=await pool.query(`UPDATE ordem_servico_itens SET
      valor_estimado=COALESCE($1,valor_estimado),status=COALESCE($2,status),observacao=COALESCE($3,observacao)
      WHERE id=$4 RETURNING *`,
      [valor_estimado===""?null:valor_estimado,status||null,observacao||null,req.params.id]);
    if(!r.rowCount)return res.status(404).json({erro:"Item não encontrado."});
    const soma=await pool.query(`SELECT COALESCE(SUM(valor_estimado),0) total FROM ordem_servico_itens WHERE ordem_id=$1`,[r.rows[0].ordem_id]);
    await pool.query("UPDATE ordens_servico SET valor_orcado=$1,atualizado_em=NOW() WHERE id=$2",[soma.rows[0].total,r.rows[0].ordem_id]);
    res.json({sucesso:true,item:r.rows[0],total:soma.rows[0].total});
  }catch(e){res.status(500).json({erro:"Erro ao atualizar item da O.S."});}
});


// ======================================================
// MANUTENÇÃO V2.3 - histórico, custos e rankings
// ======================================================
app.get("/api/manutencao/dashboard", auth, async (req,res) => {
  try {
    const inicio=req.query.inicio||null, fim=req.query.fim||null, prefixo=req.query.prefixo||null;
    const params=[]; const where=["1=1"];
    if(inicio){params.push(inicio);where.push(`COALESCE(data_emissao,data_abertura) >= $${params.length}`)}
    if(fim){params.push(fim);where.push(`COALESCE(data_emissao,data_abertura) <= $${params.length}`)}
    if(prefixo){params.push(prefixo);where.push(`COALESCE(veiculo_prefixo,(SELECT prefixo FROM veiculos WHERE id=manutencoes.veiculo_id)) = $${params.length}`)}
    const w=where.join(" AND ");

    const hist=await pool.query(`SELECT m.*,COALESCE(m.veiculo_prefixo,v.prefixo) prefixo
      FROM manutencoes m LEFT JOIN veiculos v ON v.id=m.veiculo_id WHERE ${w}
      ORDER BY COALESCE(m.data_emissao,m.data_abertura) DESC,m.id DESC`,params);

    const total=hist.rows.reduce((s,x)=>s+Number(x.custo||0),0);
    const servicos={}, empresas={}, veiculos={};
    for(const x of hist.rows){
      const sv=x.sistema||x.servico||x.tipo||"Não informado";
      const ep=x.empresa||"Não informado";
      const vp=x.prefixo||"Sem veículo";
      servicos[sv]=(servicos[sv]||0)+1;
      empresas[ep]=(empresas[ep]||0)+1;
      veiculos[vp]=(veiculos[vp]||0)+Number(x.custo||0);
    }
    const rank=o=>Object.entries(o).map(([nome,valor])=>({nome,valor})).sort((a,b)=>b.valor-a.valor);
    res.json({total_registros:hist.rowCount,total_gasto:total,
      ticket_medio:hist.rowCount?total/hist.rowCount:0,
      servicos:rank(servicos),empresas:rank(empresas),gasto_veiculos:rank(veiculos),historico:hist.rows});
  }catch(e){console.error(e);res.status(500).json({erro:"Erro ao carregar painel de manutenção."})}
});

app.get("/api/manutencao/veiculos", auth, async (req,res) => {
  try{
    const r=await pool.query(`
      SELECT prefixo,MAX(placa) placa,COUNT(*)::int registros,SUM(custo)::numeric total
      FROM (
        SELECT COALESCE(m.veiculo_prefixo,v.prefixo) prefixo,v.placa,m.custo
        FROM manutencoes m LEFT JOIN veiculos v ON v.id=m.veiculo_id
      ) x WHERE prefixo IS NOT NULL GROUP BY prefixo ORDER BY prefixo`);
    res.json(r.rows);
  }catch(e){res.status(500).json({erro:"Erro ao listar veículos da manutenção."})}
});

app.post("/api/manutencoes", auth, async (req,res) => {
  try{
    const {prefixo,servico,descricao,sistema,local,nota_fiscal,data_emissao,produto,custo,fornecedor_codigo,empresa,status}=req.body;
    if(!prefixo||!descricao)return res.status(400).json({erro:"Veículo e descrição são obrigatórios."});
    const v=await pool.query("SELECT id FROM veiculos WHERE prefixo=$1 LIMIT 1",[String(prefixo).trim()]);
    const r=await pool.query(`INSERT INTO manutencoes
      (veiculo_id,veiculo_prefixo,tipo,servico,descricao,sistema,local,nota_fiscal,data_emissao,produto,custo,fornecedor_codigo,empresa,status,data_abertura)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($9,CURRENT_DATE)) RETURNING *`,
      [v.rowCount?v.rows[0].id:null,String(prefixo).trim(),servico||"MANUTENÇÃO",servico||"MANUTENÇÃO",descricao,
       sistema||null,local||null,nota_fiscal||null,data_emissao||null,produto||null,Number(custo||0),
       fornecedor_codigo||null,empresa||null,status||"Concluída"]);
    res.json({sucesso:true,manutencao:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({erro:"Erro ao registrar manutenção."})}
});

app.get("/api/:recurso", auth, async (req,res,next) => {
  const allowed = ["colaboradores","expedicoes","pneus","manutencoes","abastecimentos","ocorrencias","checklists"];
  if (!allowed.includes(req.params.recurso)) return next();
  const r = await pool.query(`SELECT * FROM ${req.params.recurso} ORDER BY id DESC LIMIT 200`);
  res.json(r.rows);
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});



const HISTORICO_MANUTENCAO_V23 = [{"mes": "JUNHO", "prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13361", "data_emissao": "2026-06-03", "produto": "BOTAO REDUÇÃO,COLA TREEBND,JUNTA CARTER, OLEO MOTOR MAN COLA 3M JUNTA TAMPA MAN 6CIL", "valor": 1269.14, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5043", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "26235", "data_emissao": "2026-06-03", "produto": "SERVIÇO DE VAZAMENTO NO MOTOR", "valor": 600.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5019", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "13405", "data_emissao": "2026-06-04", "produto": "SUPORTE BOMBA DE COMBUSTIVEL", "valor": 965.13, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "13369", "data_emissao": "2026-06-08", "produto": "COLA TREBOND, JUNTA TURBINA RETORNO, TUDO LUBRIFICADO", "valor": 289.61, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5009", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26243", "data_emissao": "2026-06-08", "produto": "SERVIÇO DIVERSOS", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5016", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "49229", "data_emissao": "2026-06-10", "produto": "FAROL FW 112 LD E FAROL FW 112 LE", "valor": 388.0, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5041", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "INTERNO", "nota_fiscal": "188220", "data_emissao": "2026-06-11", "produto": "BATERIA M150BD MGE SLI", "valor": 972.73, "fornecedor_codigo": "-", "empresa": "CODIBA C. DISTRIB"}, {"mes": "JUNHO", "prefixo": "5043", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "INTERNO", "nota_fiscal": "188220", "data_emissao": "2026-06-11", "produto": "BATERIA M150BD MGE SLI", "valor": 1945.46, "fornecedor_codigo": "-", "empresa": "CODIBA C. DISTRIB"}, {"mes": "JUNHO", "prefixo": "5041", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26954", "data_emissao": "2026-06-11", "produto": "ENSAIO E SELAGEM DE TACOGRAFO", "valor": 302.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO"}, {"mes": "JUNHO", "prefixo": "5001", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 396.3225, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"mes": "JUNHO", "prefixo": "5002", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 528.43, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"mes": "JUNHO", "prefixo": "5038", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 528.43, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"mes": "JUNHO", "prefixo": "5039", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 528.43, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"mes": "JUNHO", "prefixo": "5017", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 660.5374999999999, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"mes": "JUNHO", "prefixo": "5025", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 528.43, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"mes": "JUNHO", "prefixo": "5001", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "INTERNO", "nota_fiscal": "188569", "data_emissao": "2026-06-19", "produto": "BATERIA M100 HE MGE3 SLI", "valor": 811.46, "fornecedor_codigo": "-", "empresa": "CODIBA C. DISTRIB"}, {"mes": "JUNHO", "prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "11186", "data_emissao": "2026-06-22", "produto": "BOLSA DE AR", "valor": 599.61, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"mes": "JUNHO", "prefixo": "5041", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26637", "data_emissao": "2026-06-22", "produto": "ROMOÇÃO E INSTALAÇÃO DA BOLDA DE AR", "valor": 150.0, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"mes": "JUNHO", "prefixo": "5016", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26271", "data_emissao": "2026-06-24", "produto": "SERVIÇO DIVERSOS", "valor": 230.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5015", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "261029", "data_emissao": "2026-06-24", "produto": "ENSAIO E SELAGEM DE TACOGRAFO, RECUPERAÇÃO DE RELOGIO", "valor": 432.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO"}, {"mes": "JUNHO", "prefixo": "5017", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "301140", "data_emissao": "2026-06-25", "produto": "FILTRO DE AR E FILTRO DIESEL", "valor": 128.42, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"mes": "JUNHO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13406", "data_emissao": "2026-06-26", "produto": "HELICE MOTOR", "valor": 290.12, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 333.9, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5017", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 437.5, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5001", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 341.1, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5038", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 453.6, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5039", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 482.4, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5025", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 481.5, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JUNHO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "301324", "data_emissao": "2026-06-29", "produto": "BOIA TANQUE", "valor": 180.037, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"mes": "JUNHO", "prefixo": "5021", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "23082", "data_emissao": "2026-06-30", "produto": "PARAFUSO+LENTE TRAZ", "valor": 51.84, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JUNHO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23083", "data_emissao": "2026-06-30", "produto": "MAÇANETA+PALHETA+SOQUETE ", "valor": 126.0, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JUNHO", "prefixo": "5043", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "23081", "data_emissao": "2026-06-30", "produto": "9 FUZIVEIS 5,10,15", "valor": 9.72, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JUNHO", "prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23084", "data_emissao": "2026-06-30", "produto": "FRANGER RODOAR+CALOTA RODOAR+ARRUELA+ABRAÇADEIRA+PALHETA+MANGUEIRA", "valor": 374.76, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5009", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "301547", "data_emissao": "2026-07-02", "produto": "VARETA DE OLEO 7100", "valor": 50.0, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"mes": "JULHO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "SISTEMA DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "13418", "data_emissao": "2026-07-01", "produto": "OLEO HIDRAULICO+FILTRO HIDRAULICO+BOMBA HIDRAULICO", "valor": 1476.32, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26282", "data_emissao": "2026-07-01", "produto": "SERVIÇO DE BOMBA HIDRULICA", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26636", "data_emissao": "2026-07-01", "produto": "SERVIÇO DE INSTAÇÃO DE LIMPADORES", "valor": 80.0, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "26134", "data_emissao": "2026-07-10", "produto": "BOMBA INJETORA+BICOS+SERVIÇOS", "valor": 4217.4, "fornecedor_codigo": "5081", "empresa": "BRASIL DIESEL"}, {"mes": "JULHO", "prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "13431", "data_emissao": "2026-07-09", "produto": "BUCHA SUPORTE + GUARDA PO +  COLA SILICONE + RETENTOR TRAMBULADOR + TERMINAL", "valor": 301.52, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26291", "data_emissao": "2026-07-09", "produto": "REVISÃO DO TRAMBULADOR", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "13430", "data_emissao": "2026-07-09", "produto": "PINO CABINE+LAMPADA 1 POLO+JUNTA RESFRIADOR+JUNTA TUCHO+REPARO BOMBA+COLUNA DIREÇÃO+JUNTA TURBINA( P ) + JUNTA TURBINA ( G )+JUNTATURBNA +COXIM CABINE WORK", "valor": 939.8, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26290", "data_emissao": "2026-07-09", "produto": "SERVIÇO DE BOMBA+SUSPENÇÃO+CABNE+VAZAMENTO+COLUNA DE DIREÇÃO+REFICA CLUNA", "valor": 1350.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "13429", "data_emissao": "2026-07-09", "produto": "REPARO DE VALVULA DE PRESSAO +REPARO DE VALVULA+REPARO DE VALVULA DE PEDAL", "valor": 269.98, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26289", "data_emissao": "2026-07-09", "produto": "REVISÃO PARC DE SISTEMA DE AR ", "valor": 400.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5039", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13432", "data_emissao": "2026-07-09", "produto": "ROLAMENTO DE ALT+ESTATR ALTERNADOR+BOIA COMBUTIVEL+RETIFICADOR ALT", "valor": 990.42, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5025", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13449", "data_emissao": "2026-07-14", "produto": "CINTA PLASTICA+CHICOTE DE REDUÇÃO+CORREIA ALTERNADOR+ SUPORTE DO ALTERNADOR", "valor": 505.95, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5025", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "13449", "data_emissao": "2026-07-14", "produto": "SERVIÇO DE CINTA PLASTICA+CHICOTE DE REDUÇÃO+CORREIA ALTERNADOR+ SUPORTE DO ALTERNADOR", "valor": 650.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "13448", "data_emissao": "2026-07-14", "produto": "OLEO DE FREIO DOT 4 500ML +CILINDRO DE EMBREAGEM+CILINDRO BEM AUX", "valor": 365.09, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "13448", "data_emissao": "2026-07-14", "produto": "SERVIÇOS DIVERSOS", "valor": 200.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5038", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "302830", "data_emissao": "2026-07-21", "produto": "MOTOR DE PARTIDA 24V 5KM", "valor": 1671.0, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"mes": "JULHO", "prefixo": "5031", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "12345", "data_emissao": "2026-07-21", "produto": "ORING", "valor": 96.0, "fornecedor_codigo": "-", "empresa": "RAIZ"}, {"mes": "JULHO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "303013", "data_emissao": "2026-07-23", "produto": "ADITIVO ANTICORROSIVO+BRONZINA BIELA+BRONZINA MANCAL+FILTRO LUBRIFICANTE+ JG JUNTA DO MOTOR+LIT CILINDRO+OLEO MOTOR", "valor": 3603.06, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"mes": "JULHO", "prefixo": "5031", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "50984", "data_emissao": "2026-07-23", "produto": "FILTRO DE AR E FILTRO DIESEL", "valor": 90.0, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5003", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "50983", "data_emissao": "2026-07-23", "produto": "FILTRO DE AR+LIBRIFICANTE+SENDIMETAR+SEP AGUA+COMBUSTIVEL.", "valor": 314.9, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "13488", "data_emissao": "2026-07-27", "produto": "PASTILHA DE IGNIÇÃO+BUCHA DO VOLANTE+CILINDRO IN + TRAVA DA DIREÇÃO + TOMADA ELETRICA + PRESILHA + CHAVE DE SETA + ROLAMENTO COLUNA DE DIREÇÃO + ARRUELA TRAVA COLUNA DE DIREÇÃO", "valor": 1017.08, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26329", "data_emissao": "2026-07-27", "produto": "RETIFICA COLUNA DIREÇÃO + SERVIÇO DESMONTAGEM DA COLUNA DE DIREÇÃO+", "valor": 750.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5009", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "13487", "data_emissao": "2026-07-27", "produto": "FLEXIVEL PRESSAO DE AR + VALVULA DISTRIBUIÇÃO", "valor": 624.82, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5009", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26327", "data_emissao": "2026-07-27", "produto": "REVISÃO SISTEMA DE AR", "valor": 450.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5038", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ARREFECIMENTO", "local": "EXTERNO", "nota_fiscal": "13489", "data_emissao": "2026-07-27", "produto": "RESERVATORIO AGUA+TUBO AGUA+COLA TREBOND+CINTA PLASTICA+LIT ABRAÇADEIRAS", "valor": 823.5, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5038", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26328", "data_emissao": "2026-07-27", "produto": "SERVIÇOS DIVERSOS", "valor": 650.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5019", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "13492", "data_emissao": "2026-07-27", "produto": "ALAVANCA MUDANÇA DE MACHA+CHAVE DE SETA", "valor": 1090.29, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5019", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26332", "data_emissao": "2026-07-27", "produto": "SERVIÇO DE ACIONAMENTO DE ENGATE+REVISAO DE INSTALAÇAO ELETRICA", "valor": 350.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ARREFECIMENTO", "local": "EXTERNO", "nota_fiscal": "13502", "data_emissao": "2026-07-29", "produto": "ABRAÇADEIRA FITA +KIT MANGUEIRA+RESERVATORIO AGUA", "valor": 663.51, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26345", "data_emissao": "2026-07-29", "produto": "REVISÃO NO SISTEMA DE ARREFECIMENTO", "valor": 650.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5033", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26230", "data_emissao": "2026-07-30", "produto": "SERVIÇO DE RECUPERAÇÃO DA FERRAEM DE PARA CHOQUE", "valor": 800.0, "fornecedor_codigo": "-", "empresa": "OFICINA UNIÃO"}, {"mes": "JULHO", "prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13505", "data_emissao": "2026-07-30", "produto": "FILTRO RACOR+ABRACADEIRA", "valor": 317.23, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26348", "data_emissao": "2026-07-30", "produto": "REVISAR SISTEMA INTERCULAR", "valor": 100.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5009", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "13504", "data_emissao": "2026-07-30", "produto": "PONTEIRA TRANSMISSAO+LUVA TRANS+ROLAMENTO CARDAN+PINO CABINE+COXIM CABINE+BUCHA ESTABLIZADOR+CUPILHA MANGA EIXO DT+CUPILA MANGA EXIDO DT +DESENGRIPANTE + GRAXA ROLAMENTO+COLA SILICOLE+ ROLAMENTO RODA DT P+ROLAMENTO RODA DT G + RETENTOR RODA DT +JG EMBUCHAMENTO+JGARRUELA AJUSTE+KIT PARAFUSO+ BORRACHA EST+BUCHA ESTABILIZADORA DT", "valor": 2236.66, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5009", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26347", "data_emissao": "2026-07-30", "produto": "SERVIÇO DE SUSPENÇÃO CABINE+ SERVIÇO DE RETFICA DE SUSPENÇÃO+RECUPERAR PONTA DE EIXO+ SERVIÇO EMBUCHAMENTO+ RETIFICA TRANSMISSÃO+ SERVIÇO DE ESTABILIZADOR+", "valor": 1950.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "JULHO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "", "local": "EXTERNO", "nota_fiscal": "303507", "data_emissao": "2026-07-30", "produto": "BOMBA AGUA MOTOR+JUNTA TAMPA+RETENTOR DA TAMPA", "valor": 571.89, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"mes": "JULHO", "prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23763", "data_emissao": "2026-07-31", "produto": "BOTÃO DE ACIONAMENTO DE VIDRO SIMPLES  + BOTÃO DE ACIONAMENTO DE VIDRO DUPLO ", "valor": 317.23, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23766", "data_emissao": "2026-07-31", "produto": "LAMPADA H1 + LAMPADA PINGO + ABRAÇADEIRA FITA 30 CM + VALVULA SOLENOIDE 12 V + BOTÃO PARTIDA UNIVERSAL + LAMPADA PINGO D AGUA + INTERRUPITOR FAROL + ESTIRANTE DO BANCO", "valor": 600.57, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5043", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23765", "data_emissao": "2026-07-31", "produto": "MAÇANETA+ LATERNA+SOQUETE", "valor": 249.3, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5043", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26720", "data_emissao": "2026-07-31", "produto": "SERVIÇO DE PORTA L/E", "valor": 40.0, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5033", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23764", "data_emissao": "2026-07-31", "produto": "LENTE SETA+ SOQUETE PAINEL+ LAMPADA + LENTE SETA+FAIXA REFLETIVA LE+ FAIXA REFLETIVA LD", "valor": 106.92, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23762", "data_emissao": "2026-07-31", "produto": "ESPELHO AVULSO ", "valor": 89.1, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "JULHO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "303663", "data_emissao": "2026-07-31", "produto": "FAROL  DUPLO HALOGE LE ", "valor": 194.76, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"mes": "JULHO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "1464964", "data_emissao": "2026-07-31", "produto": "PARA CHOQUE LD PARA CHOQUE LE PARA CHOQUE CENTRO", "valor": 1983.0, "fornecedor_codigo": "-", "empresa": "REDIESEL"}, {"mes": "JULHO", "prefixo": "5033", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "1464964", "data_emissao": "2026-07-31", "produto": "ESTRIBO", "valor": 241.0, "fornecedor_codigo": "-", "empresa": "REDIESEL"}, {"mes": "JULHO", "prefixo": "5009", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "261854", "data_emissao": "2026-07-31", "produto": "BALACEAMENTO + ALINHAMENTO", "valor": 200.0, "fornecedor_codigo": "-", "empresa": "PNEUTEX"}, {"mes": "AGOSTO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "INTERNO", "nota_fiscal": "504187", "data_emissao": "2026-08-01", "produto": "PORCAS + PARAFUSOS+ ARRUELA+FERRO DE SOLDA", "valor": 100.75, "fornecedor_codigo": "-", "empresa": "CENTPAR "}, {"mes": "AGOSTO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "31511", "data_emissao": "2026-08-03", "produto": "ROLAMENTO DO CENTRO+SUPORTE TRANSMISSAO+LAMPADA+SOQUETE DO FAROL+KIT EMBUCHAMENTO", "valor": 470.85, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "1467885", "data_emissao": "2026-08-05", "produto": "FILTRO DE COMBUSTIVEL COMPLETO", "valor": 1078.0, "fornecedor_codigo": "-", "empresa": "REDIESEL"}, {"mes": "AGOSTO", "prefixo": "5042", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "11317", "data_emissao": "2026-08-10", "produto": "BOLSA DE AR SUPORTE DE ENCAIXE", "valor": 598.0, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"mes": "AGOSTO", "prefixo": "5042", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26763", "data_emissao": "2026-08-10", "produto": "REMOCAO E INSTALAÇAO DE BOLDA DE AR", "valor": 150.0, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"mes": "AGOSTO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "9000", "data_emissao": "2026-08-11", "produto": "REPARO+ JUNTA FRANGE+ARRUELA ALUMINIO+ASSENTO DE BICO+ BOMBA ALIMENTADORA+BICO INJETOR+BUJAO ROSCADO+PISTAO AVANÇO+CARCARA BBA+ABRAÇADEIRA MENOR+DISCO INTERMEDIARIO+PINO DE PRESSAO+ PORCA BICO+PARAFUSO DE RETENTOR", "valor": 4266.71, "fornecedor_codigo": "974", "empresa": "HIDRAUDIESEL SERVIÇOS"}, {"mes": "AGOSTO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "150", "data_emissao": "2026-08-11", "produto": "MAO DE OBRA DE BICOS INJETORES E MOTOR", "valor": 1079.29, "fornecedor_codigo": "974", "empresa": "HIDRAUDIESEL SERVIÇOS"}, {"mes": "AGOSTO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ARREFECIMENTO", "local": "EXTERNO", "nota_fiscal": "13537", "data_emissao": "2026-08-12", "produto": "ANTICORROSIVO+RESERVATORIO DE AGUA+KIT ABRAÇADEIRA+ CUPILHA MANA DE EIXO", "valor": 420.56, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26373", "data_emissao": "2026-08-12", "produto": "REVISAO DO SOSTEMA DE ARREFECIMENTO , RADIADOR", "valor": 750.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13536", "data_emissao": "2026-08-12", "produto": "ABRAÇADEIRA CANO INJETOR+ FILTRO DE COMBUSTIVEIS+PRESILHA CABO ACELERADOR", "valor": 154.6, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "260372", "data_emissao": "2026-08-12", "produto": "REVISÃO DE INJEÇÃO ", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5031", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "13545", "data_emissao": "2026-08-13", "produto": "OLEO DE FREIO+ SAPATA C/LONA+PRESILHA PASTILHA+CILINDRO RODA+ PASTILHA DE FREIO.", "valor": 813.3, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5031", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26380", "data_emissao": "2026-08-13", "produto": "REVISAO DE FREIOS ", "valor": 300.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "52018", "data_emissao": "2026-08-18", "produto": "FILTRO DE COMBUSTIVEL + SIRENE RE", "valor": 154.8, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5003", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "52018", "data_emissao": "2026-08-18", "produto": "FILTRO DE COMBUSTIVEL", "valor": 18.9, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5043", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "52018", "data_emissao": "2026-08-18", "produto": "FILTRO SEDIMENTADOR + FILTRO LUBRIFICANTE", "valor": 198.0, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5029", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13552", "data_emissao": "2026-08-18", "produto": "VALVULA SOLENOIDE BOSH", "valor": 283.32, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5019", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "11346", "data_emissao": "2026-08-20", "produto": "BOLSA DE AR SUSPENSOR DE ENCAIXE GRADE", "valor": 589.0, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"mes": "AGOSTO", "prefixo": "5019", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26790", "data_emissao": "2026-08-20", "produto": "REMOCAO E INSTALAÇAO DE BOLDA DE AR", "valor": 150.0, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"mes": "AGOSTO", "prefixo": "5037", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "5189", "data_emissao": "2026-08-19", "produto": "ADITIVO RADIADOR+AUA DESTILADA+DESCARBONIZANTE+FLUIDO DE FREIO+ LIMPA FREIO+LONA DE FREIO TRASEIRO+REERVATORIO DE EXPANSÃO+TAMPA RESERVATORIO", "valor": 680.0, "fornecedor_codigo": "-", "empresa": "J DE SA LTDA"}, {"mes": "AGOSTO", "prefixo": "5037", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "41", "data_emissao": "2026-08-19", "produto": "SERVIÇOS DIVERSOS", "valor": 1710.0, "fornecedor_codigo": "-", "empresa": "J DE SA LTDA"}, {"mes": "AGOSTO", "prefixo": "5039", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13565", "data_emissao": "2026-08-20", "produto": "SLENOIDE PARTIDA+ CHICOTE COMUTADOR+COMUTADOR DE PARTIDA+CHAVE DE LIMPADOR+ CHAVE DE SETA+FLANGE BUZINA+ RELE PARTIDA+ ABRACADEIRA", "valor": 1236.51, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5039", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26392", "data_emissao": "2026-08-20", "produto": "SERVIÇO DE MOTOR DE PARTIDA", "valor": 400.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13562", "data_emissao": "2026-08-19", "produto": "KIT VEDAÇÃO+ ORING CAVALETE+ ANEL TOMBAK+ COLA 3M+ COLA TRENBOND+ KIT MOTOR+ ANEL VEDAÇÃO CAMISA+JG DE JUNTA MOTOR+ BRONZINA BIELA+ OLEO MOTOR+FILTRO LUB", "valor": 6754.05, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26389", "data_emissao": "2026-08-19", "produto": "SERVIÇO DE MOTOR + REVISAO DO SISTEMA DE ARREFECIMENTO+ ENVARETAMENTO", "valor": 3500.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"mes": "AGOSTO", "prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "BANCOS", "local": "EXTERNO", "nota_fiscal": "51", "data_emissao": "2026-08-26", "produto": "REFORMA DE BANCO DE CAMINHAO", "valor": 1300.0, "fornecedor_codigo": "-", "empresa": "FRANCISCO .A . DE .S. FILHO"}, {"mes": "AGOSTO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "1452", "data_emissao": "2026-08-03", "produto": "MANGUEIRA E ANEL DE VEDAÇÃO", "valor": 450.0, "fornecedor_codigo": "5081", "empresa": "BRASIL DIESEL"}, {"mes": "AGOSTO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "26308", "data_emissao": "2026-08-03", "produto": "SERVIÇO E RETIFICA DE CABEÇOTE", "valor": 2300.0, "fornecedor_codigo": "5081", "empresa": "BRASIL DIESEL"}, {"mes": "AGOSTO", "prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "26309", "data_emissao": "2026-08-03", "produto": "SERVIÇO DE MAO DE OBRA ", "valor": 1300.0, "fornecedor_codigo": "5081", "empresa": "BRASIL DIESEL"}, {"mes": "SETEMBRO", "prefixo": "5019", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "PNEUS", "local": "EXTERNO", "nota_fiscal": "24469", "data_emissao": "2026-09-01", "produto": "CALOTA RODOAR TACO-AR C/REFLETIVO+CALOTA RODOAR TACO-AR C/REFLETIVO TOP LINE L/E", "valor": 183.6, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "SETEMBRO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "24470", "data_emissao": "2026-09-01", "produto": "LAMPADA H1+SOQUETE FAROL+FITA ISOLANTE+CICHOTE ELET+LAMPADA PINGO+PRESILHA FORRO+ LAMPADA 1034 +LAMPADA 1141+RELE PISCA+ ABRAÇADEIRA FITA+ CILINDRO IGNIÇÃO+ PORCA CARROCERIA+ PORCA CARROCERIA+TORNEIRA P/COROTE", "valor": 519.21, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"mes": "SETEMBRO", "prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26833", "data_emissao": "2026-09-01", "produto": "SERVIÇO ELETRICO / BUZINA E TOCA DE INIÇÃO", "valor": 100.0, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}];

async function importarHistoricoManutencaoV23() {
  const ja=await pool.query("SELECT valor FROM sistema_config WHERE chave='historico_manutencao_v23'");
  if(ja.rowCount) return;
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    for(const x of HISTORICO_MANUTENCAO_V23) {
      const v=await c.query("SELECT id FROM veiculos WHERE prefixo=$1 LIMIT 1",[x.prefixo]);
      await c.query(`INSERT INTO manutencoes
        (veiculo_id,veiculo_prefixo,tipo,servico,descricao,sistema,local,nota_fiscal,data_emissao,produto,custo,fornecedor_codigo,empresa,status,data_abertura,mes,origem_importacao)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Concluída',COALESCE($9,CURRENT_DATE),$14,'PLANILHA_MANUTENCAO_2026')`,
        [v.rowCount?v.rows[0].id:null,x.prefixo,x.servico||"MANUTENÇÃO",x.servico,x.descricao,x.sistema,x.local,x.nota_fiscal,x.data_emissao,x.produto,x.valor,x.fornecedor_codigo,x.empresa,x.mes]);
    }
    await c.query("INSERT INTO sistema_config(chave,valor) VALUES('historico_manutencao_v23',$1)",[String(HISTORICO_MANUTENCAO_V23.length)]);
    await c.query("COMMIT");
    console.log(`Histórico de manutenção V2.3 importado: ${HISTORICO_MANUTENCAO_V23.length} registros.`);
  } catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

async function importarDadosIniciaisUmaVez() {
  const ja = await pool.query("SELECT valor FROM sistema_config WHERE chave='carga_inicial_v1'");
  if (ja.rowCount) {
    console.log("Carga inicial já registrada; preservando alterações manuais.");
    return;
  }

  // Se o banco já possui os dados da frota/pneus, apenas registra a migração.
  const existentes = await pool.query("SELECT COUNT(*)::int AS total FROM pneus");
  if (Number(existentes.rows[0].total) > 0) {
    await pool.query(
      "INSERT INTO sistema_config(chave,valor) VALUES('carga_inicial_v1','existente') ON CONFLICT (chave) DO NOTHING"
    );
    console.log("Banco existente detectado; carga inicial não será reaplicada.");
    return;
  }

  await importarDadosIniciais();
  await pool.query(
    "INSERT INTO sistema_config(chave,valor) VALUES('carga_inicial_v1','concluida') ON CONFLICT (chave) DO NOTHING"
  );
}

initDatabase()
  .then(importarDadosIniciaisUmaVez)
  .then(importarHistoricoManutencaoV23)
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Gestão-Frota online na porta ${PORT}`)))
  .catch(err => { console.error("Falha ao iniciar banco:", err); process.exit(1); });
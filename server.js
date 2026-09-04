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

app.get("/api/:recurso", auth, async (req,res,next) => {
  const allowed = ["colaboradores","expedicoes","pneus","manutencoes","abastecimentos","ocorrencias","checklists"];
  if (!allowed.includes(req.params.recurso)) return next();
  const r = await pool.query(`SELECT * FROM ${req.params.recurso} ORDER BY id DESC LIMIT 200`);
  res.json(r.rows);
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDatabase()
  .then(importarDadosIniciais)
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Gestão-Frota online na porta ${PORT}`)))
  .catch(err => { console.error("Falha ao iniciar banco:", err); process.exit(1); });
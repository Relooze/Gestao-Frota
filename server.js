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


async function migrarFinalizacaoOS(){
  await pool.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMP`);
  await pool.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS finalizado_por INTEGER`);
  await pool.query(`ALTER TABLE chamados ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMP`);
  await pool.query(`ALTER TABLE chamados ADD COLUMN IF NOT EXISTS finalizado_por INTEGER`);
}

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



    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS ano VARCHAR(20);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS funcao VARCHAR(100);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS categoria VARCHAR(30) DEFAULT 'CAMINHAO';
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


    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL;

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


  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT FALSE;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_alterada_em TIMESTAMPTZ;


    CREATE TABLE IF NOT EXISTS motorista_veiculo_dia (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      data_operacao DATE NOT NULL DEFAULT CURRENT_DATE,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(usuario_id,data_operacao)
    );

    CREATE TABLE IF NOT EXISTS chamados (
      id SERIAL PRIMARY KEY,
      numero VARCHAR(30) UNIQUE,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
      titulo VARCHAR(180) NOT NULL,
      descricao TEXT NOT NULL,
      localizacao VARCHAR(255),
      prioridade VARCHAR(30) DEFAULT 'Normal',
      status VARCHAR(40) DEFAULT 'Aberto',
      supervisor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      resposta_supervisor TEXT,
      ordem_servico_id INTEGER,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE checklists ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
    ALTER TABLE checklists ADD COLUMN IF NOT EXISTS data_checklist DATE DEFAULT CURRENT_DATE;
    ALTER TABLE checklists ADD COLUMN IF NOT EXISTS status_tratamento VARCHAR(30) DEFAULT 'Pendente';
    ALTER TABLE checklists ADD COLUMN IF NOT EXISTS tratado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
    ALTER TABLE checklists ADD COLUMN IF NOT EXISTS tratado_em TIMESTAMPTZ;
    ALTER TABLE checklists ADD COLUMN IF NOT EXISTS ordem_servico_id INTEGER;
  `);

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


// ======================================================
// V2.8 - SEGURANÇA REAL DO PERFIL MOTORISTA
// Bloqueia APIs administrativas, mesmo por URL direta.
// ======================================================
app.use("/api", (req,res,next)=>{
  try{
    const token=tokenFrom(req);
    if(!token) return next();
    const u=jwt.verify(token,JWT_SECRET);
    if(String(u.perfil||"").toLowerCase()!=="motorista") return next();

    const p=req.path;
    const permitidos=[
      /^\/sessao$/,
      /^\/motorista(\/|$)/,
      /^\/checklist-diario(\/|$)/,
      /^\/chamados$/,
      /^\/chamados\/meus$/,
      /^\/veiculos$/  // somente GET; usado para escolher o veículo do dia
    ];
    const ok=permitidos.some(rx=>rx.test(p));
    if(!ok) return res.status(403).json({erro:"Acesso não permitido para o perfil motorista."});
    if(p==="/veiculos" && req.method!=="GET")
      return res.status(403).json({erro:"Motorista não pode alterar dados da frota."});
    next();
  }catch(e){next()}
});

app.get("/api/motorista/dashboard",auth,async(req,res)=>{
  if(String(req.user.perfil||"").toLowerCase()!=="motorista")
    return res.status(403).json({erro:"Acesso exclusivo do motorista."});

  const vd=await pool.query(`SELECT m.veiculo_id,v.prefixo,v.placa,v.modelo,v.tipo,v.status
    FROM motorista_veiculo_dia m JOIN veiculos v ON v.id=m.veiculo_id
    WHERE m.usuario_id=$1 AND m.data_operacao=CURRENT_DATE`,[req.user.id]);
  if(!vd.rowCount) return res.status(409).json({erro:"SELECIONAR_VEICULO_DIA"});
  const v=vd.rows[0];

  const [p,ck,ch,os]=await Promise.all([
    pool.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER(WHERE status='Bom')::int bons,
      COUNT(*) FILTER(WHERE status='Recapagem')::int recapagem,
      COUNT(*) FILTER(WHERE status='Crítico')::int criticos,
      COUNT(*) FILTER(WHERE UPPER(COALESCE(classificacao,'')) LIKE '%ATEN%')::int atencao
      FROM pneus WHERE veiculo_id=$1`,[v.veiculo_id]),
    pool.query(`SELECT id,status_tratamento,possui_critico,criado_em FROM checklists
      WHERE usuario_id=$1 AND veiculo_id=$2 AND data_checklist=CURRENT_DATE ORDER BY id DESC LIMIT 1`,
      [req.user.id,v.veiculo_id]),
    pool.query(`SELECT COUNT(*) FILTER(WHERE status NOT IN ('Concluído','Concluida','Concluída','Cancelado','Cancelada'))::int abertos
      FROM chamados WHERE usuario_id=$1 AND veiculo_id=$2`,[req.user.id,v.veiculo_id]),
    pool.query(`SELECT COUNT(*) FILTER(WHERE status NOT IN ('Concluída','Concluida','Cancelada','Cancelado'))::int abertas
      FROM ordens_servico WHERE veiculo_id=$1`,[v.veiculo_id])
  ]);
  res.json({veiculo:v,pneus:p.rows[0],checklist:ck.rows[0]||null,
    chamados_abertos:ch.rows[0].abertos,os_abertas:os.rows[0].abertas});
});

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


app.get("/api/manutencao/ativos/:categoria", auth, async (req,res) => {
  try{
    const cat=String(req.params.categoria||"CAMINHAO").toUpperCase();
    const r=await pool.query(`
      SELECT v.id,v.prefixo,v.placa,v.tipo,v.modelo,v.ano,v.funcao,v.categoria,
             COUNT(m.id)::int registros,COALESCE(SUM(m.custo),0)::numeric total
      FROM veiculos v LEFT JOIN manutencoes m ON m.veiculo_id=v.id
      WHERE UPPER(COALESCE(v.categoria,'CAMINHAO'))=$1
      GROUP BY v.id ORDER BY v.prefixo`,[cat]);
    res.json(r.rows);
  }catch(e){console.error(e);res.status(500).json({erro:"Erro ao listar ativos."})}
});


async function exigirSenhaAtualizada(req,res,next){
  try{
    const r=await pool.query("SELECT primeiro_acesso FROM usuarios WHERE id=$1",[req.user.id]);
    if(r.rows[0]?.primeiro_acesso) return res.status(428).json({erro:"ALTERAR_SENHA_PRIMEIRO_ACESSO"});
    next();
  }catch(e){res.status(500).json({erro:"Erro ao validar usuário."})}
}

app.post("/api/primeiro-acesso/alterar-senha",auth,async(req,res)=>{
  try{
    const senha=String(req.body.senha||"");
    if(senha.length<6)return res.status(400).json({erro:"A nova senha deve ter no mínimo 6 caracteres."});
    if(senha==="1234")return res.status(400).json({erro:"Escolha uma senha diferente da senha padrão."});
    const hash=await bcrypt.hash(senha,12);
    await pool.query("UPDATE usuarios SET senha_hash=$1,primeiro_acesso=FALSE,senha_alterada_em=NOW() WHERE id=$2",[hash,req.user.id]);
    res.json({sucesso:true});
  }catch(e){res.status(500).json({erro:"Erro ao alterar senha."})}
});

// ======================================================
// V2.5 - USUÁRIOS + CHECKLIST DIÁRIO + TRATAMENTO
// ======================================================
const CHECKLIST_DIARIO_ITENS = [
 "Nível de óleo","Nível da água","Estado de conservação dos pneus","Existência de vazamentos",
 "Luz de pisca, luz de ré, luz alta e luz baixa","Balão de ar","Embreagem",
 "Para-brisa livre de trincos ou rachaduras","Documentação válida","Espelhos retrovisores",
 "Faixas refletivas","Buzina","Triângulo, macaco, cinta, lona e corda",
 "Revisão visual das placas (quebrada, segura, legível)","Tacógrafo"
];

function somenteAdminSupervisor(req,res,next){
  if(!["admin","supervisor"].includes(String(req.user.perfil||"").toLowerCase()))
    return res.status(403).json({erro:"Acesso permitido somente para administrador ou supervisor."});
  next();
}

app.get("/api/usuarios",auth,somenteAdminSupervisor,async(req,res)=>{
  const r=await pool.query(`SELECT u.id,u.nome,u.email,u.perfil,u.ativo,u.veiculo_id,v.prefixo veiculo_prefixo,v.placa
    FROM usuarios u LEFT JOIN veiculos v ON v.id=u.veiculo_id ORDER BY u.nome`);
  res.json(r.rows);
});

app.post("/api/usuarios",auth,somenteAdminSupervisor,async(req,res)=>{
  try{
    const {nome,email,perfil,veiculo_id}=req.body;
    const senha="1234";
    if(!nome||!email)return res.status(400).json({erro:"Nome e e-mail são obrigatórios."});
    if(!["admin","supervisor","motorista"].includes(perfil))return res.status(400).json({erro:"Perfil inválido."});
    const hash=await bcrypt.hash(senha,12);
    const r=await pool.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil,veiculo_id,primeiro_acesso)
      VALUES($1,$2,$3,$4,$5,TRUE) RETURNING id,nome,email,perfil,ativo,veiculo_id,primeiro_acesso`,
      [nome.trim(),email.trim().toLowerCase(),hash,perfil,veiculo_id||null]);
    res.status(201).json(r.rows[0]);
  }catch(e){res.status(400).json({erro:e.code==="23505"?"E-mail já cadastrado.":e.message})}
});

app.put("/api/usuarios/:id",auth,somenteAdminSupervisor,async(req,res)=>{
  const {nome,email,perfil,ativo,veiculo_id,senha}=req.body;
  if(senha){
    const hash=await bcrypt.hash(senha,12);
    await pool.query(`UPDATE usuarios SET nome=$1,email=$2,perfil=$3,ativo=$4,veiculo_id=$5,senha_hash=$6 WHERE id=$7`,
      [nome,email,perfil,ativo!==false,veiculo_id||null,hash,req.params.id]);
  }else{
    await pool.query(`UPDATE usuarios SET nome=$1,email=$2,perfil=$3,ativo=$4,veiculo_id=$5 WHERE id=$6`,
      [nome,email,perfil,ativo!==false,veiculo_id||null,req.params.id]);
  }
  res.json({sucesso:true});
});

app.get("/api/checklist-diario/config",auth,async(req,res)=>{
  const u=await pool.query(`SELECT u.id,u.nome,u.perfil,
    COALESCE(md.veiculo_id,u.veiculo_id) veiculo_id,v.prefixo,v.placa,v.modelo,v.tipo
    FROM usuarios u
    LEFT JOIN motorista_veiculo_dia md ON md.usuario_id=u.id AND md.data_operacao=CURRENT_DATE
    LEFT JOIN veiculos v ON v.id=COALESCE(md.veiculo_id,u.veiculo_id)
    WHERE u.id=$1`,[req.user.id]);
  const hoje=await pool.query(`SELECT id,status_tratamento,criado_em FROM checklists WHERE usuario_id=$1 AND data_checklist=CURRENT_DATE ORDER BY id DESC LIMIT 1`,[req.user.id]);
  res.json({usuario:u.rows[0],itens:CHECKLIST_DIARIO_ITENS,checklist_hoje:hoje.rows[0]||null});
});

app.post("/api/checklist-diario",auth,async(req,res)=>{
  try{
    const {veiculo_id,itens,observacao}=req.body;
    if(!veiculo_id)return res.status(400).json({erro:"Selecione o veículo."});
    if(!Array.isArray(itens)||itens.length!==CHECKLIST_DIARIO_ITENS.length)return res.status(400).json({erro:"Todos os 18 itens do checklist são obrigatórios."});
    for(let i=0;i<CHECKLIST_DIARIO_ITENS.length;i++){
      if(itens[i].item!==CHECKLIST_DIARIO_ITENS[i]||!["EXCELENTE","BOM","REGULAR","RUIM","CRITICO","NA"].includes(itens[i].status))
        return res.status(400).json({erro:`Preencha corretamente o item ${i+1}.`});
    }
    const ja=await pool.query(`SELECT id FROM checklists WHERE usuario_id=$1 AND veiculo_id=$2 AND data_checklist=CURRENT_DATE`,[req.user.id,veiculo_id]);
    if(ja.rowCount)return res.status(400).json({erro:"Checklist deste veículo já enviado hoje por este motorista."});
    const crit=itens.some(x=>["RUIM","CRITICO"].includes(x.status));
    const r=await pool.query(`INSERT INTO checklists(veiculo_id,usuario_id,itens,possui_critico,observacao,data_checklist,status_tratamento)
      VALUES($1,$2,$3::jsonb,$4,$5,CURRENT_DATE,$6) RETURNING id`,
      [veiculo_id,req.user.id,JSON.stringify(itens),crit,observacao||"",crit?"Pendente":"Sem pendência"]);
    res.status(201).json({sucesso:true,id:r.rows[0].id,possui_critico:crit});
  }catch(e){console.error(e);res.status(500).json({erro:"Erro ao enviar checklist."})}
});

app.get("/api/checklist-tratamento",auth,somenteAdminSupervisor,async(req,res)=>{
  const r=await pool.query(`SELECT c.*,v.prefixo,v.placa,v.modelo,u.nome motorista,
    ut.nome tratado_por_nome FROM checklists c JOIN veiculos v ON v.id=c.veiculo_id
    LEFT JOIN usuarios u ON u.id=c.usuario_id LEFT JOIN usuarios ut ON ut.id=c.tratado_por
    ORDER BY CASE WHEN c.status_tratamento='Pendente' THEN 0 ELSE 1 END,c.data_checklist DESC,c.id DESC`);
  res.json(r.rows);
});

app.post("/api/checklist-tratamento/:id/gerar-os",auth,somenteAdminSupervisor,async(req,res)=>{
  const c=await pool.connect();
  try{
    await c.query("BEGIN");
    const ch=await c.query(`SELECT ck.*,v.prefixo FROM checklists ck JOIN veiculos v ON v.id=ck.veiculo_id WHERE ck.id=$1 FOR UPDATE`,[req.params.id]);
    if(!ch.rowCount){await c.query("ROLLBACK");return res.status(404).json({erro:"Checklist não encontrado."});}
    if(ch.rows[0].ordem_servico_id){await c.query("ROLLBACK");return res.status(400).json({erro:"Este checklist já possui Ordem de Serviço."});}
    const problemas=(ch.rows[0].itens||[]).filter(x=>["RUIM","CRITICO"].includes(x.status));
    if(!problemas.length){await c.query("ROLLBACK");return res.status(400).json({erro:"Checklist sem itens RUIM ou CRÍTICO."});}
    const os=await c.query(`INSERT INTO ordens_servico(numero,veiculo_id,status,observacao) VALUES(NULL,$1,'Conferência',$2) RETURNING id`,
      [ch.rows[0].veiculo_id,`O.S. gerada pelo checklist diário #${req.params.id}.`]);
    const oid=os.rows[0].id, numero=`OS-${String(oid).padStart(6,"0")}`;
    await c.query("UPDATE ordens_servico SET numero=$1 WHERE id=$2",[numero,oid]);
    for(const p of problemas){
      await c.query(`INSERT INTO ordem_servico_itens(ordem_id,origem,origem_id,descricao,prioridade)
        VALUES($1,'Checklist',$2,$3,$4)`,
        [oid,Number(req.params.id),`${p.item}${p.observacao?` • ${p.observacao}`:""}`,p.status==="CRITICO"?"Crítica":"Alta"]);
    }
    await c.query(`UPDATE checklists SET status_tratamento='O.S. gerada',tratado_por=$1,tratado_em=NOW(),ordem_servico_id=$2 WHERE id=$3`,
      [req.user.id,oid,req.params.id]);
    await c.query("COMMIT");res.json({sucesso:true,id:oid,numero});
  }catch(e){await c.query("ROLLBACK");console.error(e);res.status(500).json({erro:"Erro ao gerar O.S. do checklist."})}finally{c.release()}
});

app.put("/api/checklist-tratamento/:id/status",auth,somenteAdminSupervisor,async(req,res)=>{
  const st=req.body.status;
  if(!["Pendente","Em análise","Sem pendência","Tratado"].includes(st))return res.status(400).json({erro:"Status inválido."});
  await pool.query(`UPDATE checklists SET status_tratamento=$1,tratado_por=$2,tratado_em=CASE WHEN $1 IN ('Sem pendência','Tratado') THEN NOW() ELSE tratado_em END WHERE id=$3`,
    [st,req.user.id,req.params.id]);
  res.json({sucesso:true});
});


app.get("/api/sessao",auth,async(req,res)=>{
  const r=await pool.query(`SELECT u.id,u.nome,u.email,u.perfil,u.ativo,u.primeiro_acesso,u.veiculo_id,
    v.prefixo veiculo_prefixo,v.placa,v.modelo
    FROM usuarios u LEFT JOIN veiculos v ON v.id=u.veiculo_id WHERE u.id=$1`,[req.user.id]);
  res.json(r.rows[0]);
});

app.get("/api/motorista/minhas-os",auth,exigirSenhaAtualizada,async(req,res)=>{
  const u=await pool.query(`SELECT COALESCE(
    (SELECT veiculo_id FROM motorista_veiculo_dia WHERE usuario_id=$1 AND data_operacao=CURRENT_DATE),
    (SELECT veiculo_id FROM usuarios WHERE id=$1)) veiculo_id`,[req.user.id]);
  const vid=u.rows[0]?.veiculo_id;
  if(!vid)return res.json([]);
  const r=await pool.query(`SELECT os.*,v.prefixo,v.placa,
    COALESCE((SELECT json_agg(i ORDER BY i.id) FROM ordem_servico_itens i WHERE i.ordem_id=os.id),'[]') itens
    FROM ordens_servico os JOIN veiculos v ON v.id=os.veiculo_id
    WHERE os.veiculo_id=$1 ORDER BY os.criado_em DESC`,[vid]);
  res.json(r.rows);
});

app.post("/api/chamados",auth,exigirSenhaAtualizada,async(req,res)=>{
  try{
    const u=await pool.query(`SELECT u.perfil,COALESCE(
      (SELECT veiculo_id FROM motorista_veiculo_dia WHERE usuario_id=u.id AND data_operacao=CURRENT_DATE),
      u.veiculo_id) veiculo_id FROM usuarios u WHERE u.id=$1`,[req.user.id]);
    let vid=req.body.veiculo_id||u.rows[0]?.veiculo_id;
    if(!vid)return res.status(400).json({erro:"Usuário sem veículo associado."});
    const titulo=String(req.body.titulo||"").trim(),descricao=String(req.body.descricao||"").trim();
    if(!titulo||!descricao)return res.status(400).json({erro:"Informe o problema e a descrição da ocorrência."});
    const r=await pool.query(`INSERT INTO chamados(usuario_id,veiculo_id,titulo,descricao,localizacao,prioridade)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[req.user.id,vid,titulo,descricao,req.body.localizacao||"",req.body.prioridade||"Normal"]);
    const numero=`CH-${String(r.rows[0].id).padStart(6,"0")}`;
    await pool.query("UPDATE chamados SET numero=$1 WHERE id=$2",[numero,r.rows[0].id]);
    res.status(201).json({sucesso:true,id:r.rows[0].id,numero});
  }catch(e){console.error(e);res.status(500).json({erro:"Erro ao abrir chamado."})}
});

app.get("/api/chamados/meus",auth,exigirSenhaAtualizada,async(req,res)=>{
  const r=await pool.query(`SELECT c.*,v.prefixo,v.placa FROM chamados c JOIN veiculos v ON v.id=c.veiculo_id
    WHERE c.usuario_id=$1 ORDER BY c.criado_em DESC`,[req.user.id]);
  res.json(r.rows);
});

app.get("/api/chamados/abertos",auth,exigirSenhaAtualizada,somenteAdminSupervisor,async(req,res)=>{
  const r=await pool.query(`SELECT c.*,v.prefixo,v.placa,v.modelo,u.nome motorista,s.nome supervisor
    FROM chamados c JOIN veiculos v ON v.id=c.veiculo_id LEFT JOIN usuarios u ON u.id=c.usuario_id
    LEFT JOIN usuarios s ON s.id=c.supervisor_id ORDER BY CASE WHEN c.status='Aberto' THEN 0 ELSE 1 END,c.criado_em DESC`);
  res.json(r.rows);
});

app.post("/api/chamados/:id/gerar-os",auth,exigirSenhaAtualizada,somenteAdminSupervisor,async(req,res)=>{
  const c=await pool.connect();
  try{
    await c.query("BEGIN");
    const ch=await c.query("SELECT * FROM chamados WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!ch.rowCount){await c.query("ROLLBACK");return res.status(404).json({erro:"Chamado não encontrado."})}
    if(ch.rows[0].ordem_servico_id){await c.query("ROLLBACK");return res.status(400).json({erro:"Chamado já possui O.S."})}
    const os=await c.query(`INSERT INTO ordens_servico(numero,veiculo_id,status,observacao) VALUES(NULL,$1,'Conferência',$2) RETURNING id`,
      [ch.rows[0].veiculo_id,`Gerada pelo chamado ${ch.rows[0].numero}: ${ch.rows[0].descricao}`]);
    const oid=os.rows[0].id,numero=`OS-${String(oid).padStart(6,"0")}`;
    await c.query("UPDATE ordens_servico SET numero=$1 WHERE id=$2",[numero,oid]);
    await c.query(`INSERT INTO ordem_servico_itens(ordem_id,origem,origem_id,descricao,prioridade)
      VALUES($1,'Chamado',$2,$3,$4)`,[oid,Number(req.params.id),`${ch.rows[0].titulo} • ${ch.rows[0].descricao}`,ch.rows[0].prioridade==="Crítica"?"Crítica":"Alta"]);
    await c.query(`UPDATE chamados SET status='O.S. gerada',supervisor_id=$1,ordem_servico_id=$2,atualizado_em=NOW() WHERE id=$3`,
      [req.user.id,oid,req.params.id]);
    await c.query("COMMIT");res.json({sucesso:true,id:oid,numero});
  }catch(e){await c.query("ROLLBACK");console.error(e);res.status(500).json({erro:"Erro ao gerar O.S."})}finally{c.release()}
});

app.put("/api/chamados/:id",auth,exigirSenhaAtualizada,somenteAdminSupervisor,async(req,res)=>{
  const {status,resposta_supervisor}=req.body;
  await pool.query(`UPDATE chamados SET status=COALESCE($1,status),resposta_supervisor=COALESCE($2,resposta_supervisor),
    supervisor_id=$3,atualizado_em=NOW() WHERE id=$4`,[status||null,resposta_supervisor||null,req.user.id,req.params.id]);
  res.json({sucesso:true});
});


function somenteMotorista(req,res,next){
  if(String(req.user.perfil||"").toLowerCase()!=="motorista")
    return res.status(403).json({erro:"Acesso permitido somente para motorista."});
  next();
}

app.get("/api/motorista/veiculo-dia",auth,somenteMotorista,async(req,res)=>{
  const r=await pool.query(`SELECT m.veiculo_id,v.prefixo,v.placa,v.modelo
    FROM motorista_veiculo_dia m JOIN veiculos v ON v.id=m.veiculo_id
    WHERE m.usuario_id=$1 AND m.data_operacao=CURRENT_DATE`,[req.user.id]);
  res.json(r.rows[0]||null);
});

app.post("/api/motorista/veiculo-dia",auth,somenteMotorista,async(req,res)=>{
  const vid=Number(req.body.veiculo_id);
  if(!vid)return res.status(400).json({erro:"Selecione o veículo que utilizará hoje."});
  const v=await pool.query("SELECT id,prefixo,placa,modelo FROM veiculos WHERE id=$1",[vid]);
  if(!v.rowCount)return res.status(404).json({erro:"Veículo não encontrado."});
  await pool.query(`INSERT INTO motorista_veiculo_dia(usuario_id,veiculo_id,data_operacao)
    VALUES($1,$2,CURRENT_DATE)
    ON CONFLICT(usuario_id,data_operacao) DO UPDATE SET veiculo_id=EXCLUDED.veiculo_id,criado_em=NOW()`,
    [req.user.id,vid]);
  res.json({sucesso:true,...v.rows[0]});
});

app.get("/api/motorista/perfil",auth,somenteMotorista,async(req,res)=>{
  const r=await pool.query("SELECT id,nome,email,perfil FROM usuarios WHERE id=$1",[req.user.id]);
  res.json(r.rows[0]);
});

app.put("/api/motorista/perfil",auth,somenteMotorista,async(req,res)=>{
  const nome=String(req.body.nome||"").trim(),email=String(req.body.email||"").trim().toLowerCase();
  if(!nome||!email)return res.status(400).json({erro:"Nome e e-mail são obrigatórios."});
  try{
    await pool.query("UPDATE usuarios SET nome=$1,email=$2 WHERE id=$3",[nome,email,req.user.id]);
    res.json({sucesso:true});
  }catch(e){res.status(400).json({erro:e.code==="23505"?"E-mail já cadastrado.":"Erro ao atualizar perfil."})}
});

app.put("/api/motorista/alterar-senha",auth,somenteMotorista,async(req,res)=>{
  const atual=String(req.body.senha_atual||""),nova=String(req.body.nova_senha||"");
  if(nova.length<6)return res.status(400).json({erro:"A nova senha deve ter no mínimo 6 caracteres."});
  const u=await pool.query("SELECT senha_hash FROM usuarios WHERE id=$1",[req.user.id]);
  if(!u.rowCount||!(await bcrypt.compare(atual,u.rows[0].senha_hash)))return res.status(400).json({erro:"Senha atual incorreta."});
  const hash=await bcrypt.hash(nova,12);
  await pool.query("UPDATE usuarios SET senha_hash=$1,primeiro_acesso=FALSE,senha_alterada_em=NOW() WHERE id=$2",[hash,req.user.id]);
  res.json({sucesso:true});
});

app.get("/api/motorista/contexto-dia",auth,somenteMotorista,async(req,res)=>{
  const r=await pool.query(`SELECT m.veiculo_id,v.prefixo,v.placa,v.modelo
    FROM motorista_veiculo_dia m JOIN veiculos v ON v.id=m.veiculo_id
    WHERE m.usuario_id=$1 AND m.data_operacao=CURRENT_DATE`,[req.user.id]);
  res.json(r.rows[0]||null);
});


// ======================================================
// V3.2 - FINALIZAÇÃO E HISTÓRICO DE O.S. / CHAMADOS
// ======================================================
app.put("/api/ordens-servico/:id/finalizar",auth,async(req,res)=>{
  if(String(req.user.perfil||"").toLowerCase()==="motorista")
    return res.status(403).json({erro:"Apenas supervisão/administração pode finalizar O.S."});
  const id=Number(req.params.id);
  const r=await pool.query(`UPDATE ordens_servico SET status='Concluída',finalizado_em=NOW(),finalizado_por=$2
    WHERE id=$1 AND COALESCE(status,'') NOT IN ('Concluída','Concluida','Cancelada','Cancelado') RETURNING *`,[id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({erro:"O.S. não encontrada ou já finalizada."});
  res.json({ok:true,ordem:r.rows[0]});
});

app.put("/api/chamados/:id/finalizar",auth,async(req,res)=>{
  if(String(req.user.perfil||"").toLowerCase()==="motorista")
    return res.status(403).json({erro:"Apenas supervisão/administração pode finalizar chamado."});
  const id=Number(req.params.id);
  const r=await pool.query(`UPDATE chamados SET status='Concluído',finalizado_em=NOW(),finalizado_por=$2
    WHERE id=$1 AND COALESCE(status,'') NOT IN ('Concluído','Concluida','Concluída','Cancelado','Cancelada') RETURNING *`,[id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({erro:"Chamado não encontrado ou já finalizado."});
  res.json({ok:true,chamado:r.rows[0]});
});

app.get("/api/ordens-finalizadas",auth,async(req,res)=>{
  const {veiculo_id,data_inicial,data_final}=req.query;
  const args=[]; const wh=["o.status IN ('Concluída','Concluida')"];
  if(veiculo_id){args.push(Number(veiculo_id));wh.push(`o.veiculo_id=$${args.length}`)}
  if(data_inicial){args.push(data_inicial);wh.push(`COALESCE(o.finalizado_em,o.criado_em)::date >= $${args.length}::date`)}
  if(data_final){args.push(data_final);wh.push(`COALESCE(o.finalizado_em,o.criado_em)::date <= $${args.length}::date`)}
  const q=`SELECT o.*,v.prefixo,v.placa,v.modelo FROM ordens_servico o
    LEFT JOIN veiculos v ON v.id=o.veiculo_id WHERE ${wh.join(" AND ")}
    ORDER BY COALESCE(o.finalizado_em,o.criado_em) DESC`;
  const r=await pool.query(q,args); res.json(r.rows);
});

app.get("/api/dashboard/concluidos",auth,async(req,res)=>{
  const r=await pool.query(`SELECT COUNT(*) FILTER(WHERE status IN ('Concluída','Concluida') AND COALESCE(finalizado_em,criado_em)::date=CURRENT_DATE)::int os_hoje,
    COUNT(*) FILTER(WHERE status IN ('Concluída','Concluida') AND COALESCE(finalizado_em,criado_em)>=date_trunc('month',CURRENT_DATE))::int os_mes
    FROM ordens_servico`);
  const ult=await pool.query(`SELECT o.id,o.numero,o.descricao,o.finalizado_em,v.prefixo FROM ordens_servico o
    LEFT JOIN veiculos v ON v.id=o.veiculo_id WHERE o.status IN ('Concluída','Concluida')
    ORDER BY COALESCE(o.finalizado_em,o.criado_em) DESC LIMIT 5`);
  res.json({...r.rows[0],ultimas:ult.rows});
});


// ======================================================
// V3.4 - HISTÓRICO UNIFICADO + DASHBOARD OPERACIONAL
// ======================================================
app.get("/api/historico-servicos",auth,async(req,res)=>{
  if(String(req.user.perfil||"").toLowerCase()==="motorista") return res.status(403).json({erro:"Acesso restrito."});
  try{
    const {veiculo_id,data_inicial,data_final,tipo}=req.query;
    const args=[]; const filtros=[];
    if(veiculo_id){args.push(Number(veiculo_id));filtros.push(`x.veiculo_id=$${args.length}`)}
    if(data_inicial){args.push(data_inicial);filtros.push(`x.data_evento::date >= $${args.length}::date`)}
    if(data_final){args.push(data_final);filtros.push(`x.data_evento::date <= $${args.length}::date`)}
    if(tipo){args.push(String(tipo).toUpperCase());filtros.push(`x.tipo=$${args.length}`)}
    const where=filtros.length?`WHERE ${filtros.join(" AND ")}`:"";
    const q=`SELECT * FROM (
      SELECT 'OS'::text tipo,o.id,o.numero,o.veiculo_id,v.prefixo,v.placa,
        COALESCE(NULLIF(o.observacao,''),'Ordem de Serviço concluída') descricao,
        COALESCE(o.valor_orcado,0)::numeric valor,NULL::text empresa,
        COALESCE(o.finalizado_em,o.data_conclusao,o.atualizado_em,o.criado_em) data_evento,
        o.status,u.nome finalizado_por
      FROM ordens_servico o LEFT JOIN veiculos v ON v.id=o.veiculo_id
      LEFT JOIN usuarios u ON u.id=o.finalizado_por
      WHERE LOWER(COALESCE(o.status,'')) IN ('concluída','concluida','finalizada','fechada')
      UNION ALL
      SELECT 'CHAMADO'::text,c.id,c.numero,c.veiculo_id,v.prefixo,v.placa,
        CONCAT_WS(' • ',c.titulo,NULLIF(c.descricao,'')) descricao,0::numeric valor,NULL::text empresa,
        COALESCE(c.finalizado_em,c.atualizado_em,c.criado_em) data_evento,c.status,u.nome finalizado_por
      FROM chamados c LEFT JOIN veiculos v ON v.id=c.veiculo_id
      LEFT JOIN usuarios u ON u.id=c.finalizado_por
      WHERE LOWER(COALESCE(c.status,'')) IN ('concluído','concluido','concluída','concluida','finalizado','fechado')
      UNION ALL
      SELECT 'MANUTENÇÃO'::text,m.id,COALESCE(NULLIF(m.nota_fiscal,''),'MAN-'||m.id::text),m.veiculo_id,v.prefixo,v.placa,
        COALESCE(NULLIF(m.produto,''),NULLIF(m.descricao,''),NULLIF(m.servico,''),'Manutenção') descricao,
        COALESCE(m.custo,0)::numeric valor,m.empresa,
        COALESCE(m.data_emissao,m.data_conclusao,m.data_abertura,m.criado_em::date)::timestamp data_evento,
        COALESCE(m.status,'Concluída') status,NULL::text finalizado_por
      FROM manutencoes m LEFT JOIN veiculos v ON v.id=m.veiculo_id
      WHERE LOWER(COALESCE(m.status,'concluída')) IN ('concluída','concluida','finalizada','fechada')
    ) x ${where} ORDER BY x.data_evento DESC,x.id DESC LIMIT 1000`;
    const r=await pool.query(q,args);
    res.json(r.rows);
  }catch(e){console.error("historico-servicos",e);res.status(500).json({erro:"Erro ao consultar histórico de serviços."})}
});

app.get("/api/dashboard-operacional",auth,async(req,res)=>{
  if(String(req.user.perfil||"").toLowerCase()==="motorista") return res.status(403).json({erro:"Acesso restrito."});
  try{
    const [veiculos,gastos,combustivel,resumo]=await Promise.all([
      pool.query(`SELECT v.id,v.prefixo,v.placa,v.modelo,v.tipo,v.status,
        CASE WHEN LOWER(COALESCE(v.status,''))='manutenção' THEN 'Manutenção'
             WHEN EXISTS(SELECT 1 FROM motorista_veiculo_dia md WHERE md.veiculo_id=v.id AND md.data_operacao=CURRENT_DATE) OR LOWER(COALESCE(v.status,''))='em rota' THEN 'Em rota'
             ELSE 'Parado' END status_operacional,
        EXISTS(SELECT 1 FROM checklists c WHERE c.veiculo_id=v.id AND c.data_checklist=CURRENT_DATE) checklist_hoje,
        (SELECT COUNT(*)::int FROM ordens_servico o WHERE o.veiculo_id=v.id AND LOWER(COALESCE(o.status,'')) NOT IN ('concluída','concluida','finalizada','fechada','cancelada','cancelado')) os_abertas,
        (SELECT COUNT(*)::int FROM chamados c WHERE c.veiculo_id=v.id AND LOWER(COALESCE(c.status,'')) NOT IN ('concluído','concluido','concluída','concluida','finalizado','fechado','cancelado','cancelada')) chamados_abertos
        FROM veiculos v ORDER BY v.prefixo`),
      pool.query(`SELECT v.id,v.prefixo,v.placa,ROUND(SUM(COALESCE(m.custo,0))::numeric,2) total
        FROM manutencoes m JOIN veiculos v ON v.id=m.veiculo_id
        WHERE COALESCE(m.data_emissao,m.data_conclusao,m.data_abertura,m.criado_em::date)>=date_trunc('month',CURRENT_DATE)::date
          AND COALESCE(m.data_emissao,m.data_conclusao,m.data_abertura,m.criado_em::date)<(date_trunc('month',CURRENT_DATE)+interval '1 month')::date
        GROUP BY v.id,v.prefixo,v.placa ORDER BY total DESC LIMIT 10`),
      pool.query(`SELECT v.id,v.prefixo,v.placa,ROUND(SUM(COALESCE(a.litros,0))::numeric,2) litros,
        ROUND(SUM(COALESCE(a.valor_total,a.litros*a.valor_litro,0))::numeric,2) valor,COUNT(*)::int abastecimentos
        FROM abastecimentos a JOIN veiculos v ON v.id=a.veiculo_id
        WHERE a.data>=date_trunc('month',CURRENT_DATE)::date AND a.data<(date_trunc('month',CURRENT_DATE)+interval '1 month')::date
        GROUP BY v.id,v.prefixo,v.placa ORDER BY litros DESC LIMIT 10`),
      pool.query(`SELECT
        (SELECT COUNT(*)::int FROM veiculos) total,
        (SELECT COUNT(*)::int FROM veiculos v WHERE EXISTS(SELECT 1 FROM motorista_veiculo_dia md WHERE md.veiculo_id=v.id AND md.data_operacao=CURRENT_DATE) OR LOWER(COALESCE(v.status,''))='em rota') em_rota,
        (SELECT COUNT(*)::int FROM veiculos v WHERE LOWER(COALESCE(v.status,''))<>'manutenção' AND NOT EXISTS(SELECT 1 FROM motorista_veiculo_dia md WHERE md.veiculo_id=v.id AND md.data_operacao=CURRENT_DATE) AND LOWER(COALESCE(v.status,''))<>'em rota') parados,
        (SELECT COUNT(DISTINCT veiculo_id)::int FROM checklists WHERE data_checklist=CURRENT_DATE) checklist_feito,
        (SELECT COUNT(*)::int FROM ordens_servico WHERE LOWER(COALESCE(status,'')) NOT IN ('concluída','concluida','finalizada','fechada','cancelada','cancelado')) os_abertas,
        (SELECT COUNT(*)::int FROM chamados WHERE LOWER(COALESCE(status,'')) NOT IN ('concluído','concluido','concluída','concluida','finalizado','fechado','cancelado','cancelada')) chamados_abertos`)
    ]);
    res.json({resumo:resumo.rows[0],veiculos:veiculos.rows,ranking_gastos:gastos.rows,ranking_combustivel:combustivel.rows});
  }catch(e){console.error("dashboard-operacional",e);res.status(500).json({erro:"Erro ao carregar dashboard operacional."})}
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


const FROTA_V3 = {"ativos": [{"prefixo": "5001", "placa": "MYZ-4749", "tipo": "3/4", "funcao": "Coleta", "modelo": "VW. 7-110", "ano": "2004", "categoria": "CAMINHAO"}, {"prefixo": "5002", "placa": "MYX-3659", "tipo": "TOCO", "funcao": "Transferência", "modelo": "VW.15-180", "ano": "2006", "categoria": "CAMINHAO"}, {"prefixo": "5003", "placa": "MYK-9319", "tipo": "TRUCADO", "funcao": "Transferência", "modelo": "VW. 23-210", "ano": "2002", "categoria": "CAMINHAO"}, {"prefixo": "5006", "placa": "MYE-6229", "tipo": "TOCO", "funcao": "Distribuidora", "modelo": "VW. 14-170", "ano": "1999", "categoria": "CAMINHAO"}, {"prefixo": "5008", "placa": "KGP-3645", "tipo": "TOCO", "funcao": "Parado", "modelo": "FORD/F12000", "ano": "1996", "categoria": "CAMINHAO"}, {"prefixo": "5009", "placa": "MYN-9450", "tipo": "3/4", "funcao": "Entregas", "modelo": "VW. 8-120", "ano": "2000", "categoria": "CAMINHAO"}, {"prefixo": "5010", "placa": "MYG-9749", "tipo": "TRUCADO", "funcao": "Parado", "modelo": "VW. 23-210", "ano": "2002", "categoria": "CAMINHAO"}, {"prefixo": "5011", "placa": "MXZ-8201", "tipo": "TRUCADO", "funcao": "Parado", "modelo": "VW. 16-200", "ano": "1999", "categoria": "CAMINHAO"}, {"prefixo": "5012", "placa": "NNJ-5445", "tipo": "TRUCADO", "funcao": "Distribuidora", "modelo": "VW. 24-220", "ano": "2008", "categoria": "CAMINHAO"}, {"prefixo": "5014", "placa": "MYZ-4759", "tipo": "TRUCADO", "funcao": "Distribuidora", "modelo": "VW. 23-210", "ano": "2003", "categoria": "CAMINHAO"}, {"prefixo": "5015", "placa": "MYX-3679", "tipo": "TOCO", "funcao": "Transferência", "modelo": "VW. 15-180", "ano": "2006", "categoria": "CAMINHAO"}, {"prefixo": "5016", "placa": "MYJ-3600", "tipo": "3/4", "funcao": "Parado", "modelo": "VW. 7-100", "ano": "1999", "categoria": "CAMINHAO"}, {"prefixo": "5017", "placa": "NNJ-7555", "tipo": "CARRETA SIMPLES", "funcao": "Coleta Fornecedor", "modelo": "VW. 19-320", "ano": "2008", "categoria": "CAMINHAO"}, {"prefixo": "5019", "placa": "NNO-7965", "tipo": "CARRETA SIMPLES", "funcao": "Coleta Fornecedor", "modelo": "VW. 19-320", "ano": "2009", "categoria": "CAMINHAO"}, {"prefixo": "5021", "placa": "NNP-1205", "tipo": "TOCO", "funcao": "Transferência", "modelo": "VW. 15-180", "ano": "2009", "categoria": "CAMINHAO"}, {"prefixo": "5022", "placa": "NNU-5547", "tipo": "TOCO", "funcao": "Distribuidora", "modelo": "VW. 15-180", "ano": "2009", "categoria": "CAMINHAO"}, {"prefixo": "5025", "placa": "NNQ-2583", "tipo": "TOCO", "funcao": "Entregas", "modelo": "VW. 15-180", "ano": "2010", "categoria": "CAMINHAO"}, {"prefixo": "5028", "placa": "NNY-4449", "tipo": "TOCO", "funcao": "Entregas", "modelo": "VW. 15-180", "ano": "2010", "categoria": "CAMINHAO"}, {"prefixo": "5029", "placa": "NOC-5890", "tipo": "TOCO", "funcao": "Entregas", "modelo": "VW. 15-180", "ano": "2010", "categoria": "CAMINHAO"}, {"prefixo": "5031", "placa": "NOG-6697", "tipo": "BAUZINHO", "funcao": "Entregas", "modelo": "HYUNDAI/HR HDB", "ano": "2011", "categoria": "CAMINHAO"}, {"prefixo": "5033", "placa": "NOF-8459", "tipo": "TRUCADO", "funcao": "Entregas", "modelo": "VW. 15-180", "ano": "2012", "categoria": "CAMINHAO"}, {"prefixo": "5037", "placa": "OJU-4844", "tipo": "SAVEIRO", "funcao": "Manutenção", "modelo": "VW - SAVEIRO", "ano": "2013/2014", "categoria": "CAMINHAO"}, {"prefixo": "5038", "placa": "OJZ-4269", "tipo": "TRUCADO", "funcao": "Entregas", "modelo": "VW. 24-280", "ano": "2013", "categoria": "CAMINHAO"}, {"prefixo": "5039", "placa": "OKB-6889", "tipo": "TOCO", "funcao": "Entregas", "modelo": "VW. 15-190", "ano": "2013", "categoria": "CAMINHAO"}, {"prefixo": "5041", "placa": "OVZ-4956", "tipo": "CARRETA ESTENDIDA", "funcao": "Coleta Fornecedor", "modelo": "VW. 25.390", "ano": "2013", "categoria": "CAMINHAO"}, {"prefixo": "5042", "placa": "OWE-0179", "tipo": "TRUCADO", "funcao": "Distribuidora", "modelo": "VOLVO-HM-270", "ano": "2013", "categoria": "CAMINHAO"}, {"prefixo": "5043", "placa": "QGA-8147", "tipo": "TRUCADO", "funcao": "Entregas", "modelo": "VW. 24-280", "ano": "2014", "categoria": "CAMINHAO"}, {"prefixo": "E5023", "placa": "5023", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Hyster", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5024", "placa": "5024", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Still", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5026", "placa": "5026", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Still", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5032", "placa": "5032", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Hyster", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5034", "placa": "5034", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Clark", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5035", "placa": "5035", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Clark", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5040", "placa": "5040", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Clark", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5044", "placa": "5044", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Clark", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5045", "placa": "5045", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "Clark", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5046", "placa": "E5046", "tipo": "Empilhadeira (DIESEL)", "funcao": "Empilhadeira", "modelo": "XGMA-XG535", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5047", "placa": "E5047", "tipo": "Empilhadeira (DIESEL)", "funcao": "Empilhadeira", "modelo": "XGMA-XG535", "ano": "", "categoria": "EMPILHADEIRA"}, {"prefixo": "E5031", "placa": "5031", "tipo": "EMPILHADEIRA", "funcao": "Empilhadeira", "modelo": "", "ano": "", "categoria": "EMPILHADEIRA"}], "historico": [{"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "10241", "data_emissao": "2023-02-07", "produto": "DIAFRAGMA CUICA 16;\nPARAFUSO OCO M16;\nLANTERNA TETO VW;\nROLAMENTO CAIXA DIREÇÃO;\nREPARO CAIXA DIREÇÃO;\nOLEO HIDRAULICO;\nFILTRO HIDRAULICO;\nPALHETA LIMPADOR;\nFECHADURA PORTA LE;\nARRUELA AJUSTE;\nMACANETA PORTA EXT;\nLAMPADA 67;\nPRESILHA PORTA.", "valor": 1749.79, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "6729", "data_emissao": "2023-06-13", "produto": "BALANCEAMENTO E ALINHAMENTO 1.", "valor": 90.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "10640", "data_emissao": "2023-06-23", "produto": "MOTOR DE PARTIDA.", "valor": 2900.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "8588", "data_emissao": "2023-07-17", "produto": "MOTOR DE PARTIDA.", "valor": 1000.0, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHÃO"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "", "local": "EXTERNO", "nota_fiscal": "12375", "data_emissao": "2025-02-03", "produto": "SIRENE P/RE 12/24V C/REDUTOR SOM(PEQUENA)\nCONTO SEGURANÇA RETRATIL 3 PONTAS MB\nFUSIVEL LAMINA 15 AMP \nFAROL DIANTE VW CAM 2000 LEVE L/E\nFIO 12 2,5MM(VERMELHO)\nESPAGUETE CONDUITE FINO 5MM 3/16 CORRUGADO\nFUSIVEL LAMINA 10 AMP \nFUSIVEL LAMINA 15 AMP\nTERMINAL P/FIO 3/8\nFUSIVEL LAMNINA 15 AMP \nLENTE P/LANTERNA TRAS MARMITAO (TRICOLOR)\nCEBOLINHA RE F-4000/VW/CRGO \nABRAÇADEIRA FITA 40 CM  LARGA (NYLON)\nSOQUETE LUZ VIGIA FAROL VW CAM ATE 99 \nLAMPADA 69 12V\nFAIXA REFLETIVA PARACHOQUE 3M\nTINTA SPRAY USO GERAL PRETO FOSCO ", "valor": 722.03, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5001", "servico": "PNEU", "descricao": "-----", "sistema": "", "local": "EXTERNO", "nota_fiscal": "4742", "data_emissao": "2025-09-24", "produto": "PNEU 7.50-16 123/119M STEER TT SPM 14L", "valor": 1676.0, "fornecedor_codigo": "", "empresa": "ITR COMERCIOS DE PNEUS E PECAS S.A"}, {"prefixo": "5001", "servico": "PNEU", "descricao": "-----", "sistema": "", "local": "EXTERNO", "nota_fiscal": "4742", "data_emissao": "2025-09-24", "produto": "PNEU 7.50-16 123/119M STEER TT SPM 14L", "valor": 1676.0, "fornecedor_codigo": "", "empresa": "ITR COMERCIOS DE PNEUS E PECAS S.A"}, {"prefixo": "5001", "servico": "PNEU", "descricao": "-----", "sistema": "", "local": "EXTERNO", "nota_fiscal": "4113", "data_emissao": "2025-09-29", "produto": "ALINHAMENTO PESADO\nBALNCEAMENTO PESADO", "valor": 160.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5001", "servico": "PNEU", "descricao": "-----", "sistema": "", "local": "EXTERNO", "nota_fiscal": "2070", "data_emissao": "2025-09-29", "produto": "PROTETOR ARO 16 MASTER FLEX/SBN\nCAMARA DE AR 750 / 16 MGM", "valor": 115.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5001", "servico": "PNEU", "descricao": "-----", "sistema": "", "local": "EXTERNO", "nota_fiscal": "10092", "data_emissao": "2025-10-08", "produto": "PM CAMINHAO 7.50 X 16 BDL PIREL\nPM CAMINHAO 7.50 X 16 BDL PIREL\n\nRECAUCHUTAGEM OU REGENERACAO DOS PNEUS\nREFORMA DOS PNEUMATICOS USADOS", "valor": 940.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL RENOVADORA DE PNUS"}, {"prefixo": "5001", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "PNEUS", "local": "EXTERNO", "nota_fiscal": "4687", "data_emissao": "2025-11-25", "produto": "PM CAMIONETE 5.50 X 16 BDL BDL ANTEO\nPM CAMIONETE 5.50 X 16 BDL BDL ANTEO", "valor": 840.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "SERVICOS TECNICOS EM FREIOS", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "289916", "data_emissao": "2025-12-30", "produto": "DIAFRAGMA CUICA FREIO 7´´ TIPO 24 0053080 / DIAFRAGMA FREIO 6 TIPO 16 0039898", "valor": 191.4, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS/ARQUEAMENTO /FEIXE MOLA DIANTEIRO", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "26245", "data_emissao": "2026-01-24", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, ETC", "valor": 460.0, "fornecedor_codigo": "1975", "empresa": "IRMAO CLARA DISTRIBUIDORA DE PEÇAS LTDA"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "20034", "data_emissao": "2026-02-03", "produto": "FAIXA REFLETIVA PARACHOQUE 3M", "valor": 89.1, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5001", "servico": "SERVIÇO", "descricao": "ENSAIO METROLOGICO/ SELAGEM DO TACOGRAFO", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "26594", "data_emissao": "2026-04-02", "produto": "LUBRIFICAÇÃO/ LIMPEZA/ LUSTRAÇÃO/ REVISÃO...", "valor": 212.0, "fornecedor_codigo": "", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5001", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "5682", "data_emissao": "2026-04-02", "produto": "TAMPA LACRE MTCO 1390", "valor": 30.0, "fornecedor_codigo": "", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5001", "servico": "VENDAS", "descricao": "PEÇAS PARA REPARO DO CAMINHÃO", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "13283", "data_emissao": "2026-04-22", "produto": "ARRUELA TRAVA, BUZINA, CHAVE LIMPADOR, KIT PARAFUSO, CILINDRO IN, BUCHA VOLANTE DIREÇÃO, TRAVA DIREÇÃO, CRUZETA TRANSMISSÃO, ROLAMENTO DO CARDAN E DO VOLANTE, FLUIDO EMBREAGEM...", "valor": 2990.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5001", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA MECÂNICA", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "26165", "data_emissao": "2026-04-22", "produto": "RETIFICA COLUNA DIREÇÃO, DESMONTAGEM COLUNA DIREÇÃO, SERVIÇO EMBREAGEM, TROCA CILINDROS, SERVIÇO RETIFICA VOLANTE, SERVIÇO TRANSMISSÃO...", "valor": 1910.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5001", "servico": "VENDA", "descricao": "PEÇAS PARA REPARO DO CAMINHÃO", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13292", "data_emissao": "2026-04-28", "produto": "FUSIVEL LAMINA, LAMPADA 67, LAMPADA PINGÃO, SIRENE RE, LAMPADA 1 POLO, LANTERNA TRASEIRA, LANTERNA PISCA, CHICOTE ELETRICO E BARRA DIREÇÃO", "valor": 1032.22, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5001", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA MECÂNICA", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "26172", "data_emissao": "2026-04-28", "produto": "SERVIÇO DE REVISÃO ELETRICA E BARRA DE DIREÇÃO.", "valor": 300.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5001", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 396.3225, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"prefixo": "5001", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "INTERNO", "nota_fiscal": "188569", "data_emissao": "2026-06-19", "produto": "BATERIA M100 HE MGE3 SLI", "valor": 811.46, "fornecedor_codigo": "-", "empresa": "CODIBA C. DISTRIB"}, {"prefixo": "5001", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 341.1, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "12017", "data_emissao": "2023-03-16", "produto": "MANGUEIRA GAA 300 PSI 3/4\nABRAÇADEIRA FITA 13,5MM 19X27 (3/4X11/16)\nMANGUEIRA R1 3/8\nTERMINAL 103-8-6\nTERMINAL 90 112-8-6\nCAPA DE ALTA 3/8\nBUCHA 1 MACHO X3/4 FEMEA AÇO\nFLANGE 90-12-8 COD 61\nESPIG FIXO MACHO ROSCA 3/4X5/8 AÇO\n", "valor": 237.5, "fornecedor_codigo": "", "empresa": "J ROCHA DA SILVA"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "TRASNSMISSÃO", "local": "EXTERNO", "nota_fiscal": "12707", "data_emissao": "2025-06-16", "produto": "ROLAMENTO CENTRO", "valor": 178.92, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "445100", "data_emissao": "2025-07-18", "produto": "FILTRO AR PRIM MT CUMMINS/MBB/MAN/MWM-LX1716\nFILTRO COMB BRIND VW 1315000/-FCD2225", "valor": 131.42, "fornecedor_codigo": "", "empresa": "PADRE CICERO "}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "445103", "data_emissao": "2025-07-18", "produto": "OLEO MT TOTAL 20L 15W40 RUBIA 7400-176470", "valor": 403.66, "fornecedor_codigo": "", "empresa": "PADRE CICERO "}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "12846", "data_emissao": "2025-08-07", "produto": "GRAXA ROLAMENTO \nCOLA SILICONE\nARANHA TRAVA RODA\nRETENTOR RODA TRASEIRA\nROLAMENTO RODA TS", "valor": 272.42, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "7923", "data_emissao": "2025-08-07", "produto": "SERVIÇOS DIVERSOS", "valor": 100.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "16783", "data_emissao": "2025-09-02", "produto": "LENTE P/LANTERNA TRAS. MARMITAO (TRICOLOR)", "valor": 46.8, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5002", "servico": "PNEU", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "4106", "data_emissao": "2025-09-27", "produto": "ALINHAMENTO PESADO\nBALNCEAMENTO PESADO", "valor": 160.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5002", "servico": "PNEU", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "4106", "data_emissao": "2025-09-27", "produto": "ALINHAMENTO PESADO\nBALNCEAMENTO PESADO", "valor": 160.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5002", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "4105", "data_emissao": "2025-09-27", "produto": "PM CAMINHAO 275/80R22,5 RT42 RT42 DUNLOS\nMANCHAO REC 125 VULCAFLEX APL\nPM CAMINHAO 275/80R22,5 RT42 RT42 DUNLOS\nMANCHAO REC 122 VULCAFLEX APL\nMANCHAO RAC 20 \nMANCHAO RAC 20\nMANCHAO RAC 10 APL", "valor": 1530.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "TRASNSMISSÃO", "local": "EXTERNO", "nota_fiscal": "39773", "data_emissao": "2025-09-29", "produto": "ABRACAD CRUZETA CF1002\nPARAFU ABRAC CARDAN CF01T\nCRUZETA CARDAN 801001", "valor": 128.7, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "58278", "data_emissao": "2025-10-08", "produto": "CUMARU EM PRANCHA", "valor": 1555.2, "fornecedor_codigo": "", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "500678", "data_emissao": "2025-10-14", "produto": "BA RO 1/2 ZB UNC\nPO SX 1/2 ZB UNC (13FPP) CH3/4\nARR LI 1/2 ZB UNID", "valor": 300.05, "fornecedor_codigo": "", "empresa": "M A DE PAULA FERNANDES LTDA"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "19322", "data_emissao": "2025-12-30", "produto": "PALHETA LIMP. 24 POL.VW CAM./MB/ABRAÇADEIRA/SIRENE/.", "valor": 1250.96, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS PARA CAMINHÃO-BR", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "18917", "data_emissao": "2026-01-20", "produto": "PNEU 275/80R22.5 149/146L J#MTMU TL 16L SPP-2UN", "valor": 4230.0, "fornecedor_codigo": "", "empresa": "SPEEDMAX"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "RECONDICIONAMENTO DE MOTORES ", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "2618", "data_emissao": "2026-01-21", "produto": "SERVIÇOS EM CAIXA DE DIREÇÃO", "valor": 1200.0, "fornecedor_codigo": "", "empresa": "R. E DIESEL LTDA"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "MOLAS", "local": "EXTERNO", "nota_fiscal": "10791", "data_emissao": "2026-01-24", "produto": "BUCHA MOLA/PORCA SEXTA V. SIMPLES/PINO/FOLHA DE MOLA", "valor": 1106.41, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "20033", "data_emissao": "2026-02-03", "produto": "CONECTOR CHICOTE ELET . 2 VIAS BOBINA IGNICAO FIAT/GM", "valor": 31.5, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5002", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "ARREFECIMENTO", "local": "EXTERNO", "nota_fiscal": "257", "data_emissao": "2026-04-13", "produto": "RESERVATORIO AGUA/ PINO DO FEIXE/ JUNTA TAMPA/CUICA...", "valor": 1031.0, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5002", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA E LAVAGEM ", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26109", "data_emissao": "2026-04-13", "produto": "LUBRIFICAÇÃO/LIMPEZA/LUSTRAÇÃO/REVISÃO/CARGA...", "valor": 850.001, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5002", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "297866", "data_emissao": "2026-05-09", "produto": "FAROL VW LINHA 2000 LD", "valor": 241.79, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5002", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "13306", "data_emissao": "2026-05-07", "produto": "CINTA PLASTICA, SENSOR FREIO MANECO", "valor": 121.82, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5002", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 528.43, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 333.9, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"prefixo": "5002", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "301324", "data_emissao": "2026-06-29", "produto": "BOIA TANQUE", "valor": 180.037, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5003", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "7636", "data_emissao": "2025-03-18", "produto": "LUBRIFICAÇÃO, LIMPEZA,LUSTRAÇÃO, REVISÃO, CARGA E RECARGA , CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MÁQUINAS, VEÍCULOS, APARELHOS, EQUIPAMENTOS, MOTORES,ELEVADORES OU DE QUALQUER OBJETO.", "valor": 400.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5003", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "12912", "data_emissao": "2025-09-04", "produto": "CABO ACELERADOR ", "valor": 373.5, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5003", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "350", "data_emissao": "2025-11-17", "produto": "SERVICO REVISAO CHICOTE DO SOLENOIDE DA BOLSA DE AR", "valor": 350.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5003", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "41576", "data_emissao": "2025-11-14", "produto": "CUICA FREIO 81650540 30X30\nRETIFICADOR ALT F00M123317\nVALVULA DRENO AR 4400402", "valor": 465.3, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5003", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "253", "data_emissao": "2026-12-03", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA , ETC..", "valor": 200.0, "fornecedor_codigo": "", "empresa": "R. E .DIESEL LTDA"}, {"prefixo": "5003", "servico": "VENDAS", "descricao": "PEÇAS PARA CONSERTO DO MYK-9319", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "13277", "data_emissao": "2026-04-16", "produto": "TAMPA CUICA, DIAFRAMA CUICA 30, DIAFRAMA CUICA 24, REPARO CUICA...", "valor": 3713.6, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "12376", "data_emissao": "2025-02-11", "produto": "FILTRO LUBRIFICANTE 4CIL\nFILTRO COMBUSTIVEL S/DRENO\nFILTRO RACOR\nOLEO MOTOR 15W40 CI4 (BD 20L)", "valor": 703.78, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "4871", "data_emissao": "2025-03-20", "produto": "LAMPADA 12V BASE PLASTICA SIEMENS ", "valor": 156.0, "fornecedor_codigo": "", "empresa": "GC COMÉRCIO DE VEÍCULOS LTDA ME"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "15873", "data_emissao": "2025-03-22", "produto": "CONSERTO ELÉTRICO", "valor": 200.0, "fornecedor_codigo": "", "empresa": "GC COMÉRCIO DE VEÍCULOS LTDA ME"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "12647", "data_emissao": "2025-05-29", "produto": "COLA TREBOND\nOLEO CAIXA MARCHA\nGARFO CAIXA MARCHA\nRETENTOR CAIXA\n", "valor": 969.52, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5009", "servico": "PNEU", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10092", "data_emissao": "2025-10-08", "produto": "PM CAMINHAO 7.50 X 16 BDL PIREL\n\nRECAUCHUTAGEM OU REGENERACAO DOS PNEUS\nREFORMA DOS PNEUMATICOS USADOS", "valor": 470.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL RENOVADORA DE PNUS"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "40487", "data_emissao": "2025-10-17", "produto": "CABO ACELERADOR 111230", "valor": 253.8, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5009", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "4296", "data_emissao": "2025-10-18", "produto": "ALINHAMENTO PESADO\nBALANCEAMENTO  PESADO", "valor": 160.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "18170", "data_emissao": "2025-10-31", "produto": "LANTERNA LAT. VW2000 S/SOQ. (CR)\nFAIXA REFLETIVA COLANTE (DM) LD\nFAIXA REFLETIVA COLANTE (DM) LD\nSOQUETE P/LANTERNA LAT. VW. CAM. SUPERIOR 7630\nTINTA SPRAY USO GERAL PRETO FOSCO 235G/350ML\nCONECTOR ELETRICO FEMEA 2 VIAS (TC+1005) CHW02032\nLANTERNA TIPO RANDOM MOD. P/CX PT CRISTAL (VM)", "valor": 365.4, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5009", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "17619", "data_emissao": "2025-10-16", "produto": "PNEU 215/75R17,5 126/124L QSTMXS SPM 16L", "valor": 4440.0, "fornecedor_codigo": "", "empresa": "ITR COMERCIOS DE PECAS"}, {"prefixo": "5009", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4687", "data_emissao": "2025-11-25", "produto": "PM CAMIONETE 215/75 R 17.5 RT32 RT32 KUMHO\nPM CAMIONETE 215/75 R 17.5 RT32 RT32 WESTL", "valor": 1140.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "13091", "data_emissao": "2026-01-13", "produto": "EIXO PILOTO/ENGRENAGEM MOVEL/ ENGRENAGEM MOTRIZ/ ANEL SINCRONIZADOR/ OLEO CAIXA MARCHA 80W90 LITRO (OFIC)/ROLAMENTO DO CARDAN/ROLAMENTO CAIXA...", "valor": 3635.99, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "180440", "data_emissao": "2026-04-01", "produto": "ARAME MIG TUBULAR 08MM/ 1.0MM", "valor": 200.98, "fornecedor_codigo": "4573", "empresa": "E &¨L  MATERIAL DE CONSTRUÇÃO LTDA"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO ", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "159622", "data_emissao": "2026-04-02", "produto": "DISCO FLAP/ LIXA D'AGUA/ MASSA PLASTICA", "valor": 33.5, "fornecedor_codigo": "X", "empresa": "TRANSFERENCIA/LOJA(CONSUMO)"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "335014", "data_emissao": "2026-04-02", "produto": "IMP CHAPA  2.00MM/ IMP CHAPA 3.00 MM", "valor": 1116.17, "fornecedor_codigo": "210", "empresa": "UNIMETAIS "}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "14758", "data_emissao": "2026-04-09", "produto": "RETHANE DHG 652/COMPONENTE B P RETHANE FBR", "valor": 400.0, "fornecedor_codigo": "", "empresa": "MARSILVA COMERCIO, SERVICOS E REPRESENTAÇÕES LTDA"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "3309", "data_emissao": "2026-04-13", "produto": "GUARN DE PB VW/ PARABR VW", "valor": 910.0, "fornecedor_codigo": "", "empresa": "RNB AUTO VIDROS LTDA "}, {"prefixo": "5009", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "37453", "data_emissao": "2026-05-22", "produto": "FILTROS DE COMBUSTÍVEL, SEDIMENTADOR, OLEO E DE AR.", "valor": 237.43, "fornecedor_codigo": "3992", "empresa": "PADRE CÍCERO"}, {"prefixo": "5009", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "5770", "data_emissao": "2026-05-29", "produto": "KIT LACRE REPARO, MOLDURA FRONTAL 7D, TAMPA LACRE MTCO", "valor": 208.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5009", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26881", "data_emissao": "2026-05-29", "produto": "ENSAIO METROLOGICO DO TACOGRAFO, SELAGEM DO TACORAFO, RECUPERAÇÃO DO RELOGIO, RECUPERAÇÃO SISTEMA DE VELOCIDADE, CONSERTO PLACA TACORAFO, CONSERTO DO PAINEL E ELETRICO", "valor": 5492.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5009", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "5770", "data_emissao": "2026-05-29", "produto": "KIT LACRE REPARO, MOLDURA FRONTAL 7D, TAMPA LACRE MTCO", "valor": 208.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5009", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26881", "data_emissao": "2026-05-29", "produto": "ENSAIO METROLOGICO DO TACOGRAFO, SELAGEM DO TACOGRAFO, RECUPERAÇÃO SIST GAVETA, MÃO DE OBRA.", "valor": 5492.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5009", "servico": "MANUTENÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "13369", "data_emissao": "2026-06-08", "produto": "COLA TREBOND, JUNTA TURBINA RETORNO, TUDO LUBRIFICADO", "valor": 289.61, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5009", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26243", "data_emissao": "2026-06-08", "produto": "SERVIÇO DIVERSOS", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5009", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "301547", "data_emissao": "2026-07-02", "produto": "VARETA DE OLEO 7100", "valor": 50.0, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5015", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "6560", "data_emissao": "2023-07-13", "produto": "SERVIÇO DE REVISÃO:\nSISTEMA INTERCOOLER\nFEIXE DE MOLA\nALAVANCA DA MACHA\nMECANICA\nCORREIA DO MOTOR\nFREIO DE RODA.", "valor": 1200.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5015", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "42115", "data_emissao": "2025-11-28", "produto": "BUCHA/ COXIM/FECHADURA/KIT COXIM/ RESERVATORIO/DIAFRAG.", "valor": 1362.6, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5015", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "19319", "data_emissao": "2025-12-30", "produto": "FECHADURA PORTA INT. VW CAM. L/D", "valor": 134.1, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5015", "servico": "OFICINA", "descricao": "USO DA OFICINA ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "298151", "data_emissao": "2026-05-14", "produto": "ARRUELA ALUMINIO 21MM, BUJÃO CARTER, FILTRO COMBUSTÍVEL BLINDADO MOTOR, FILTRO COMBUSTIVEL SEDIMENTADOR, FILTRO LUBRIFIANTE BLINDADO.", "valor": 207.85, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5015", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "261029", "data_emissao": "2026-06-24", "produto": "ENSAIO E SELAGEM DE TACOGRAFO, RECUPERAÇÃO DE RELOGIO", "valor": 432.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO"}, {"prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "13448", "data_emissao": "2026-07-14", "produto": "OLEO DE FREIO DOT 4 500ML +CILINDRO DE EMBREAGEM+CILINDRO BEM AUX", "valor": 365.09, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "13448", "data_emissao": "2026-07-14", "produto": "SERVIÇOS DIVERSOS", "valor": 200.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5015", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23762", "data_emissao": "2026-07-31", "produto": "ESPELHO AVULSO ", "valor": 89.1, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "426034", "data_emissao": "2025-06-06", "produto": "OLEO MT INGRAX 20L 15W40 MULTIMAX TURBO-10216", "valor": 334.31, "fornecedor_codigo": "", "empresa": "PADRE CÍCERO"}, {"prefixo": "5016", "servico": "PNEU", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10092", "data_emissao": "2025-10-08", "produto": "PM CAMINHAO 7.50 X 16 BDL VIKRA\nPM CAMINHAO 7.50 X 16 BDL VIKRA\n\nRECAUCHUTAGEM OU REGENERACAO DOS PNEUS\nREFORMA DOS PNEUMATICOS USADOS", "valor": 940.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL RENOVADORA DE PNUS"}, {"prefixo": "5016", "servico": "PNEU", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "2282", "data_emissao": "2025-10-28", "produto": "PROTETOR ARO16 TOPTECH\nCAMARA DE AR 750 X 16 MGM", "valor": 123.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5016", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "19796", "data_emissao": "2025-10-27", "produto": "PNEU CONVENCIONAL CARGA LEVE CTL 7.50-16R CR100 PR14 122/118M GD", "valor": 1412.0, "fornecedor_codigo": "", "empresa": "MAGNUM DISTRIBUIDORA DE PNEUS S/A"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "1218", "data_emissao": "2025-11-05", "produto": "JOGO DE EMBUCHAMENTO DA MANGA DE EIXO\nPINO DE MANGA DE EIXO\nGRAXA AZUL DE ROLAMENTO\nREGULADOR DE TENSÃO", "valor": 1140.0, "fornecedor_codigo": "", "empresa": "R J DA CUNHA LTDA"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "41166", "data_emissao": "2025-11-04", "produto": "PORTA ESCOVA UF186/4\nTRAVA ROSCA WB610G 0082136000\nBARRA DIRECAO ZL9121\nRETENTOR RODA AR5118\nTERMINAL DIRECAO ZL9107\nTERMINAL DIRECAO ZL9108", "valor": 628.2, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5016", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "4559", "data_emissao": "2025-11-11", "produto": "ALINHAMENTO PESADO\nBALANCEAMENTO PESADO", "valor": 160.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "18788", "data_emissao": "2025-11-28", "produto": "ESPAÇADOR /TERMINAL P/FIO/ PORTA FUSIVEL/FUSIVEL LAMINA", "valor": 57.51, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "13092", "data_emissao": "2026-01-13", "produto": "GARFO SELECAO MARCHA/ VALVULA BOSCH/ ANEL SINCRONIZADOR BOLIADO/ OLEO CAIXA MARCHA 80W90 LITRO (OFIC)/ ANEL SINCRONIZADOR/ REPARO VALVULA....", "valor": 2463.65, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "290572", "data_emissao": "2026-01-09", "produto": "ENGRENAGEM EIXO/ENGRENAGEM 3A/ SINCRONIZADOR 3A/4A/ ", "valor": 3468.55, "fornecedor_codigo": "136/4413/4343", "empresa": "JS DISTRIBUIDORA DE PECAS S/A"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "290561", "data_emissao": "2026-01-09", "produto": "MOTOR PARTIDA 12V ", "valor": 1848.51, "fornecedor_codigo": "136/4413/4343", "empresa": "JS DISTRIBUIDORA DE PECAS S/A"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "290586", "data_emissao": "2026-01-10", "produto": "ANEL SINCRONIZADOR 4A/5A RE CAMBO FSO4405C 0065133", "valor": 305.96, "fornecedor_codigo": "136/4413/4343", "empresa": "JS DISTRIBUIDORA DE PECAS S/A"}, {"prefixo": "5016", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "HIDRAULICO", "local": "EXTERNO", "nota_fiscal": "13234", "data_emissao": "2026-03-30", "produto": "REPARO BOMBA/MANGUEIRA/ABRACADEIRA/OLEO...", "valor": 4805.95, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5016", "servico": "VENDAS", "descricao": "PEÇAS PARA REPARO DO CAMINHÃO (PEDIDO G128)", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "266", "data_emissao": "2026-04-28", "produto": "LAMPADA FAROL, MANUEIRA PVC, PALETA LIMPAR PARABRISA, FILTRO AR, FILTRO SEDIMENTADOR, FILTRO/ELEMENTO/REFIL OLEO LUBRIFICANTE, FILTRO DE COMBUSTIVEL E RESPIRO MOTOR.", "valor": 855.99, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5016", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA (REF AO PEDIDO G128)", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "26137", "data_emissao": "2026-04-28", "produto": "LUBRIFICAÇÃO, LIMPEZA, FRUSTAÇÃO, REVISÃO, CARGA E RECARGA.", "valor": 930.0, "fornecedor_codigo": "5363", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5016", "servico": "OFICINA", "descricao": "USO DA OFICINA ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "298274", "data_emissao": "2026-05-16", "produto": "BOIA TANQUE 150LT", "valor": 293.48, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5016", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "26876", "data_emissao": "2026-05-28", "produto": "ENSAIO METROLOGICO DO TACOGRAFO, SELAGEM DO TACOGRAFO, RECUPERAÇÃO SIST GAVETA, MÃO DE OBRA.", "valor": 1042.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5016", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "49229", "data_emissao": "2026-06-10", "produto": "FAROL FW 112 LD E FAROL FW 112 LE", "valor": 388.0, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"prefixo": "5016", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26271", "data_emissao": "2026-06-24", "produto": "SERVIÇO DIVERSOS", "valor": 230.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13406", "data_emissao": "2026-06-26", "produto": "HELICE MOTOR", "valor": 290.12, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5016", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "26134", "data_emissao": "2026-07-10", "produto": "BOMBA INJETORA+BICOS+SERVIÇOS", "valor": 4217.4, "fornecedor_codigo": "5081", "empresa": "BRASIL DIESEL"}, {"prefixo": "5017", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "12772", "data_emissao": "2025-07-08", "produto": "COLA 3M\nLAMPADA FAROL\nLAMPADA FAROL\nFITA ISOLANTE (ANTICHAMA)\nLAMPADA PINGÃO 24V\nTERMINAL ENCAIXE FEMEA\nLANTERNA BAU LED CRISTAL\nLAMPADA 69 24V\nSOQUETE FAROL\nREBITE 10X12 BRONZE\nLONA FREIO TS\nGRAXA ROLAMENTO\nCOLA SILICONE\nARANHA TRAVA RODA\nRETENTOR RODA TRASEIRA\nFLUIDO EMBREAGEM\nRESERVATORIO SERVO\nROLAMENTO RODA\n", "valor": 1130.97, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5017", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "159467", "data_emissao": "2025-07-22", "produto": "R 99 37 E 23 MANGUEIRA", "valor": 331.28, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5017", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "12819", "data_emissao": "2025-07-25", "produto": "KIT PARAFUSO\nKIT SOLDA RECUPERAÇÃO\nKIT ABRAÇADEIRA\nCINTA PLÁSTICA\nADITIVO RADIADOR\nKIT MANGUEIRA", "valor": 630.48, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5017", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "7895", "data_emissao": "2025-07-25", "produto": "MONTAGEM/DESMONTAGEM FRONTAL MOTOR\nRECUPERAÇÃO BASE MOTOR\nSERVIÇO RETIFICA TRAVESSA MOTOR", "valor": 2520.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5017", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO ", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "185368", "data_emissao": "2026-04-02", "produto": "BATERIA M150BD MGE3 SLI ", "valor": 1848.0, "fornecedor_codigo": "858", "empresa": "CODIBA COMERCIAL DISTRIBUIDORA DE BATERIA"}, {"prefixo": "5017", "servico": "OFICINA", "descricao": "USO DA OFICINA ", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "168161", "data_emissao": "2026-05-12", "produto": "REULADORA DE BOLSA DE AR", "valor": 303.31, "fornecedor_codigo": "170", "empresa": "VIA DIESEL DISTRIBUIDORA DE VEICULOS MOT E PEÇAS LTDA"}, {"prefixo": "5017", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "22234", "data_emissao": "2026-05-18", "produto": "MEIO PARALAMA, PARALAMA PLAST, TAMPA RESERVATÓRIO, ANTI-FERRUGEM, TOMADA ELETRICA, LANTERNA, SUPORTE LANTERNA...", "valor": 842.85, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5017", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "22462", "data_emissao": "2026-05-27", "produto": "COLA THREE BOND, LAMPADA 1141,1034, 67, ABRAÇADEIRA, BICO P/MANGUEIRA, BORRACHA CANALETA.", "valor": 162.9, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5017", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "22463", "data_emissao": "2026-05-27", "produto": "COLA  SILICONE, TERMINAL CABO, ANCHO CORTINA", "valor": 186.75, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5017", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "EXTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 660.5374999999999, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"prefixo": "5017", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "301140", "data_emissao": "2026-06-25", "produto": "FILTRO DE AR E FILTRO DIESEL", "valor": 128.42, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5017", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 437.5, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "7857", "data_emissao": "2025-07-08", "produto": "SERVIÇO SCANNER\nSERVIÇO REVISÃO ELÉTRICA", "valor": 500.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "16134", "data_emissao": "2025-08-05", "produto": "GANCHO CORTINA PLASTICO MB 1935/VOLVO EDC/SCANIA\nPALHETA LIMP 24 POL. VW CONSTELLATION/IVECO DAILY CC24\nMANGUEIRA ESPIRAL P/ LIMPEZA 3,5 MTS (PT)\nUNIÃO MANGUEIRA NYLON 08MM MDM-PUC08 (2080.003.000)\nCARREGADOR P/ TOMADA USB 2 SAIDAS 12/24V (ASX-8/233/DNI058)\nSOLENOIDE AUX. M. PARTIDA 24V 29MT  DELCOREMY (DNI-8185)\nRELE PISCA 3S 12V C/ SUP. 500AMP (IM-11430). DNI0212-S3\nTERMINAL ENCAIXE FEMEA MEDIO C/ TRAVA (TE-4013S) 135\nCONECTOR FEMEA 1 VIA (FRONTEC  F-201)\nFIO 10 4,00MM (PRETO)\nESPAGUETE CONDUITE FINO 5MM 3/16 CORRUGADO\nTAMPA ACABAMENTO ESPELHO FORD/VW D/E (ER1142B)", "valor": 579.69, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5019", "servico": "PNEU", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4213", "data_emissao": "2025-10-07", "produto": "PM CAMINHAO 275/80R22,5RT42 RT42 DUNLO\n\nRECAUCHUTAGEM OU REGENERACAO DE PNEUS \nREFORMA DOS PNEUMATICOS USADOS", "valor": 840.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "259", "data_emissao": "2025-12-08", "produto": "SERVICO TROCA BOMBA DE EMBREAGEM", "valor": 150.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "42553", "data_emissao": "2025-12-11", "produto": "CIL AUX EMBREAGEM 47805293\nOLEO FREIO 7402 DOT4 500ML\nADITIVO RADIADOR 3010 (ROSA)", "valor": 515.7, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "LIMPA, REVISÃO, CONSERTO, BLINDAGEM....", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "259", "data_emissao": "2025-12-08", "produto": "SERVIÇO DE  TROCA DA BOMBA  DE EMBREAGEM ", "valor": 150.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL "}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS DEM EDIFICAÇÕES, ELETRÔNICA, ELETROTÉCNICA, MECÂNICA, TELECOMUNICAÇÕES..", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "259", "data_emissao": "2025-12-08", "produto": "SERVIÇOS TROCA DA BOMBA  DE EMBREAGEM", "valor": 150.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL "}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "259", "data_emissao": "2025-12-08", "produto": "VEICULOS, APARELHOS, MOTORES, CONSERTO,BLINDAGEM E ETC.", "valor": 150.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "19321", "data_emissao": "2025-12-30", "produto": "PARAFUSO/CHICOTE/LAMPADA/SIRENE/ABRAÇADEIRA/FITA/", "valor": 591.12, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "256", "data_emissao": "2026-12-03", "produto": "BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS ,ETC..", "valor": 1100.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "20035", "data_emissao": "2026-02-03", "produto": "CALOTA  RODOAR TACO-AR/MOLA P/CALOTA/CANO CROMADO", "valor": 190.8, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "2652", "data_emissao": "2026-02-13", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E ETC..", "valor": 1400.0, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5019", "servico": "PNEU", "descricao": "SERVIÇO TECNICO", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "2230", "data_emissao": "2026-02-25", "produto": "PNEU 295/80R22.5 TL 152M A. PROS", "valor": 3848.7, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "1900", "data_emissao": "2026-03-02", "produto": "PERFIL SECADOR APU WABCO ORIGINAL PRATA REP SECADOR AR APU WABCO", "valor": 550.0, "fornecedor_codigo": "4823", "empresa": "BELL FREIOS AR COMERCIO E SERVIÇOS LTDA "}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO/MAO DE OBRA VALV PEU", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26127", "data_emissao": "2026-03-02", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E REGARGA", "valor": 120.0, "fornecedor_codigo": "4823", "empresa": "BELL FREIOS AR COMERCIO E SERVIÇOS LTDA "}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO ", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "20567", "data_emissao": "2026-02-28", "produto": "MANGUEIRA RODOAR../MEIO PARALAMA PLAST/LANTERNA LAT/VALVULA RODOAR CURVA EM U GIRATORIA../ TRIANGULO SEGURANÇA/CANO CROMADO P/RODOAR 1.20", "valor": 292.77, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO ", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "184", "data_emissao": "2026-02-28", "produto": "VALVULA PNEUS S/CAM R34561", "valor": 40.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO/REFORMA DE PNEUMÁTICOS USADOS ", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "26140", "data_emissao": "2026-02-28", "produto": "RECAUCHUTAGEM OU REGENERAÇÃO DE PNEUS ", "valor": 210.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO ", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "17665", "data_emissao": "2026-02-24", "produto": "MANGUEIRA R6 1/2/ LUVA 3/8 FEMEA BSP LATAO / ESPIG. FIXO /CAPA DE ALTA /TERMINAL ....", "valor": 256.2, "fornecedor_codigo": "", "empresa": "J. ROCHA DA SILVA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "17745", "data_emissao": "2026-03-05", "produto": "CALIBRADOR / ESPIGAO GIRATORIO/PORCA DE AÇO/MANGUEIRA ", "valor": 308.0, "fornecedor_codigo": "", "empresa": "J.ROCHA DA SILVA"}, {"prefixo": "5019", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "21184", "data_emissao": "2026-03-31", "produto": "CANO CROMADO/VALVULA RODOAR GRANDE", "valor": 27.45, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5019", "servico": "SERVIÇO", "descricao": "SERVIÇO DE MÃO DE OBRA - MONTAGEM E DESMONTAGEM - LIMPEZA - ORÇAMENTO DE RETIFICA", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26157", "data_emissao": "2026-04-10", "produto": "LUBRIFICAÇÃO/LIMPEZA/LUSTRAÇÃO/REVISÃO/CARGA...", "valor": 4500.0, "fornecedor_codigo": "", "empresa": "B DE L COSTA LTDA "}, {"prefixo": "5019", "servico": "VENDAS", "descricao": "PEÇAS PARA REPARO DO CAMINHÃO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "296955", "data_emissao": "2026-04-24", "produto": "BOMBA AGUA S/ANEL PARAFUSO, BRONZINA MANCAL, KIT FORCA, PULVERIADOR.", "valor": 5745.74, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5019", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "8869", "data_emissao": "2026-05-04", "produto": "REPARO PORTA INJETOR, CONJUNTO DE VALVULA, BIO INJETOR, REPARO, ELEMENTO DA ABB. ALTA", "valor": 9079.97, "fornecedor_codigo": "974", "empresa": "HIDRAUDIESEL SERVIÇOS"}, {"prefixo": "5019", "servico": "SERVIÇO", "descricao": "RECONDICIONAMENTO DE MOTORES ", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "4", "data_emissao": "2026-05-06", "produto": "MÃO DE OBRA EM BICOS INJETORES E BOMBA MOTOR CUMMINS", "valor": 1983.6, "fornecedor_codigo": "974", "empresa": "HIDRAUDIESEL SERVIÇOS"}, {"prefixo": "5019", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "8870", "data_emissao": "2026-05-04", "produto": "BUCHA DE BIELA E DE COMANDO, GUIA ADM, VALVULA ADM E ESC, SELOS: 5810,4020,2250 E 2520.", "valor": 2654.15, "fornecedor_codigo": "974", "empresa": "HIDRAUDIESEL SERVIÇOS"}, {"prefixo": "5019", "servico": "SERVIÇO", "descricao": "RECONDICIONAMENTO DE MOTORES ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "3", "data_emissao": "2026-05-06", "produto": "SERVIÇO DE RETIFICA EM CABEÇOTE, BIELA, VIRABREQUIM, COMANDO E BLOCO, MOTOR CUMMINS", "valor": 7629.42, "fornecedor_codigo": "974", "empresa": "HIDRAUDIESEL SERVIÇOS"}, {"prefixo": "5019", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "297131", "data_emissao": "2026-04-27", "produto": "BOMBA OLEO, JG JUNTA INFERIOR", "valor": 1244.0, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5019", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13347", "data_emissao": "2026-05-27", "produto": "VALVULA TERMOST., KIT EMBREA, FILTROS: AR, COMBUS, RACOR, LUBRIF, OLEO MOTOR...", "valor": 10009.29, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5019", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "26223", "data_emissao": "2026-05-27", "produto": "SERVIÇO DE MOTOR, RETIFICA VOLANTE, SERVIÇO EXTRAÇÃO, RADIADOR, BOMBA HIDRAULICA.", "valor": 7300.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5019", "servico": "OFICINA", "descricao": "USO DA OFICINA ", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "58013", "data_emissao": "2026-05-27", "produto": "EMBREAGEM VISC VW MAN ", "valor": 2035.0, "fornecedor_codigo": "", "empresa": "AUTO PEÇAS PADRE CICERO"}, {"prefixo": "5019", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "13405", "data_emissao": "2026-06-04", "produto": "SUPORTE BOMBA DE COMBUSTIVEL", "valor": 965.13, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5021", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICA", "local": "EXTERNO", "nota_fiscal": "1481", "data_emissao": "2023-07-31", "produto": "FAROL DIANT. VW CAM.20000 DUPLO L/D(PRADOLUX) \nFAROL DIANT. VW CAM.20000 DUPLO L/E (PRADOLUX)\nLAMPADA H1 12V 55W\nLAMPADA PINGO DAGUA 12V C/08 LEDS GDE\nFAIXA REFLETIVA PARACHOQUE 3M.", "valor": 814.5, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5021", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "12304", "data_emissao": "2025-01-16", "produto": "PALHETA LIMPADOR\nFAIXA PARA-CHOQUE\nTAMPA BUZINA\nMACANETA VIDRO VW\nENGENHO PORTA WORK LD\nFILTRO HIDRAULICO\nABRACADEIRA FITA\nOLEO HIDRAULICO\nMANGUEIRA HIDRAULICA PRESSÃO\nREPARO BOMBA DIREÇAO \nFILTRO AR EXTERNO \nFILTRO LUBRIF\nFILTRO COMBUSTIVEL S/ DRENO \nOLEO MOTOR", "valor": 2088.63, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5021", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "4610", "data_emissao": "2025-09-12", "produto": "PNEU 275/80R22.5 149/146L ESMXS SPM 18L 2UND", "valor": 3451.3, "fornecedor_codigo": "", "empresa": "ITR COMERCIOS DE PNEUS E PECAS S.A"}, {"prefixo": "5021", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "8012", "data_emissao": "2025-10-07", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MÁQUINAS, VEÍCULOS, APARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITAS AO ICMS).\n\nRETIFICA ΡΟΝΤΑ ΕΙΧΟ \nEMBUCHAMENTO\nDESMONTAGEM COLUNA\nDIRECAO \nPORTA CABINE  \n", "valor": 1900.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5021", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "12959", "data_emissao": "2025-10-07", "produto": "GRAXA ROLAMENTO\nCOLA 3M (ORIGINAL)\nREBITE 10X12 BRONZE\nLONA FREIO DT\nCUPILHA MANGA EIXO DT\nCUPILHA MANGA EIXO DT\nRETENTOR RODA DIANTEIRA\nREPARO EMBUCHAMENTO\nKIT PARAFUSO\nBUCHA VOLANTE DIRECAO\nBUCHA VOLANTE\nCILINDRO ING VW\nFITA ISOLANTE (ANTICHAMA)\nFECHADURA PORTA\nTRAVA DIRECAO\nCOLA SILICONE\nJG ARRUELA AJUSTE\nMACANETA PORTA INTERNA\nMACANETA PORTA EXTENA VW\nTERMINAL ENCAIXE FEMEA\nBUZINA BIBI", "valor": 2287.86, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5021", "servico": "PNEU", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "4212", "data_emissao": "2025-10-10", "produto": "ALINHAMENTO PESADO\nBALANCEAMENTO PESADO\n\nRECAUCHUTAGEM OU REGENERACAO DOS PNEUS\nREFORMA DOS PNEUMATICOS USADOS", "valor": 160.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5021", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "20565", "data_emissao": "2026-02-28", "produto": "MACANETA INT. PORTAVW CAM L/E (ATEMIS 1287)", "valor": 150.3, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5021", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "13242", "data_emissao": "2026-04-01", "produto": "PRESILJA/ CAME RETORNO/ PASTILHA/ ARRUELA/ BUCHA/...", "valor": 2144.17, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5021", "servico": "SERVIÇO", "descricao": "SERVIÇO DESMONTAGEM COLUNADIREÇÃO", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26127", "data_emissao": "2026-04-01", "produto": "LUBRIFICAÇÃO/ LIMPEZA/ LUSTRAÇÃO/ REVISÃO...", "valor": 700.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5021", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "21867", "data_emissao": "2026-04-30", "produto": "PRESILHA FORRO, CALOTA RODOAR, COLA SILICONE, MANGUEIRA ESPIRAL.", "valor": 152.0, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5021", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "1398", "data_emissao": "2026-04-30", "produto": "JOGO DE ANEIS DE SEGMENTO", "valor": 600.0, "fornecedor_codigo": "4698", "empresa": "R J DA CUNHA LTDA"}, {"prefixo": "5021", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "23082", "data_emissao": "2026-06-30", "produto": "PARAFUSO+LENTE TRAZ", "valor": 51.84, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "11313", "data_emissao": "2023-09-13", "produto": "PNEU MAGNUM 275/80 R 22.5 MGM02-DIR.", "valor": 4000.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "7613", "data_emissao": "2023-09-13", "produto": "BALANCEAMENTO E ALINHAMENTO 1.", "valor": 80.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "280953", "data_emissao": "2025-08-11", "produto": "ENGRENAGEM COMANDO VALVULA MOTOR 609\nFILTRO LUBRIF BLINDADO MOTOR 69216\nOLEO MOTOR SAE 15W40 API CI4 E7 MINERAL RHINO ULTRA 2000 20LT 150627", "valor": 1042.63, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "457159", "data_emissao": "2025-08-13", "produto": "COMPRESSOR FREIO LK38 VW/VOLVO MWM-816.0008-0", "valor": 1399.88, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "12859", "data_emissao": "2025-08-14", "produto": "COLA 3M\nKIT VEDAÇÃO COMPRESSOR\nRETENTOR POLIA\nJUNTA TAMPA DISTRIB\nJUNTA CETER\nCOLA TREEBOND", "valor": 442.92, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "459313", "data_emissao": "2025-08-18", "produto": "FILTRO COMB SEDIM BLIND MT CUMMINS/MWM-WK950/14\nFILTRO COMBUS BLIND MT MWM X-10/12 4/6Cl-WK1124\nFILTRO OLEO LUB BLIND MT CUMM/CATERP/DEU-W11102/4 \nFILTRO AR PRIM MT CUMMINS/MBB/MAN/MWM-C27830", "valor": 290.91, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "459660", "data_emissao": "2025-08-18", "produto": "VÁLVULA SOLEN BOMBA INJ 12V D20/S10/RANG-SC1240", "valor": 100.25, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "12907", "data_emissao": "2025-09-04", "produto": "FILTRO LUBRIF", "valor": 80.46, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "PNEU", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4124", "data_emissao": "2025-09-30", "produto": "PM CAMINHAO 275/80R22,5 RT42 RT42 DUNLO S\nPM CAMINHAO 275/80R22,5 RT42 RT42 DUNLO S\nMANCHAO RAC 20 \nMANCHAO RAC 20\nMANCHAO RAC 42", "valor": 1499.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "47991", "data_emissao": "2025-10-01", "produto": "MOTOR LIMP PARAB VW 13180/8150-6B22", "valor": 350.52, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "39866", "data_emissao": "2025-10-01", "produto": "CHAVE LIMPADOR K1205980\nCHAVE SETA K1105980", "valor": 138.6, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "58109", "data_emissao": "2025-10-02", "produto": "LINHA ANGELIN 5,0 X 13,0 3,00", "valor": 92.83, "fornecedor_codigo": "", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "500566", "data_emissao": "2025-10-04", "produto": "PF SX 1/2X5.1/2 ZB UNC (13fpp) CH3/4\nPF SX 10X20 P.1,5 MA FLANGEADO 781851\nPF FR 1/4X4 ZB UNID\nPF FR 1/4X5 ZB (100) UNID\nPF FR 5/16X7 ZB (100) UNID\nPF FR 1/2X1.1/2 ZB(50) UNID\nPO TRAV 1/2 UNC 13fios ZB ch 3/4\nPO TRAV 1/2 BSW 12fios ZB ch3/4\nARR LI 1/4 ZB UNID\nARR LI 1/4 ZB UNID\nARR LI 5/16 ZB UNID\nARR LI 1/2 ZB UNID\nBROCA MOURAO FIBRO 1/4 39160 39159 HTOM", "valor": 158.21, "fornecedor_codigo": "", "empresa": "M A DE PAULA FERNANDES LTDA"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "500566", "data_emissao": "2025-10-04", "produto": "PF SX 1/2X5.1/2 ZB UNC (13fpp) CH3/4\nPF SX 10X20 P.1,5 MA FLANGEADO 781851\nPF FR 1/4X4 ZB UNID\nPF FR 1/4X5 ZB (100) UNID\nPF FR 5/16X7 ZB (100) UNID\nPF FR 1/2X1.1/2 ZB(50) UNID\nPO TRAV 1/2 UNC 13fios ZB ch 3/4\nPO TRAV 1/2 BSW 12fios ZB ch3/4\nARR LI 1/4 ZB UNID\nARR LI 1/4 ZB UNID\nARR LI 5/16 ZB UNID\nARR LI 1/2 ZB UNID\nBROCA MOURAO FIBRO 1/4 39160 39159 HTOM", "valor": 158.21, "fornecedor_codigo": "", "empresa": "M A DE PAULA FERNANDES LTDA"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "212", "data_emissao": "2025-10-13", "produto": "SERVIÇO EM VW 15 - 180\n\nLUBRIFICAÇÃO, LIMPEZA , LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MÁQUINAS, VEÍCULOS, APARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PARTES EMPREGADAS , QUE FICAM SUJEITAS AO ICMS)", "valor": 640.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "500678", "data_emissao": "2025-10-13", "produto": "ASSOALHO ITAUBA EXTRA 15\"", "valor": 174.6, "fornecedor_codigo": "", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITAS AO ICMS)", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "222", "data_emissao": "2025-10-28", "produto": "SERVICO DE CALIBRAGEM DE BICO + BICO", "valor": 807.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "288987", "data_emissao": "2025-12-10", "produto": "ADITIVO ANTICORROSIVO MOTOR 0003875\nANEL TOMBAK INOX 0.15MM MOTOR 0001122\nFILTRO AR EXTERNO 0050775\nFILTRO LUBRIFICANTE BLINDADO 0062734\nJUNTA CARTER MOTOR 0002795\nJUNTA COLETOR ADMISSAO MOTOR 0002901\nJUNTA COLETOR ESCAPE MOTOR 0074092\nKIT CILINDRO MOTOR 01 CIL 0066902\nOLEO MOTOR SAE 15W40 API CI4 E7 MINERAL RHINO ULTRA 2000 20LT 0150627\nSELANET CAMISA MOOR DOW CORN 5 0000072", "valor": 4543.35, "fornecedor_codigo": "", "empresa": "JS DISTRIBUIDORA DE PECAS S/A"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "LIMPEZA, LUBRIFICAÇÃO, LUSTRAÇÃO, REVISÃO, CARGA, CONSERTO......", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "262", "data_emissao": "2025-12-18", "produto": "SERVIÇO DE RETIFICA EM CABEÇOTE", "valor": 2925.6, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "APARELHOS/MORORES/RESTAURÇÃO E CONSERVAÇÃO DE MAQUINAS", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "261", "data_emissao": "2025-12-18", "produto": "LIMPEZA/ LUSTRAÇÃO/BLINAGEM...", "valor": 2400.0, "fornecedor_codigo": "", "empresa": "R.E DIESSEL"}, {"prefixo": "5022", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "553.94", "data_emissao": "2025-12-23", "produto": "BOMBA AGUA MOTOR/JUNTA TAMPA/SELANTE CAMISA", "valor": 553.94, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5022", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "13336", "data_emissao": "2026-05-21", "produto": "ROLAMENTO, PINO CABINE, COXIM CABINE, SUPORTE AUXILIAR, COLA TREEBOND, KIT VEDAÇÃO, OLEO HIDRAULICO, REPARO BOMBA DIREÇÃO...", "valor": 2383.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "13337", "data_emissao": "2026-05-21", "produto": "BUCHA VOLANTE, B.V DIREÇÃO, CAME RETORNO, CILINDRO IN VW, TRAVA DIREÇÃO, CHAVE ACIONAMENTO, ARRUELA TRAVA COLUNA DIREÇÃO.", "valor": 980.96, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "26213", "data_emissao": "2026-05-21", "produto": "SERVIÇO SUPENSÃO CABINE, BOMBA HIDRAULICA, TRANSMISSÃO, VAZAMENTO MOTOR, ALTERNADOR.", "valor": 1000.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "26214", "data_emissao": "2026-05-21", "produto": "RETIFICA COLUNA DIREÇÃO, DESMONTAGEM COLUNA DIREÇÃO", "valor": 600.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23083", "data_emissao": "2026-06-30", "produto": "MAÇANETA+PALHETA+SOQUETE ", "valor": 126.0, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "SISTEMA DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "13418", "data_emissao": "2026-07-01", "produto": "OLEO HIDRAULICO+FILTRO HIDRAULICO+BOMBA HIDRAULICO", "valor": 1476.32, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26282", "data_emissao": "2026-07-01", "produto": "SERVIÇO DE BOMBA HIDRULICA", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26636", "data_emissao": "2026-07-01", "produto": "SERVIÇO DE INSTAÇÃO DE LIMPADORES", "valor": 80.0, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "13429", "data_emissao": "2026-07-09", "produto": "REPARO DE VALVULA DE PRESSAO +REPARO DE VALVULA+REPARO DE VALVULA DE PEDAL", "valor": 269.98, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5022", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26289", "data_emissao": "2026-07-09", "produto": "REVISÃO PARC DE SISTEMA DE AR ", "valor": 400.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "16129", "data_emissao": "2025-08-05", "produto": "LAMPADA PINGO D'ÁGUA 12V GDE\nMAÇANETA LEVANTA VIDRO ACCELO (PRETA)", "valor": 37.35, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "16132", "data_emissao": "2025-08-05", "produto": "PORTA COPOS PAINEL VW CAM (QUALITY 30256)", "valor": 71.1, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "500681", "data_emissao": "2025-10-16", "produto": "ASSOALHO ITAUBA EXTRA 15\"", "valor": 177.6, "fornecedor_codigo": "", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "REFORMMA PENEUMATICOS USADOS  ", "sistema": "PNEUS", "local": "EXTERNO", "nota_fiscal": "4872", "data_emissao": "2025-12-19", "produto": "RECACHUTAGEM DE PENEUS  ", "valor": 720.0, "fornecedor_codigo": "", "empresa": "PRATIMONMIAL PENEUS"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "19318", "data_emissao": "2025-12-30", "produto": "ESPELHO AVULSO VW CAM. MOD NOVO(LS/LP)", "valor": 89.1, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS ", "sistema": "PNEUS", "local": "EXTERNO", "nota_fiscal": "4961", "data_emissao": "2026-01-05", "produto": "RECAUCHUTAGEM OU REGENERAÇÃO DE PNEUS ", "valor": 1620.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL  PNEUS"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "MÃO DE OBRA CUÍCA + SOCORRO", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "2652", "data_emissao": "2026-01-21", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA", "valor": 300.0, "fornecedor_codigo": "4823", "empresa": "BELL FREIOS A AR COMERCIO E SERVIÇOS LTDA"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS  ", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "1836", "data_emissao": "2026-01-21", "produto": "REP VALV PROT 4../REP MANETIM ../REP REGULADOR PRESSAO..", "valor": 340.2, "fornecedor_codigo": "4823", "empresa": "BELL FREIOS A AR COMERCIO E SERVIÇOS LTDA"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS  TECNICOS", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "13124", "data_emissao": "2026-01-26", "produto": "KIT EMBREAGEM/CILINDRO EMBREAGEM 2X/ROLAMENTO CENTRO/ ROLAMENTO VOLANTE/JUNTA TORRE...", "valor": 3092.62, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "295236", "data_emissao": "2026-03-24", "produto": "BOMBA AGUA MOTOR ", "valor": 385.68, "fornecedor_codigo": "136/4413/4343", "empresa": "JS PEÇAS"}, {"prefixo": "5025", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "46527", "data_emissao": "2026-03-30", "produto": "CABECOTE FILTRO FH177/FILTRO SEDIMENTADOR ", "valor": 1440.9, "fornecedor_codigo": "4687/2007", "empresa": "CASA DO CAMINHÃO COMERCIO LTDA"}, {"prefixo": "5025", "servico": "SERVIÇO", "descricao": "SERVICO MÃO DE OBRA DO MOTOR MWM ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "2662", "data_emissao": "2026-03-31", "produto": "RECONDICIONAMENTO DE MOTORES EXCETO PEÇAS E PARTES", "valor": 5000.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL "}, {"prefixo": "5025", "servico": "SERVIÇO", "descricao": "SERVIÇO RETIFICA DO MOTOR MWM ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "2661", "data_emissao": "2026-03-31", "produto": "RECONDICIONAMENTO DE MOTORES EXCETO PEÇAS E PARTES", "valor": 4500.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL"}, {"prefixo": "5025", "servico": "SERVIÇO", "descricao": "RECUPERAÇÃO DE BICO", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "2663", "data_emissao": "2026-03-31", "produto": "RECONDICIONAMENTO DE MOTORES EXCETO PEÇAS E PARTES", "valor": 380.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL"}, {"prefixo": "5025", "servico": "VENDAS", "descricao": "PEÇAS PARA REPARO DA EMPILHADEIRAS", "sistema": "", "local": "EXTERNO", "nota_fiscal": "295266", "data_emissao": "2026-03-24", "produto": "VENDA DE MERCADORIA", "valor": 249.3, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5025 e 5016", "servico": "OFICINA", "descricao": "USO DA OFICINA ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "298226", "data_emissao": "2026-05-15", "produto": "BOMBA COMBUSTÍVEL MOTOR, VÁLVULA DESCARGA RÁPIDA RETENÇÃO", "valor": 522.12, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5025", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13449", "data_emissao": "2026-07-14", "produto": "CINTA PLASTICA+CHICOTE DE REDUÇÃO+CORREIA ALTERNADOR+ SUPORTE DO ALTERNADOR", "valor": 505.95, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5025", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "13449", "data_emissao": "2026-07-14", "produto": "SERVIÇO DE CINTA PLASTICA+CHICOTE DE REDUÇÃO+CORREIA ALTERNADOR+ SUPORTE DO ALTERNADOR", "valor": 650.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5025", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "13448", "data_emissao": "2026-07-14", "produto": "OLEO DE FREIO DOT 4 500ML +CILINDRO DE EMBREAGEM+CILINDRO BEM AUX", "valor": 365.09, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5025", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "13448", "data_emissao": "2026-07-14", "produto": "SERVIÇOS DIVERSOS", "valor": 200.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "228757", "data_emissao": "2023-01-18", "produto": "FILTRO COMBUSTIVEL C/BOMBA ELETRICA 0038801.\n", "valor": 2145.0, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5028", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "10638", "data_emissao": "2023-06-23", "produto": "FILTRO DE COMBUSTIVEL S/DRENO\nFILTRO LUBRIF\nFILTRO AR EXTERNO\nFILTRO RACOR\nOLEO MOTOR 15W40 CI4 (BD 20L).", "valor": 1000.3, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "371", "data_emissao": "2023-07-31", "produto": "SERVIÇOS ELETRICOS.", "valor": 40.0, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5028", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "7586", "data_emissao": "2025-02-18", "produto": "SERVIÇOS DIVERSOS", "valor": 250.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "16132", "data_emissao": "2025-08-05", "produto": "PORTA COPOS PAINEL VW CAM (QUALITY 30256)", "valor": 71.1, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5028", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "193", "data_emissao": "2025-08-26", "produto": "SERVICO DE REPARO EM BOMBA INJETORA\n\nJG DE JUNTA \nBOMBA DE PALHETA 308\nARRASTADOR 334\nVALVULA ELETRICA 040\nBICO INJETOR P793", "valor": 1900.0, "fornecedor_codigo": "", "empresa": "BRASIL (R.E) DIESEL LTDA"}, {"prefixo": "5028", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "PENEU", "local": "EXTERNO", "nota_fiscal": "4387", "data_emissao": "2025-10-27", "produto": "PM CAMINHAO 275/80R22,5 RT42 RT42 DUNLO \nMANCHAO RAC 42\nPM CAMINHAO 278/80R22,5 RT42 RT42 DUNLO", "valor": 1490.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5028", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "13145", "data_emissao": "2026-02-06", "produto": "KIT CONEXAO BRONZE/ MOLA PATIM FREIO/ DIAFRAGMA..", "valor": 319.24, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "13302", "data_emissao": "2026-04-30", "produto": "REPARO CUICA, OLEO FREIO DOT 4, CILINDRO EMBREAGEM, JG EMBUCHAMENTO PEDAL.", "valor": 395.88, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "26181", "data_emissao": "2026-04-30", "produto": "SERVIÇO EMBUCHAMENTO PEDAIS COMANDO, REVISÃO PARC SISTEMA DE AR.", "valor": 550.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "13431", "data_emissao": "2026-07-09", "produto": "BUCHA SUPORTE + GUARDA PO +  COLA SILICONE + RETENTOR TRAMBULADOR + TERMINAL", "valor": 301.52, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26291", "data_emissao": "2026-07-09", "produto": "REVISÃO DO TRAMBULADOR", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "13430", "data_emissao": "2026-07-09", "produto": "PINO CABINE+LAMPADA 1 POLO+JUNTA RESFRIADOR+JUNTA TUCHO+REPARO BOMBA+COLUNA DIREÇÃO+JUNTA TURBINA( P ) + JUNTA TURBINA ( G )+JUNTATURBNA +COXIM CABINE WORK", "valor": 939.8, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5028", "servico": "OPERAÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26290", "data_emissao": "2026-07-09", "produto": "SERVIÇO DE BOMBA+SUSPENÇÃO+CABNE+VAZAMENTO+COLUNA DE DIREÇÃO+REFICA CLUNA", "valor": 1350.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "228757", "data_emissao": "2023-01-18", "produto": "FILTRO COMBUSTIVEL C/BOMBA ELETRICA\n", "valor": 2145.0, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "11783", "data_emissao": "2023-01-20", "produto": "SAE STD RETO 12MB-12MJ (702-12-12)\nCONECTOR MACHO COMPRESSÃO 12MMXM22", "valor": 160.0, "fornecedor_codigo": "", "empresa": "J ROCHA DA SILVA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "6487", "data_emissao": "2023-05-31", "produto": "SERVIÇOS: EMBUCHAMENTO, REMOÇÃO E ENVIAMENTO DO RADIADOR.", "valor": 900.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10569", "data_emissao": "2023-05-31", "produto": "JG ARRUELA AJUSTE\nROLAMENTO RODA\nCOLA DE SILICONE\nREPARO EMBUCHAMENTO\nPINO EMBUCHAMENTO\nRETENTOR RODA DIANTEIRA\nGRAXA ROLAMENTO\nDESENGRIPANTE \nADITIVO RADIADOR.", "valor": 1664.2, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "9421", "data_emissao": "2023-07-10", "produto": "SERVIÇOS:\nCARDAN, SUPORTE, FEIXE DE MOLA TRASEIRO, SOLDA SAPATADO EIXO,ARQUEAMENTO E FEIXE DE MOLA DIANTEIRO.", "valor": 910.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICOS", "local": "EXTERNO", "nota_fiscal": "7739", "data_emissao": "2025-05-29", "produto": "SERVIÇOS DIVERSOS", "valor": 550.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5029", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "4064", "data_emissao": "2025-09-23", "produto": "PM CAMINHAO 275/80R22.5 RT41 RT41 PIREL\nPM CAMINHAO 275/80R22.5 RT41 RT41  MAGNU", "valor": 1440.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO MECÂNICO EM CONSTELLATION 19-320/ PLACA NNO7965", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "1197", "data_emissao": "2025-10-24", "produto": "AUXILIAR DE PARTIDA\nREPARO DE MANECO\nPISTÃO DE MANECO", "valor": 267.0, "fornecedor_codigo": "", "empresa": "BRASIL (R.E) DIESEL LTDA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "19317", "data_emissao": "2025-12-30", "produto": "CONECTOR/LAMPADA/TERMINAL/CONECTOR FEMEA", "valor": 34.47, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "501857", "data_emissao": "2026-02-06", "produto": "PF SX 5/16X4 ZB UNC CH1/2....", "valor": 93.29, "fornecedor_codigo": "2795", "empresa": "M A DE PAULA FERNANDES LTDA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIVIÇOS TECNICOS ", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "501857", "data_emissao": "2026-02-06", "produto": "PF SX 5/16../PO SX 5/16../ARR LI 5/16../PREGO C/C 3/8 PO CAIBRAL", "valor": 93.29, "fornecedor_codigo": "2795", "empresa": "M A DE PAULA FERNANDES LTDA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "44631", "data_emissao": "2026-02-10", "produto": "FILTRO SEDIMENTADOR/CABECOTE FILTRO", "valor": 1432.8, "fornecedor_codigo": "4687/2007", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS DE MÃO DE OBRA", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "2653", "data_emissao": "2026-02-13", "produto": "LUBRIFICAÇÃO,LIMPEZA,LUSTRAÇÃO,REVISÃO,CARGA", "valor": 1024.0, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5029", "servico": "OFICINA", "descricao": "SERVIÇOS PARA USO DA OFICINA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "234", "data_emissao": "2026-02-13", "produto": "DESCRIÇÃO DO PRODUTO/CONJUNREPARO/,,", "valor": 1976.8, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "63735", "data_emissao": "2026-02-05", "produto": "LINHA ANGELIN 5,0X13,0 2,50/ASSOALHO SUCUPIRA15CM", "valor": 260.0, "fornecedor_codigo": "3451", "empresa": "ZANI MADEIRAS COMERCIAL LTDA"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "26242", "data_emissao": "2026-03-23", "produto": "RECAPAGEM DOS PNEUS", "valor": 1480.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5029", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "179989", "data_emissao": "2026-03-26", "produto": "BARRA NITANYL 100MM", "valor": 117.1, "fornecedor_codigo": "4573", "empresa": "E &¨L  MATERIAL DE CONSTRUÇÃO LTDA"}, {"prefixo": "5029", "servico": "SERVIÇO", "descricao": "RECAPAGEM ", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "26543", "data_emissao": "2026-03-12", "produto": "RECAPAGEM GRIPM/ PIREL ", "valor": 960.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5029", "servico": "OFICINA", "descricao": "USO DA OFICINA ", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "297440", "data_emissao": "2026-05-02", "produto": "ROLAMENTO CARDAN, TERMINAL BARRA DIREÇÃO LE E TERMINAL DIREÇÃO LD.", "valor": 289.45, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10694", "data_emissao": "2023-07-07", "produto": "TENSOR CORREIA HR\nJUNTA CARTER\nCORREIA\nVELA AQUECEDORA HR\nCORREIA\nCORREIA\nVEDAÇÃO\nFILTRO AR HR\nFILTRO COMB HR\nOLEO MOTOR 15W40 CI4\nFILTRO LUBRIF HR\nJUNTA\nABRAÇADEIRA FITA\nABRAÇADEIRA FITA 19X27 14MM\nLAMPADA H4.", "valor": 1799.88, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "6583", "data_emissao": "2023-09-28", "produto": "METRIC O RING NBR 70 BLACK.", "valor": 18.0, "fornecedor_codigo": "", "empresa": "RAIZ COMERCIO DE VEDAÇÕES\n MANGUEIRAS E HIDRAULICOS"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "115", "data_emissao": "2025-02-21", "produto": "SERVIÇO DE RECUPERAÇÃO DA BOMBA", "valor": 2790.0, "fornecedor_codigo": "", "empresa": " R E DIESEL LTDA"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "16132", "data_emissao": "2025-08-05", "produto": "FAIXA REFLETIVA PARACHOQUE 3M", "valor": 89.1, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5031", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "4742", "data_emissao": "2025-09-24", "produto": "PNEU 205/70R15C 106/104S FRD96 SPP", "valor": 896.0, "fornecedor_codigo": "", "empresa": "ITR COMERCIOS DE PNEUS E PECAS S.A"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "TRANSMISSAO", "local": "EXTERNO", "nota_fiscal": "3683", "data_emissao": "2025-10-09", "produto": "BORRACHA TENSOR HR/K2500 13/\nCRUZETA HR/H100\nBIELETA DT HR/H100/K2500", "valor": 323.0, "fornecedor_codigo": "", "empresa": "M Z AUTO PECAS E SERVICOS LTDA"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "210", "data_emissao": "2025-10-13", "produto": "SERVIÇO EM HR\n\nLUBRIFICAÇÃO, LIMPEZA , LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MÁQUINAS, VEÍCULOS, APARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PARTES EMPREGADAS , QUE FICAM SUJEITAS AO ICMS)", "valor": 880.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "216", "data_emissao": "2025-10-21", "produto": "SERVIÇO DE REPARO EM BOMBA INJETORA", "valor": 2588.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "1691", "data_emissao": "2025-11-10", "produto": "REMOCAO E REDISTRIBUICAO DOS CABOS DE ATERRAMENTO, REVISAO ELETRONICA", "valor": 350.0, "fornecedor_codigo": "", "empresa": "R J DA CUNHA LTDA"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "ELETRICA", "local": "EXTERNO", "nota_fiscal": "252", "data_emissao": "2025-12-03", "produto": "SERVICO DE REVISAO ELETRICA", "valor": 350.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "20863", "data_emissao": "2025-12-23", "produto": "PROTETOR BRP 6.50-10  FLAP/PENU CONVENCIONAL..", "valor": 1044.67, "fornecedor_codigo": "", "empresa": "MAGNUM DISTRIBUIDORA DE PNEUS S/A"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "254", "data_emissao": "2026-12-03", "produto": "LIMPEZA, CARGA E REGARGA, BLINDAGEM, APARELHOS, ETC..", "valor": 350.0, "fornecedor_codigo": "", "empresa": "R. E DIESEL LTDA"}, {"prefixo": "5031", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "17681", "data_emissao": "2026-02-26", "produto": "TERMINAL FG RETO FORS-6-6/CAPA DE ALTA 3/8 /MANGUEIRA HIDRAULICA R17-6-3/8L", "valor": 313.5, "fornecedor_codigo": "", "empresa": "J.ROCHA DA SILVA"}, {"prefixo": "5031", "servico": "VENDAS", "descricao": "PEÇAS PARA CONSERTO DA EMPILHADEIRAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "8973", "data_emissao": "2026-04-02", "produto": "JG JUNTA/ FILTRO/ OLEO MOTOR/ CORREIA/ ESTICADOR/ ...", "valor": 2458.87, "fornecedor_codigo": "5356", "empresa": "DISPEL EMPILHADEIRAS LTDA"}, {"prefixo": "5031", "servico": "OFICINA", "descricao": "USO DA OFICINA ", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "5172", "data_emissao": "2026-05-26", "produto": "KIT REPARO MONTAGEM E MAO DE OBRA DESMONTAGEM DO CILINDRO ", "valor": 826.0, "fornecedor_codigo": "", "empresa": "HIDRAULIC COMERCIO E SERVIÇO LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "14224", "data_emissao": "2023-02-14", "produto": "EXTINTOR PQS 01 KGS ABC BOLINHA.", "valor": 145.0, "fornecedor_codigo": "", "empresa": "G&L SERV E MANUT EM CILINDROS LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "2047", "data_emissao": "2023-08-31", "produto": "LAMPADA H1 12V 55W PHILIPS-12258\nSOQUETE FAROL LAMP H1 MB 1620/VW2000\nLAMPADA PINGO DAGUA 12V GDE 16-3\nFECHO CINTO SEGURANÇA VW CAM. C/ CABO AÇO.\n\n", "valor": 114.66, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "7504", "data_emissao": "2025-01-16", "produto": "SERVIÇOS DIVERSOS ", "valor": 250.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "16130", "data_emissao": "2025-08-05", "produto": "BUCHA ANEL COLUNA DIREÇÃO VW CAM (MD0007) \nCOMPUTADOR PARTIDA VW CAM ORIGINAL (KOSTAL)", "valor": 63.0, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "3402", "data_emissao": "2025-08-05", "produto": "SERVIÇO COMUTADOR E BUCHA", "valor": 40.0, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "500002", "data_emissao": "2025-08-20", "produto": "PF SX5/8X4 G5 UNC (11pp) CH 15/16\nPF SX10X50 8.8 MB (P1,00 )CH 17\nPF SX 10X40 8.8 (P1,25) CH 17\nPF SX 6X30 P . 1,00 MA FLANGEADO 781370\nPF FR 3/8X4 ZB (50) UNID \nPF FR 3/8X6  1/2  ZB (50) UNID \nPF MQ ME PAN 5X50 ZA\nPO TRAV 3/8 UNC ZB CH9/16\nPO TRAV 5/8 UNC 11 fios ZB ch 15/16\nARR LI 3/8 ZB UN\nARR LI 5/8 ZB UNID\nARR PRS 10MM ZB\nPF ALL CIL 10X30 ACO P1,25\n", "valor": 128.92, "fornecedor_codigo": "", "empresa": "CENTRAL DE PARAFUSOS"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "56157", "data_emissao": "2025-08-20", "produto": "LINHA ANGELIN 5,0 X 9,0 7,50", "valor": 160.68, "fornecedor_codigo": "", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5033", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "4284", "data_emissao": "2025-10-17", "produto": "ALINHAMENTO PESADO\nBALANCEAMENTO PESADO", "valor": 160.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5033", "servico": "PNEU", "descricao": "REFORMA DE PNEUMATICOS USADOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4370", "data_emissao": "2025-10-22", "produto": "PM CAMINHAO 275/80R22,5 RT42 RT42 DRC\nPM CAMINHAO 275/80R22,5 RT41 RT41 DRC", "valor": 1440.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJIETOS AO ICMS)", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "225", "data_emissao": "2025-10-31", "produto": "SERVICO EM ALTERNADOR E SUPORTE", "valor": 320.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "18168", "data_emissao": "2025-10-31", "produto": "CABO BATERIA EM METRO 50MM (PT)\nTERMINAL CABO BATERIA PONTEIRA PEQUENO (ST78200)\nFUSIVEL LAMINA 30 AMP\nFUSIVEL LAMINA 30 AMP. MINI", "valor": 103.95, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "242", "data_emissao": "2025-11-17", "produto": "SERVICO REVISAO DO ALTERNADOR", "valor": 250.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "18789", "data_emissao": "2025-11-28", "produto": "LAMPADA/SOQUETE/FITA ISOLANTE/LAMEIRA/ESPELHO/...", "valor": 337.52, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "18789", "data_emissao": "2025-11-28", "produto": "LAMPADA,SOQUETE, FITA, LAMEIRA, PORCA, ARRUELA, PARAFUSO.", "valor": 337.52, "fornecedor_codigo": "", "empresa": " R.E DIESEL LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "", "local": "EXTERNO", "nota_fiscal": "19320", "data_emissao": "2025-12-30", "produto": "l", "valor": 483.08, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "255", "data_emissao": "2026-12-03", "produto": "MOTORES, ELEVADORES, LUBRIFICAÇÃO, CONSERTO, LIMPEZA,ETC..", "valor": 250.0, "fornecedor_codigo": "", "empresa": "R. E. DIESEL LTDA"}, {"prefixo": "5033", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "258", "data_emissao": "2026-04-13", "produto": "FILTRO AR/ FILTRO OLEO/ FILTRO DE COMBUSTIVEL/ LANTERNA", "valor": 1036.4, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5033", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA ", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26110", "data_emissao": "2026-04-13", "produto": "LUBRIFICAÇÃO/LIMPEZA/LUSTRAÇÃO/REVISÃO/CARGA...", "valor": 600.0, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5033", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "11071", "data_emissao": "2026-05-11", "produto": "ASSENTO D MOLEJO TRAS,BUCHA MOLA, PINO DE CENTRO, PORCA SEXTAVADA.\n", "valor": 905.38, "fornecedor_codigo": "1975", "empresa": "IRMÃOS CLARA DIST DE PEÇAS LTDA ME"}, {"prefixo": "5033", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "MOLAS", "local": "EXTERNO", "nota_fiscal": "26528", "data_emissao": "2026-05-11", "produto": "FEIXE DE MOLA TRASEIRO, SERVIÇO SUPORTE.", "valor": 660.0, "fornecedor_codigo": "1975", "empresa": "IRMÃOS CLARA DIST DE PEÇAS LTDA ME"}, {"prefixo": "5033", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "22233", "data_emissao": "2026-05-18", "produto": "LENTE P/LANTERNA, LENTE P/LANTERNA, MAQUINA VIDRO, MACANETA LEVANTA VIDRO, LAMPADA 69.", "valor": 194.4, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5033", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "13331", "data_emissao": "2026-05-18", "produto": "CILINDRO ING, BUCHA VOLANTE, TRAVA DIREÇÃO, BUCHA ESTABILIZADORA, PINO CABINE, ARRUELA TRAVA COLUNA, PASTILHA INGNIÇÃO CHAVE SETA.", "valor": 1352.98, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5033", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "26208", "data_emissao": "2026-05-18", "produto": "DESMONTAGEM COLUNA DIREÇÃO, SERVIÇO ESTABILIZADOR, SUSPENSÃO CABINE, RETIFICA COLUNA.", "valor": 1000.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5033", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "22461", "data_emissao": "2026-05-27", "produto": "BUCHA/ANEL PLAST, ROLAMENTO COLUNA, DISCO BUZINA, MAÇANETA, LAMPADA.", "valor": 158.4, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "TRANSMISSÃO", "local": "EXTERNO", "nota_fiscal": "10243", "data_emissao": "2023-02-07", "produto": "ROLAMENTO DO CARDAN.", "valor": 364.02, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "32838", "data_emissao": "2023-04-26", "produto": "ASSOALHO TATAJUBA EXTRA 15\nLINHA ANGELIN 5,0X18 2,50\nLINHA ANGELIN 5,0X9,0 2,00\nRIPA ANGELIM VERMELHO \n", "valor": 6000.0, "fornecedor_codigo": "", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "32853", "data_emissao": "2023-04-26", "produto": "LINHA ANGELIN 5,0X18 1,50", "valor": 70.72, "fornecedor_codigo": "", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "6485", "data_emissao": "2023-05-31", "produto": "SERVIÇOS DIVERSOS.", "valor": 100.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "10673", "data_emissao": "2023-07-05", "produto": "INTERRUTOR FREIO MANECO.", "valor": 195.12, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "10672", "data_emissao": "2023-07-05", "produto": "FILTRO SECADOR VALVULA \nFILTRO COMBUSTIVEL\nFILTRO LUBRIF.\n", "valor": 490.63, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "10672", "data_emissao": "2023-07-05", "produto": "FILTRO SECADOR VALVULA \nFILTRO COMBUSTIVEL\nFILTRO LUBRIF.\n", "valor": 490.63, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "40029", "data_emissao": "2025-10-07", "produto": "BUCHA CABINE 3472914\nBUCHA TRAVA CABINE 3480011\nCOLA JUNTA MOTOR THREEBOND 75G\nCOXIM CABINE R1217\nCOXIM CABINE R1257\nCOXIM CABINE R1258\nJG LONA FREIO L224\nREBITE 10X16 ALUMINIO\nREFIL COXIM MOTOR R1238\nROLAMENTO CARDAN CO88510CBM\nROLAMENTO TENSOR 1805010\nGRAXA UNILIT BLUE 2 1KG\nARANHA TRAVA CAPA 0125580*\nRETENTOR RODA 02713BRY\nMOLA SAPATA FREIO MO008AS*\nMOLA SAPATA FREIO MO002AS /2258H1230*", "valor": 1951.5, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "1635", "data_emissao": "2025-10-07", "produto": "SERVIÇO DE TROCA DE RODAS TRASEIRA\nSERVIÇO DE TROCA DE ROLAMENTO DE CENTRO\nTROCA DA POLIA DO TENSOR\nSERVIÇO DE TROCA DA BUCHA DA CABINE\nSERVIÇO DE TROCA DE TRANÇAS DA CABINE\nSERVIÇO DE TROCA DE COXIM DO MOTOR\nSERVIÇO DE TROCA DE AMORTECEDORES DA CABINE\nTROCA DE BUCHA DE AMORTECEDORES DA CABINE", "valor": 1430.0, "fornecedor_codigo": "", "empresa": "R J DA CUNHA LTDA"}, {"prefixo": "5038", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4467", "data_emissao": "2025-10-31", "produto": "PM CAMINHAO 275/80R22,5 RT42 RT42 DUNLO\nMANCHAO REC 124 VULCAFLEX\nMANCHAO RAC 40\nMANCHAO RAC 42\nPM CAMINHAO 275/80R22,5 RT42 RT42 DUNLO\nMANCHAO RAC 20\nMANCHAO RAC 45\nMANCHAO RAC 24 QUENTE\nPM CAMINHAO 275/80R22,5 RT42 RT42 MICHE", "valor": 1680.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "18167", "data_emissao": "2025-10-31", "produto": "MANGUEIRA ESPIRAL P/LIMPEZA 3,5 MTS (AZ)", "valor": 22.5, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO EMBUHAMENTO TENSOR\nSERVIÇO OXICORTE", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "11796", "data_emissao": "2025-10-10", "produto": "ARRUELA PINO DA MOLA DIANT.ESPECIAL MB1113\nBUCHA SUSPENSAO SUSPENSYS COM PINO", "valor": 1112.6, "fornecedor_codigo": "", "empresa": "IRMAOS CLARA DISTRIBUIDORA DE PECAS LTDA ME"}, {"prefixo": "5038", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "18249", "data_emissao": "2025-11-26", "produto": "PNEU 275/80R22.5 149/146L ESMXS SPM 18L 2UND", "valor": 3340.5, "fornecedor_codigo": "", "empresa": "ITR COMERCIO DE PEÇAS"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "520279", "data_emissao": "2026-01-08", "produto": "TRAVA DIR VW TDS C/CHAV-22993", "valor": 133.74, "fornecedor_codigo": "5021/3992", "empresa": "PADRE CICERO"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "164521", "data_emissao": "2026-01-12", "produto": "R 99 14 A 02 VEDAÇÃO", "valor": 421.49, "fornecedor_codigo": "2979", "empresa": "VIA DIESEL DISTRIBUIDORA DE VEICULOS MOT E PEÇAS LTDA"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "62", "data_emissao": "2026-01-30", "produto": "RECAPAGEM,MANCHAO ", "valor": 1520.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO REVISÃO PARCIAL SISTEMA AR , SERVIÇO  RODA TRAÇAO LE", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "2662", "data_emissao": "2026-02-06", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E ", "valor": 350.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "2679", "data_emissao": "2026-02-04", "produto": "RECAPAGEM,MANCHAO ", "valor": 1480.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS EM MECANICA  E CONGENERES", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "351", "data_emissao": "2026-01-07", "produto": "CONSERTO E RECUPERAÇÃO DA CAIXA  ACIONADORA DA CABINE DO CAMINHÃO", "valor": 450.0, "fornecedor_codigo": "5208", "empresa": "G ALEXANDRE GUEDES DE SOUZA"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "43521", "data_emissao": "2026-01-12", "produto": "COLA LIQUIDA/ARANHA/RETENTOR RODA/OLEO KARTER..", "valor": 503.2, "fornecedor_codigo": "4687/2007", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5038", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "13235", "data_emissao": "2026-03-30", "produto": "FLUIDO EMBREAGEM/SERVO EMBREAGEM ", "valor": 1049.95, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13307", "data_emissao": "2026-05-07", "produto": "LAMPADA 69, 67, H4 E INTERRUPTOR PRESSAO AR", "valor": 187.49, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "26184", "data_emissao": "2026-05-07", "produto": "SERVIÇO SCANNER", "valor": 250.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5038", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "26847", "data_emissao": "2026-05-22", "produto": "ENSAIO METROLOGICO DO TACOGRAFO, SELAGEM DO TACOGRAFO, CONFIGURAÇÃO E PROGRAMAÇÃO, CONSERTO ELETRICO, MODULO CABINE, RECUPERAÇÃO SIST GAVETA, MÃO DE OBRA.", "valor": 3982.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5038", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "187424", "data_emissao": "2026-05-22", "produto": "BATERIA M150BD", "valor": 1975.08, "fornecedor_codigo": "858", "empresa": "CODIBA COMERCIAL DISTRIBUIDORA DE BATERIA"}, {"prefixo": "5038", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 528.43, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"prefixo": "5038", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 453.6, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "3629", "data_emissao": "2023-09-25", "produto": "TAMPA DO DISCO DE 7D MTCO 1390\nTAMPA LACRE MTCO 1390.", "valor": 125.0, "fornecedor_codigo": "", "empresa": "GTI POSTO DE ENSAIO "}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "3700", "data_emissao": "2023-11-30", "produto": "PALHETA LIMP. 24 POL VW CAM/MB 1620/ACCELO\nFECHO CONTO SEGURANÇA C/FITA MEIO BANCO.", "valor": 128.7, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "463764", "data_emissao": "2025-08-27", "produto": "FILTRO COMB VW 17230 13/18-FCD0952\nFILTRO OLEO LUB REFIL MT MAN D0834/836-WOE475\nFILTRO SEDIM VW/CUMMINS/MWM-R120LJ10MAQII\nFILTRO AR PRIM 1319E/1519 4.5 13/WAP103", "valor": 307.6, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "40487", "data_emissao": "2025-10-17", "produto": "FILTRO LUBRIFICANTE HU951X", "valor": 63.9, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "18166", "data_emissao": "2025-10-31", "produto": "FUSIVEL 200 AMP. MEGA", "valor": 20.7, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "213", "data_emissao": "2025-10-17", "produto": "REMOCAO E INSTALACAO DO CARTER\nREMOCAO E INSTALACAO DO SUPORTE DO FILTRO LUBRIFICANTE\nTROCA DO ROLAMENTO DE CENTRO\nTROCA DE RETENTOR TRASEIRO DO CAMBIO\nTROCA DE COXIM DIANTEIRO DO MOTOR\nTROCA DE CORREIA DO ALTERNADOR\nTROCA DE ROLAMENTO DO TENSOR\nREVISAO ELETRICA", "valor": 1420.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "40404", "data_emissao": "2025-10-15", "produto": "RETENTOR RODA 02713BRY\nCOLA LIQUIDA 1215J BLACK\nCORREIA 8PK1275 (C) *\nCOXIM MOTOR R1244\nJUNTA CARTER JL82016\nJUNTA RADIADOR OLEO 036340\nOLEO MAXON 15W40 C14 BD 20L\nROLAMENTO TENSOR 1805010\nROLAMENTO CARDAN 07802ROL\nJUNTA CARTER JL82117\nRETENTOR ENTALHADO AR5509", "valor": 2067.1, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5039", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "18249", "data_emissao": "2025-11-26", "produto": "PNEU 275/80R22.5 149/146L ESMXS SPM 18L 2UND", "valor": 3340.5, "fornecedor_codigo": "", "empresa": "ITR COMERCIO DE PEÇAS"}, {"prefixo": "5039", "servico": "SERVIÇO", "descricao": "SERVIÇO TECNICO ENSAIO METROLOGICO DO TACOGRAFO", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26470", "data_emissao": "2026-03-12", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E REGARGA", "valor": 302.0, "fornecedor_codigo": "", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5039", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO ", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "5645", "data_emissao": "2026-03-12", "produto": "CHICOTE ELETRICO/ SENSOR IND. 4 PINOS REDONDO 25MM", "valor": 612.0, "fornecedor_codigo": "", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5039", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13319", "data_emissao": "2026-05-12", "produto": "LANTERNA PISCA, CHICOTE ELETRICO, LAMPADA 69, 67 E POLO 1, FITA ISOLANTE, REVESTIMENTO CHICOTE, REVESTIMENTO CHICOTE E FI, LANTERNA TETO, ARRUELA TRAVA, BUCHA VOLANTE DIREÇÃO, CILINDRO ING, TRAVA DIREÇÃO, KIT, CHICOTE REDUÇÃO.", "valor": 1211.04, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5039", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "13320", "data_emissao": "2026-05-12", "produto": "KIT CONEXÃO, CINTA PLASTICA, REVESTIMENTO CHICOTE P, FITA ISOLANTE, CHICOTE ELETRICO, VALVULA PNEUMATICA, 2 ROLAMENTOS, REGULADOR E MANCAL.", "valor": 1450.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5039", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "26198", "data_emissao": "2026-05-12", "produto": "REVISÃO DE SISTEMA REDUÇÃO, SERVIÇO ALTERNADOR ", "valor": 450.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5039", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "26197", "data_emissao": "2026-05-12", "produto": "SERVIÇO DESMONTAGEM COLUNA DIREÇÃO, RETIFICA COLUNA DIREÇÃO, SERVIÇO REVISÃO ELETRICO ILUMINAÇÃO, REVISÃO CHICOTE REDUÇÃO.", "valor": 1600.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5039", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "22230", "data_emissao": "2026-05-18", "produto": "MANGUEIRO ESPIRAL P/LIMPEZA 5 MTS", "valor": 28.8, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5039", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "LUBRIFICANTE", "local": "INTERNO", "nota_fiscal": "14642", "data_emissao": "2026-06-17", "produto": "OLEO BARDAL PROMAX MAX SAE 15W40", "valor": 528.43, "fornecedor_codigo": "3531", "empresa": "LAAF AUTO PEÇAS"}, {"prefixo": "5039", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "INTERNO", "nota_fiscal": "49927", "data_emissao": "2026-06-26", "produto": "FILTRO LUMBRICANTE+COMBUSTIVEL+RACOL+AR", "valor": 482.4, "fornecedor_codigo": "4687", "empresa": "CASA DO CAMINHÃO"}, {"prefixo": "5039", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13432", "data_emissao": "2026-07-09", "produto": "ROLAMENTO DE ALT+ESTATR ALTERNADOR+BOIA COMBUTIVEL+RETIFICADOR ALT", "valor": 990.42, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5042", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "13010", "data_emissao": "2025-02-28", "produto": "RELE AUX 5S 24V S/SUP 10 AMP  (MINI) DNI 0226                          FUSIVEL LAMINA 10 AMP (AM 16010)                                                BUZINA BIBI 24V 125MM (K-10113) KHELL88BZ113/GB1065             FAIXA REFLETIVA COLANTE 3M L/E                                                      FAIXA REFLETIVA COLANTE 3M L/D                                                       LANTERNA LAT. P/ CARRETA C/ SOQ. AM                                           TERMINAL ENCAIXE FEMEA MEDIO C/ TRAVA  (TE -43013S)           CONECTOR FEMEA 1 VIA ( FRONTEC F-201)                                     LAMPADA 67 24 5W/10W/GL0067                                                        FIO 14 1,50 MM (VERMELHO)                                                                 FITA ISOLANTE ROLO C/ 5M  (AVX/DNI). DNA5F                                 LAMPADA 69 24V                                                                                              LENTE LATERAL REFLETIVO (AM)                                                              LENTE LATERAL REFLETIVO (AM)                                                           LAMPADA TORPEDO 24 V PHILIPS                                                        LENTE LAT. TIPO FACCHINI REFLETIVO (VM)                                     FAIXA REFLETIVA COLANTE 3M L/D                                                     FAIXA REFLETIVA COLANTE 3M L/E                                                      FAIXA REFLETIVA PARACHOQUE 3M                                                     TAMPA P/ COROTE \"M\"                                                                           TORNEIRA P/ COROTE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           ", "valor": 458.1, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5042", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "2699", "data_emissao": "2026-02-11", "produto": "RECAPAGEM,MANCHAO ", "valor": 3040.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5042", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "121", "data_emissao": "2026-02-10", "produto": "PNEU 275/80R22.5 TL 18PR 146M DIR GL283A", "valor": 3260.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5042", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "2698", "data_emissao": "2026-02-11", "produto": "ALINHAMENTO TC/ BALANCEAMENTO DE RODAS", "valor": 200.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5042", "servico": "PNEU", "descricao": "SERVIÇOS TECNICOS", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "19282", "data_emissao": "2026-02-10", "produto": "PNEU 295/80R22.5 152/148KHDMX SPM 18L", "valor": 0.0, "fornecedor_codigo": "", "empresa": "SPEEDMAX PNEUS"}, {"prefixo": "5042", "servico": "SERVIÇO", "descricao": "SERVIÇO TECNICO", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "26163", "data_emissao": "2026-03-05", "produto": "RECAUCHUTAGEM OU REGENERAÇÃO DE PNEUS ", "valor": 1520.0, "fornecedor_codigo": "5390", "empresa": "DAFONTE PNEUS"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "70447", "data_emissao": "2023-04-29", "produto": "LAMPADA 1249 24V PINO EM \"V\" (AM)\nLAMPADA PINGO DAGUA 24V GDE", "valor": 92.61, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "CAIXA DE MACHA", "local": "EXTERNO", "nota_fiscal": "11017", "data_emissao": "2023-10-27", "produto": "OLEO CAIXA DE MARCHA FS4205.", "valor": 603.3, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "8020", "data_emissao": "2023-10-31", "produto": "BALANCEAMENTO E ALINHAMENTO 1.", "valor": 150.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5043", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "4610", "data_emissao": "2025-09-12", "produto": "PNEU 275/80R22.5 149/146L ESMXS SPM 18L 2UND", "valor": 3451.3, "fornecedor_codigo": "", "empresa": "ITR COMERCIOS DE PNEUS E PECAS S.A"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "477676", "data_emissao": "2025-09-26", "produto": "LONA FREIO TS VW 16210/DT", "valor": 196.47, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "477623", "data_emissao": "2025-09-26", "produto": "COXIM MT CONSTELLATION\nSUPORTE ROL CARD MBB\nLONA FREIO TS VW 16210/DT\nPOLIA TENSOR ALT VW MT MAN D08\nTENSOR CORR ALT VW D08 34 EURO", "valor": 1875.2, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "1627", "data_emissao": "2025-09-30", "produto": "SERVIÇO DE TROCA DA BASE DIANTEIRA DO MOTOR\nSERVIÇO DE TROCA DO TENSOR E POLIA FIXA\nSERVIÇO DE TROCA DA LONA TRASEIRA\nSERVIÇO DE TROCA ROLAMENTO DO CENTRO\nTESTE DE INTERCOOLER\nDIAGNOSTICO E FALHAS \nREVISÃO DE ALTERNADOR + MÃO DE OBRA\nSERVIÕ DE TROCA DE REBITES", "valor": 2257.0, "fornecedor_codigo": "", "empresa": "R J DA CUNHA LTDA"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ARREFECIMENTO", "local": "EXTERNO", "nota_fiscal": "480769", "data_emissao": "2025-10-04", "produto": "RESERVATORIO RAD VW CONSTELLATION 15190/-000437", "valor": 357.92, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "17555", "data_emissao": "2025-10-02", "produto": "LAMPADA 1141 24V PHILIPS/GE.\nLAMPADA 67 24V 5W PHILIPS/GE.\nVALVULA SOLENOIDE 24V F.CONFUORTO (DNI-7009).\nABRACADEIRA FITA 30CM. NYLON (3,6X1,4MM) ETE7571.\nTAMPA RADIADOR VW CONSTELLATION C/VALVULA 1,5 BAR (VER-2537)\nLANTERNA LAT. ESTRIBO VW CONST. (AM)\nGF2196AM.\nSOQUETE LUZ VIGIA FAROL MB 1620/VW CAM. (CHW50003).\nSOQUETE P/LANT. SETA VW CONST. (LS-102).\nLAMPADA 67 24V 5W PHILIPS/GE.\nLAMPADA PINGO DAGUA 24V GDE (GL2825B).\nLAMPADA PINGO DAGUA 24V GDE (GL2825B).\nLAMPADA 69 24V C/4 LEDS (ASX) 1354134.\nTAMPA RADIADOR VW CONSTELLATION C/VALVULA 1,5 BAR (VER-2537)", "valor": 341.91, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "41923", "data_emissao": "2025-11-25", "produto": "CUICA FREIO 84650540 30X30", "valor": 239.4, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "245", "data_emissao": "2025-11-24", "produto": "SERVICO DE SUBSTITUICAO DA CUICA DE FREIO TRACAO L/E", "valor": 150.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "2660", "data_emissao": "2026-01-08", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA..", "valor": 492.0, "fornecedor_codigo": "", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "157091", "data_emissao": "2026-01-15", "produto": "PREGO C/ CABEÇA 2X12 (16X21) BELGO - BELGO", "valor": 7.82, "fornecedor_codigo": "", "empresa": "TRANSFERENCIA/LOJA(CONSUMO)"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "62753", "data_emissao": "2026-01-15", "produto": "ASSOALHO TATAJUBA EXTRA 15\"\n", "valor": 211.58, "fornecedor_codigo": "3451", "empresa": "ZANI MADEIRAS"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "26158", "data_emissao": "2026-01-19", "produto": "RECAUCHUTAGEM OU REGENERAÇÃO DE PNEUS ", "valor": 1440.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL  PNEUS"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS ", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "72729", "data_emissao": "2026-02-13", "produto": "TERMINAL CABO BATERIA SAPAO/REFORCADO", "valor": 101.4, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "21187", "data_emissao": "2026-03-31", "produto": "SOQUETE/FITA ISOLANTE/LANTERNA/SOQUETE/LAMPADA/...", "valor": 394.02, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5043 e 5033", "servico": "SERVIÇO", "descricao": "LAVAGEM", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26111", "data_emissao": "2026-04-13", "produto": "LUBRIFICAÇÃO, LIMPEZA,LUSTRAÇÃO, REVISÃO, CARA E RECARGA....", "valor": 500.0, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5043", "servico": "SERVIÇO", "descricao": "MANUTENÇÃO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "13361", "data_emissao": "2026-06-03", "produto": "BOTAO REDUÇÃO,COLA TREEBND,JUNTA CARTER, OLEO MOTOR MAN COLA 3M JUNTA TAMPA MAN 6CIL", "valor": 1269.14, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5043", "servico": "MANUTENÇÃO", "descricao": "PEÇAS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "13361", "data_emissao": "2026-06-03", "produto": "BOTAO REDUÇÃO,COLA TREEBND,JUNTA CARTER, OLEO MOTOR MAN COLA 3M JUNTA TAMPA MAN 6CIL", "valor": 1269.14, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5043", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "26235", "data_emissao": "2026-06-03", "produto": "SERVIÇO DE VAZAMENTO NO MOTOR", "valor": 600.0, "fornecedor_codigo": "1703", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5043", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "INTERNO", "nota_fiscal": "188220", "data_emissao": "2026-06-11", "produto": "BATERIA M150BD MGE SLI", "valor": 1945.46, "fornecedor_codigo": "-", "empresa": "CODIBA C. DISTRIB"}, {"prefixo": "5043", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "23081", "data_emissao": "2026-06-30", "produto": "9 FUZIVEIS 5,10,15", "valor": 9.72, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}]};
async function importarHistoricoFrotaV3() {
  const ja=await pool.query("SELECT valor FROM sistema_config WHERE chave='historico_frota_v3'");
  if(ja.rowCount) return;
  const c=await pool.connect();
  try{
    await c.query("BEGIN");
    for(const v of FROTA_V3.ativos){
      await c.query(`INSERT INTO veiculos(prefixo,placa,tipo,modelo,ano,funcao,categoria,capacidade_kg,status,observacao)
        VALUES($1,$2,$3,$4,$5,$6,$7,0,'Disponível','Cadastro atualizado pela planilha HISTORICO DA FROTA V3')
        ON CONFLICT(prefixo) DO UPDATE SET placa=EXCLUDED.placa,tipo=EXCLUDED.tipo,modelo=EXCLUDED.modelo,
        ano=EXCLUDED.ano,funcao=EXCLUDED.funcao,categoria=EXCLUDED.categoria`,
        [v.prefixo,v.placa||null,v.tipo||null,v.modelo||null,v.ano||null,v.funcao||null,v.categoria]);
    }
    await c.query("DELETE FROM manutencoes WHERE origem_importacao IN ('PLANILHA_MANUTENCAO_2026','HISTORICO_FROTA_V3')");
    for(const x of FROTA_V3.historico){
      const v=await c.query("SELECT id FROM veiculos WHERE prefixo=$1 LIMIT 1",[x.prefixo]);
      if(!v.rowCount) continue;
      await c.query(`INSERT INTO manutencoes
       (veiculo_id,veiculo_prefixo,tipo,servico,descricao,sistema,local,nota_fiscal,data_emissao,produto,custo,fornecedor_codigo,empresa,status,data_abertura,origem_importacao)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Concluída',COALESCE($9,CURRENT_DATE),'HISTORICO_FROTA_V3')`,
       [v.rows[0].id,x.prefixo,x.servico||'MANUTENÇÃO',x.servico,x.descricao,x.sistema,x.local,x.nota_fiscal,x.data_emissao||null,x.produto,Number(x.valor||0),x.fornecedor_codigo,x.empresa]);
    }
    await c.query("INSERT INTO sistema_config(chave,valor) VALUES('historico_frota_v3',$1)",[String(FROTA_V3.historico.length)]);
    await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
}


const HISTORICO_5041_V241 = [{"prefixo": "5041", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "2244", "data_emissao": "2022-01-13", "produto": "REC A FRIO 295/80 R 22.5 MHF S:1734 - MICHELIN;\nREC A FRIO 295/80 R 22.5 MHF S:4618 - DUNLOP; \nREC A FRIO 295/80 R 22.5 MHF S:4118 - DUNLOP;\nREC A FRIO 295/80 R 22.5 MHF S:1918 - DUNLOP;\nMANCHÃO RAC MR 42.", "valor": 2605.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "6270", "data_emissao": "2022-01-18", "produto": "BUCHA PINO TENSOR GUERRA/ROSSETTI C/PINO;\nPARAFUSO SEXTAV 5/8X4 1/2 UNC.", "valor": 984.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "7787", "data_emissao": "2022-01-18", "produto": "SERVIÇO REMOÇÃO E INST TIRANTE;\nSERVIÇO OXICORTE.", "valor": 355.0, "fornecedor_codigo": "", "empresa": "IRMÃOS CLARA DIST DE PEÇAS LTDA ME"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "8719", "data_emissao": "2022-01-20", "produto": "FILTRO COMBUSTIVEL CUMMINS ISC;\nFILTRO SECADOR VALVULA;\nFILTRO ARLA;\nFILTRO LUBRIF VW19390 EURO 5;", "valor": 474.39, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "120189", "data_emissao": "2022-01-24", "produto": "FILTRO DE COMBUSTIVEL  FF5488\nFILTRO SEPARADOR DE AGUA RA COR FS20047\nBOTÃO\nMOLA", "valor": 347.36, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "24864", "data_emissao": "2022-01-24", "produto": "INTERRUPTOR REDUTOR SUBSTITUIR/FILTRO DUPLO DE COMBUSTITUIR FILTRO SEDIMENTADOR SUBSTITUIR.", "valor": 378.0, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "1666", "data_emissao": "2022-01-28", "produto": "ALINHAMENTO", "valor": 100.0, "fornecedor_codigo": "", "empresa": "REUNIDAS VEICULOS E SERVIÇOS LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "120366", "data_emissao": "2022-01-31", "produto": "9952B15 ARLA FLUIDO", "valor": 1779.96, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "62083", "data_emissao": "2022-02-26", "produto": "TERMINAL ENCAIXE FEMEA MEDIO (TE-413S)\nCONECTOR FEMEA 1 VIUA(FRONTEC F-201)\nFITA ISOLANTE ROLO C/5 METROS(AVX/DNI)\nLAMPADA 67 24V 5W/10W AVX 13266\nLAMPADA PINGO DAGUA 24V GDE", "valor": 22.68, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "7913", "data_emissao": "2022-03-03", "produto": "SERVIÇO INSTALAR SISTEMA DE AR\nSERVIÇO OXICORTE", "valor": 200.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "6400", "data_emissao": "2022-03-03", "produto": "BOLSA DE AR\nPARAFUSO SEXTA V.M12X45 MB 8.8\nCONECTOR MACHO", "valor": 1125.27, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "7936", "data_emissao": "2022-03-10", "produto": "SERVIÇO: \nREMOÇÃO E INSTALAÇÃO DE BOLSA DE AR", "valor": 80.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "6426", "data_emissao": "2022-03-10", "produto": "BOLSA DE AR\nPARAFUSO SEXTA V.M12X45 MB 8.8\nCONECTOR MACHO", "valor": 1105.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "49099", "data_emissao": "2022-04-22", "produto": "PARABR.VW CAM. CONSTELATION (BOB ESPOJA) VFA", "valor": 800.0, "fornecedor_codigo": "", "empresa": "RN BORRACHAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "63217", "data_emissao": "2022-04-30", "produto": "FLANGE RODOAR CARRETA RANDON M/N;\nLAMPADA 1249 24V PINO EM V(AM);\nLANTERNA LAT. RANDON MOD. S/SUSP. LEDS 12/24V(AM);\nFITA ISOLANTE ROLO C/5 METROS(AVX/DNI);\nLENTE RANDON LATERAL MODERNA(AM);\nTERMINAL P/FIO 1/4 (138/C;\nPORTA FUSIVEL LAMINADO FIO 1,5MM;\nFUSIVEL LAMINA 15 AMP (61/D;\nMOTOR P/CLIMATIZADOR 24V 101104424;\nPORCA REDONDA VAZADA MULTI-USO RODOAR P/MOLA;\nTEE DE MONTAGEM REDE P/RODOAR S/PORCAS;\nCINEMATICO P/RODOAR.", "valor": 307.62, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "9027", "data_emissao": "2022-05-14", "produto": "ENSAIO DE METROLOGICO DO TACOGRAFO\nINSPEÇÃO TECNICA DO TACOGRAFO\nSELAGEM DO TACOGRAFO", "valor": 355.0, "fornecedor_codigo": "", "empresa": "GC COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "2047", "data_emissao": "2022-05-14", "produto": "KIT LACRE REPARO\nTAMPA LACRE MTCO 1390", "valor": 28.0, "fornecedor_codigo": "", "empresa": "GC COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "3363", "data_emissao": "2022-05-23", "produto": "SERVIÇO DE FREIO", "valor": 1015.0, "fornecedor_codigo": "", "empresa": "FREI-AR"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "123652", "data_emissao": "2022-05-23", "produto": "FUSIVEL", "valor": 105.06, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "123658", "data_emissao": "2022-05-23", "produto": "CILIMDRO", "valor": 230.0, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "63818", "data_emissao": "2022-05-31", "produto": "LAMPADA H4 24V 75/70W;\nLAMPADA PINGO DAGUA 24V GDE.", "valor": 27.9, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "9481", "data_emissao": "2022-07-05", "produto": "FILTRO RACOR TITAN EURO", "valor": 176.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "49956", "data_emissao": "2022-08-25", "produto": "PARABRISA VW CAM CONSTELATION ( BOB ESPONJA).", "valor": 750.0, "fornecedor_codigo": "", "empresa": "RN BORRACHAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "6950", "data_emissao": "2022-08-26", "produto": "BOLSA DE AR RANDON CARRETA\nBASE INFERIOR BOLSA DE AR ITI5M6", "valor": 1391.2, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "8453", "data_emissao": "2022-08-26", "produto": "SERVIÇO DE REMOÇÃO E INSTALAÇÃO DE BOMBA.", "valor": 100.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "65762", "data_emissao": "2022-08-31", "produto": "SUPORTE VIDRO PORTA VW CONSTELLATION D/E \nMAQUINA VIDRO VW CONT. ELET. C/MOTOR 24V L/D", "valor": 330.3, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "8071", "data_emissao": "2022-09-12", "produto": "PNEU ALTURA NXG 295/80 R 22.5 NXG BI TRAÇÃO", "valor": 5400.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "225657", "data_emissao": "2022-09-14", "produto": "OLEO MOTOR SAE15W40 API/CI-4 XV 200", "valor": 936.0, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4236", "data_emissao": "2022-09-14", "produto": "REC A FRIO 295/80 R 22.5 MHF S:1621-DUNLOP\nREC A FRIO 295/80 R 22.5 MHF S:0473-PIRELLI\nMANCHÃO RAC 46\nREC A FRIO 295/80 R 22.5 MHF S:3820-PIRELLI", "valor": 2135.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "4301", "data_emissao": "2022-09-20", "produto": "BALANCEAMENTO E ALINHAMENTO            \nALINHAMENTO", "valor": 220.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOLA", "local": "EXTERNO", "nota_fiscal": "8519", "data_emissao": "2022-09-20", "produto": "SERVIÇO OXICORTE\nSERVIÇO FEIXE DE MOLA TRASEIRA\nSERVIÇO EMBUCHAMENTO TENSOR", "valor": 456.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "7020", "data_emissao": "2022-09-20", "produto": "ARRUELA PINO TENSOR\nBUCHA SUSPENSÃO SUSPENSYS COM PINO\nCUNHA DE MOLA\nPORCA SEXTA V. SIMPLES 9/16 UNF\nPARAFUSO SEXTA V. M16X130 MA 8.8\nPINO DE CENTRO 9/16 X8 CB 8.8\nPORCA SEXTA V. PARLOCK M16 MB", "valor": 1255.4, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "6080", "data_emissao": "2022-09-22", "produto": "RECUPERAR MANGA EIXO\nSERVIÇO MECANCO", "valor": 1450.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "9825", "data_emissao": "2022-09-22", "produto": "FILTRO RACOR EURO V\nFILTRO COMBUSTIVEL CUMMIS\nFILTRO LUBRIF EURO 5", "valor": 458.4, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "6081", "data_emissao": "2022-09-23", "produto": "SERVIÇO RECUPERAÇÃO MANGA EIXO\nSERVIÇO MECANICO", "valor": 1450.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "9839", "data_emissao": "2022-09-23", "produto": "JGARRUELA AJUSTE\nTAMPA EMBUCHAMENTO\nSIRENE RE (BI VOLT)\nREPARO EMBUCHAMENTO\nPINO EMBUCHAMENTO 0,1\nRETENTOR RODA DIANTEIRA\nCUPILHA MANGA EIXO DT\nTERMINAL DIREÇÃO LD\nTERMINAL DIREÇÃO LE\nCOLA SILICONE\nBARRA DIREÇÃO\nPINO EMBUCHAMENTO STD", "valor": 2152.13, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "66345", "data_emissao": "2022-09-30", "produto": "SOLENOIDE AUX. M PARTIDA 38MT 24V DELCO (DNI)", "valor": 143.1, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "6118", "data_emissao": "2022-10-07", "produto": "SERVIÇO FREIO RODA", "valor": 500.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "66903", "data_emissao": "2022-10-31", "produto": "FUSIVEL LAMINA 10 AMP\nFUSIVEL LAMINA 15 AMP\nFUSIVEL LAMINA 20 AMP\nFUSIVEL LAMINA 30 AMP\nLAMPADA 67 24V 5W/10W\nLAMPADA PINGO DAGUA 24V GDA\nSOQUETE P/LANTERNA LUZ VIGIA VW CONST.", "valor": 33.66, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "8602", "data_emissao": "2022-11-18", "produto": "PNEU CONTINENTAL 295/80 R 22.5 HD 3-BORR", "valor": 6000.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "4915", "data_emissao": "2022-11-24", "produto": "REC A FRIO 295/80 R 22.5 MHF S:0919-DUNLOP\nMANCHÃO RAC MR 44\nMANCHÃO RAC MR 25\nREC A FRIO 295/80 R 22.5 MHF S:0919-DUNLOP", "valor": 1475.0, "fornecedor_codigo": "", "empresa": "PNEUTEX"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "14998", "data_emissao": "2022-11-24", "produto": "BOLSA DE AR SUSPENSOR TRUCK", "valor": 450.0, "fornecedor_codigo": "", "empresa": "JF DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "68081", "data_emissao": "2022-12-30", "produto": "FAROL AUX. VW CONSTELLATION (ORGUS);\nCONECTOR ELETRICO FEMEA 2 VIAS (TC-1005);\nCONECTOR ELETRICO FEMEA 2 VIAS (TC-1005);\nSOQUETE LUZ VIGIA FAROL MB 1620/VW CAM;\nLAMPADA 1141 24V (AM);\nLAMPADA PINGO DAGUA 24V GDE;\nLANTERNA LAT. VW CONST. C/LEDS (AM);\nVALVULA PNEUMATICA SUSP. BANCO VW/FORD/MB.", "valor": 1275.3, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "724", "data_emissao": "2023-10-18", "produto": "EQUALIZADOR FREIO MOD CARRETA\nREP PRE MONTADO 4/3 S HALDEX\nREP VALV RELE MOD WABCO\nEQUALIZADOR FREIO MOD WABCO\nPARAFUSO FIXAÇÃO 13MM LONGO.", "valor": 630.0, "fornecedor_codigo": "", "empresa": "BELL FREIOS A AR COMERCIO E SERVIÇOS LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "659", "data_emissao": "2023-10-18", "produto": "MÃO DE OBRA DA NF: 724.", "valor": 250.0, "fornecedor_codigo": "", "empresa": "BELL FREIOS A AR COMERCIO E SERVIÇOS LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "13433", "data_emissao": "2024-01-12", "produto": "CAPA DE ALTA 5/8                                                                                                                                                       EMENDA SIMPLES P/MANG 3/4 X 3/4 LATAO", "valor": 58.0, "fornecedor_codigo": "", "empresa": "J. ROCHA DA SILVA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "11253", "data_emissao": "2024-01-23", "produto": "OLEO MOTOR MAN SINTETICO BD20L", "valor": 223.6, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "247492", "data_emissao": "2024-01-29", "produto": "AMORTECEDOR CABINE TRS 0029449", "valor": 561.49, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "4940", "data_emissao": "2024-02-05", "produto": "LANTERNA TRAS CARGO/VW MARMITAO MOD N C/VIG", "valor": 80.1, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4941", "data_emissao": "2024-02-05", "produto": "SENSOR FECHADURA CABINE BASC VW CONST. / CARGO                                                                                                  CALOTA RODOAR CAPANEMA C/REFLETIVO TOP LINE L/E                                                                                                          MOLA P/ CALOTA RODOAR                                                          MANGUEIRA RODOAR 8,0 X 6,0X1,0 SILICONE                      CALOTA RODOAR CAPANEMA C/ REFLETIVO TOP LINE L/E                                                                                                           CALOTA RODOAR CAPANEMA C/ REFLETIVO TOP LINE L/D                                                                                                          TERMINAL ENCAIXE FEMEA MEDIO C/ TRAVA ( TE - 4013S) 182                                                                                           CONECTOR FEMEA 1 VIA ( FRONTEC F-201 )                            CALOTA RODOAR CAPANEMA C/REFLETIVO TOP LINE L/D", "valor": 268.29, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "11314", "data_emissao": "2024-02-20", "produto": "FUSIVEL LAMINA 25A                                                                      FITA ISOLANTE (ANTICHAMA )                                                    CHICOTE ELETRICO                                                                           CINTA PLASTICA                                                                                REVESTIMENTO                                                                                  FITA ISOLANTE (ANTICHAMA )                                                    CINTA PLASTICA                                                                                FUSIVEL LAMINA 25A                                                                       FUSIVEL LAMINA 15A INTERRUPTOR TRANSFERENCIA CAIXA", "valor": 588.19, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "6907", "data_emissao": "2024-02-20", "produto": "RECUPERAR/PROGRAMAÇÃO CHICOTE", "valor": 2200.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "COMBUSTIVEL", "local": "EXTERNO", "nota_fiscal": "5894", "data_emissao": "2024-02-23", "produto": "ARLA 32 IPE QUIMICA 20 LITROS", "valor": 1700.0, "fornecedor_codigo": "", "empresa": "PINHEIRO BORGES"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "8758", "data_emissao": "2024-03-01", "produto": "PORCA SEXTA V.SIMPLES 5/16UNC                                            SELANTE NEUTRO ORBICIPPER 50G                                           INSERT 12MM                                                                                     PARAFUSO FRANCES 5/16 X 3 1/2 ZB                                        FITA SIL CREPE USO GERAL", "valor": 232.87, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10162", "data_emissao": "2024-03-01", "produto": "SERVIÇO DESEMPENAR E ALINHAR BARRA LONGA             SERVIÇO SUPORTE", "valor": 215.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "8792", "data_emissao": "2024-03-11", "produto": "PORCA SEXTA V.SIMPLES 5/16UNC                                            SELANTE NEUTRO ORBICIPPER 50G                                           INSERT 12MM                                                                                     PARAFUSO FRANCES 5/16 X 31/2 ZB", "valor": 232.87, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10195", "data_emissao": "2024-03-11", "produto": "SERVIÇO DESEMPENAR E ALINHAR BARRA LONGA             SERVIÇO SUPORTE", "valor": 215.0, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "11395", "data_emissao": "2024-03-14", "produto": "FLEXIVEL ESCAPE", "valor": 495.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "249761", "data_emissao": "2024-03-14", "produto": "BOMBA INJETORA ARLA 24V 0040060", "valor": 7012.52, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "34008", "data_emissao": "2024-03-18", "produto": "MÃO DE OBRA (BOMBA INJETORA )", "valor": 925.0, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "13920", "data_emissao": "2024-05-14", "produto": "ENSAIO METROLOGOCO DO TACOGRAFO                              SELAGEM DO TACOGRAFO                                                            INSPEÇÃO TECNICA DO TACOGRAFO", "valor": 375.0, "fornecedor_codigo": "", "empresa": "G C COMERCIO DE VEICULOS LTDA ME"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "7298", "data_emissao": "2024-05-31", "produto": "CALOTA RODOAR CAPANEMA C/REFLETIVO TOP LINE L/E.                                                                                                         CANO CROMADO P/RODOAR 1.00.                                           GANCHO P/LONA AVULSO (VM) MV564.", "valor": 52.38, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "7915", "data_emissao": "2024-07-02", "produto": "FITA ISOLANTE ROLO C/5 METROS\nFUSIVEL LAMINA 15 AMP.\nFITA ISOLANTE ROLO C/5 METROS\nABRAÇADEIRA FITA 30CM NYLON\nLAMPADA H4 24V\nLANTERNA LAT BASE RETA LEDS.", "valor": 90.99, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "1841", "data_emissao": "2024-07-02", "produto": "SERVIÇOS DIVERSOS.", "valor": 140.0, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "35338", "data_emissao": "2024-07-11", "produto": "SERVIÇOS ELETRICO E TROCA DE MANGOTE TRASEIRO.", "valor": 3300.0, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "148841", "data_emissao": "2024-07-11", "produto": "ABRAÇADEIRA NYLON 37CM \nABRAÇADEIRA CHASSI\nLIMPADOR UNIVERSAL PREM\nLIMPA CONTATO 300ML\nFITA\nTRAPO P/LIMPEZA ANTI FERRUGEM\nFITA ISOLAMTE.", "valor": 1265.04, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "772", "data_emissao": "2024-07-17", "produto": "PM CAMINHAO 295/80R22,5 RT41 RT41 DUNLO F/S:S:5017 D:5017                                                                          PM CAMINHAO 295/80R22,5 RT41 RT41 DUNLO F/S:S:2817                                                                                         PM CAMINHAO 295/80R22,5 BXL1L PIREL F/S:S:3420 D:3420", "valor": 2280.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "800", "data_emissao": "2024-07-23", "produto": "RECAUCHUTAGEM OU REGENERAÇÃO DE PNEUS.           PM CAMINHÃO 295/80r22,5 RT41 DUNLO F/S:S0519       PM CAMINHÃO 295/80R22,5 RT41 RT41 DUNLO F/S:S:0418", "valor": 1570.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "804", "data_emissao": "2024-07-23", "produto": "ALINHAMENTO PESADO/BALANCEAMENTO PESADO", "valor": 140.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "15738", "data_emissao": "2024-07-29", "produto": "PORTA FUSIVEL LAMINADO FIO 2,5MM.                               TERMINAL P/FRIO 3/8.                                                                FUSIVEL LAMINA 15 AMP. (DNI316015).                               FIO 10 4,00MM ( PRETO ).                                                          PALHETA LIMP. 24 POL.VW CONSTELLATION/IVECO DAILY CC24.                                                                                      SIRENE P/RE 24V LINHA PESADA 9DNI-3200).                    LAMPADA 1141 24V PINO ENCONTRADO (AM) T1141VAB/GL1141C.                                                                     ABRACADEIRA FITA 40CM. LARGA (NYLON) 46/2C.         CONECTOR CHICOTE ELET. 2 VIAS (MULT-80000/CHW02030).                                                                    ABRACADEIRA FITA 40CM LARGA (NYLON) 46/C.             CABO PP 2X1 1,00.                                                                        BOMBA P/CLIMAT. BICO FINO 24V.                                       MOTOR P/CLIMATIZADOR 24V (1011044424).                    ABRACADEIRA FITA 30CM NYLON (3,6X1,4MM) ETE7571.                                                                                            BOMBA P/CLIMAT. BICO FINO 24V.", "valor": 483.85, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "4670", "data_emissao": "2024-07-29", "produto": "SERVIÇO ELETRICO 5041", "valor": 50.0, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "8538", "data_emissao": "2024-07-31", "produto": "TAMPA TANQUE ARLA 32 C/CHAVE VW MAN. APOS 2012 (TA1013).", "valor": 49.5, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "35930", "data_emissao": "2024-08-26", "produto": "DESLOCAMENTO MECANICO / ESCOVA DO CILINDRO / SERVIÇO MECANICO", "valor": 1190.0, "fornecedor_codigo": "", "empresa": "VIA DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "11891", "data_emissao": "2024-08-28", "produto": "COMUTADOR IGN 8 PINO VW", "valor": 165.16, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "9201", "data_emissao": "2024-08-31", "produto": "MANGUEIRA RODOAR 8,0X6,0X1,0 PRETA PP6147PT.     GANCHO P/LONA AVULSO (AZ) MV562.                              CALOTA RODOAR CROMADA C/REFLETIVO (FORTI-AR).                                                                                                    CALOTA RODOAR OLASTICA L/D.", "valor": 77.4, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "260391", "data_emissao": "2024-09-16", "produto": "CILINDRO BASCULANTE CABINE 64070.", "valor": 1807.0, "fornecedor_codigo": "", "empresa": "JS PEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "11953", "data_emissao": "2024-09-16", "produto": "LAMAPADA 1 POLO 24V BRANCA.                                          SERVO EMBREAGEM.                                                                   ROLETE SOB MEDIDA.                                                                  TAMBOR FREIO REMAN.                                                             COLA 3M ( ORIGINAL ).                                                                REBITE 10X12 BRONZE.                                                                LONA FREIO TS.                                                                              DESENGRIPANTE.                                                                          JG MOLA PATIM.                                                                    FUIDO EMBREAGEM.", "valor": 4260.59, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "EMBREAGEM", "local": "EXTERNO", "nota_fiscal": "7284", "data_emissao": "2024-09-16", "produto": "SERVIÇO CILINDRO/SERVO EMB.                                             SERVIÇO FREIOS 3 EIXOS.", "valor": 800.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "11959", "data_emissao": "2024-09-16", "produto": "OLEO MOTOR 15W40 C14 (LITRO)OFIC.                                FILTRO AR EXTERNO VW 13180/WAP103.                            FILTRO LUBRIF VW19390 EURO 5.                                            FILTRO COMB CUMMINS ISC.                                                      FILTRO RACOR TITAN EURO V.                                                 OLEO MOTOR 15W40 CI4 (BD 20L)", "valor": 1412.73, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "11964", "data_emissao": "2024-09-17", "produto": "KIT CONEXÃO RODOAR.                                                              OLEO HIDRAULICO.                                                                       COLA SILICONE.                                                                              GRAXA ROLAMENTO.                                                                  RETENTOR RODA TRUCK.                                                           ARANHA TRAVA CARRETA.                                                        DIAFRAGMA CUICA 30 S/ANEL.                                                DIAFRAGMA CUICA 24.                                                                MOLA CUICA.                                                                                  REPARO CUICA BENDIX.                                   ROLAMENTO.                                                                                  ROLETE.", "valor": 1296.18, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "7290", "data_emissao": "2024-09-17", "produto": "REVISÃO SISTEMA AR.                                                                 SERVIÇO FREIO EM GERAL.                                                        SERVIÇO TORNEIRO (CUBO RODA)", "valor": 800.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "13051", "data_emissao": "2024-10-17", "produto": "PNEU RADIAL DE ONIBUS E CAMINHÃO MST 295/80R22.5 MZ77ECO PR18 154/149M RT", "valor": 3624.0, "fornecedor_codigo": "", "empresa": "MAGNUM DISTRIBUIDORA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10536", "data_emissao": "2024-10-31", "produto": "DOBRADIÇA TAMPA FRONTAL VW CONST", "valor": 538.2, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "34349", "data_emissao": "2024-11-13", "produto": "PNEU AMULET 295/80R22.5 18PR 152/149M AT 505 LISO", "valor": 4338.14, "fornecedor_codigo": "", "empresa": "GOMMA DISTRIBUIDORA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "658", "data_emissao": "2024-12-17", "produto": "CHAPA DE FERRO", "valor": 600.0, "fornecedor_codigo": "", "empresa": "J C SOARES LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "161", "data_emissao": "2025-07-16", "produto": "SERVIÇO DE REPARO DE CABINE \nREVISÃO DO SISTEMA DE TURBO", "valor": 1372.75, "fornecedor_codigo": "", "empresa": "R. E. DIESEL"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "447301", "data_emissao": "2025-07-23", "produto": "AMORTECEDOR GRADE DT VW CONSTELLATION-MGC 16179/16179\nFILTRO ÓLEO LUB BLIND MT CUMMINS/MWM/SCA-WO711", "valor": 219.05, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "16131", "data_emissao": "2025-08-05", "produto": "PALHETA LIMP. 24 POL. VW CONSTELLATION/IVECO DAILY CC24\nINTENSE VONIXX 500ML (REVITALIZADOR PLASTICOS)\nLAMPADA PINGO D'ÀGUA 24V GDE (GL2825B)", "valor": 135.45, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "16132", "data_emissao": "2025-08-05", "produto": "TERMINAL CABO BATERIA SAPÃO REFORÇADO (ST78112S)\nCOLA SILICONE 50G ALTA TEMP. (CZ)\nGANCHO P/LONA AVULSO (PT) MV633", "valor": 154.8, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "468062", "data_emissao": "2025-08-14", "produto": "MAÇANETA EXT PORTA VW CONSTELLATION LD-21486/23486", "valor": 268.42, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "463180", "data_emissao": "2025-08-26", "produto": "MAÇANETA EXT PORTA VW CONSTELLATION LE-21485/23485", "valor": 134.21, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "12893", "data_emissao": "2025-08-27", "produto": "FECHADURA PORTA CONSTEL LE \nFECHADURA PORTA LD", "valor": 327.6, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "12893", "data_emissao": "2025-08-27", "produto": "FECHADURA PORTA CONSTEL LE \nFECHADURA PORTA LD", "valor": 327.6, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "7960", "data_emissao": "2025-08-27", "produto": "SERVIÇOS DIVERSOS", "valor": 300.0, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "3501", "data_emissao": "2025-09-02", "produto": "SERVIÇO CURTO CARRETA", "valor": 120.0, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "16784", "data_emissao": "2025-09-02", "produto": "FITA ISOLANTE ROLO C/5 METROS (AVX/DNI). DNA5F\nTAMPA TANQUE C/CHAVE DC 114/124 /VW CAM. TRINK (TV4080).", "valor": 102.6, "fornecedor_codigo": "", "empresa": "PAIZÃO AUTOPEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "12908", "data_emissao": "2025-09-04", "produto": "FILTRO RACOR                                                                         FILTRO COMBUSTIVEL", "valor": 274.78, "fornecedor_codigo": "", "empresa": "UTI DO CAMINHÃO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "AR", "local": "EXTERNO", "nota_fiscal": "10484", "data_emissao": "2025-09-23", "produto": "SERVICO DE REMOÇAO E INST. BOLSA AR", "valor": 559.81, "fornecedor_codigo": "", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "COMBUSTIVEL", "local": "EXTERNO", "nota_fiscal": "483240", "data_emissao": "2025-10-09", "produto": "ADITIVO RAD 1L CONCENT ROSA ORGAN-PCAD0001\nAMORTECEDOR DT VW 17220/31320/CARGO/45094", "valor": 769.2, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "211", "data_emissao": "2025-10-13", "produto": "SERVIÇO EM CONSTELATION 25 - 390\n\nLUBRIFICAÇÃO, LIMPEZA , LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MÁQUINAS, VEÍCULOS, APARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PARTES EMPREGADAS , QUE FICAM SUJEITAS AO ICMS)", "valor": 1130.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10950", "data_emissao": "2025-10-21", "produto": "BOB. P/VALV.", "valor": 170.0, "fornecedor_codigo": "", "empresa": "RAIZ COMERCIO DE VEDAÇÕES\n MANGUEIRAS E HIDRAULICOS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "40190", "data_emissao": "2025-10-10", "produto": "CORREIA 8PK1950 / K080768 (G)*\nROL TIM6203 2RSC3\nBUCHA ESTABILIZADOR R1201\nBUCHA ESTABILIZADOR R1261", "valor": 184.5, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5041", "servico": "ÓLEO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "487363", "data_emissao": "2025-10-18", "produto": "OLEO MT PEC OIL 20L 10W40 MAX TURBO DIES-1260105291", "valor": 524.97, "fornecedor_codigo": "", "empresa": "PADRE CICERO"}, {"prefixo": "5041", "servico": "PNEU", "descricao": "-----", "sistema": "PNEU", "local": "EXTERNO", "nota_fiscal": "17708", "data_emissao": "2025-10-23", "produto": "PNEU 295/80R22.5 152/148KHDMX SPM 18L", "valor": 4189.88, "fornecedor_codigo": "", "empresa": "ITR COMERCIOS DE PNEUS E PECAS S.A"}, {"prefixo": "5041", "servico": "PNEU", "descricao": "REFORMA DE PNEUMATICOS USADOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4366", "data_emissao": "2025-10-24", "produto": "PM CAMINHAO 295/80R22,5 RT78 CONTI                                                                          \nPM CAMINHAO 295/80R22,5 RT78 CONTI\nMANCHAO RAC 42\nPM CAMINHAO 295/80R22,5 RT78 ALTUR\nPM CAMINHAO 295/80R22,5 RT78 ALTUR", "valor": 3970.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "16948", "data_emissao": "2025-10-22", "produto": "MANGUEIRA R6 3/8\nMANGUEIRA R6 5/8\nABRAC FITA 13,5MM 19X27 (3/4X11/16)\nBUJAO LATAO M22\nTUBO NYLON PRETO 12 X 9\nSAE STD RETO 4MP-4MP (2083-4-4)", "valor": 137.25, "fornecedor_codigo": "", "empresa": "J. ROCHA DA SILVA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "18171", "data_emissao": "2025-10-31", "produto": "BARRA LIMPADOR VW CONSTELLATION GRANDE L/D\nMEIO PARALAMA PLAST. BI-TREM RANDON 2008/2012 L/D INJETADO\nCHAPINHA P/LAMEIRA 60CM. (F.C-008280). PARAFUSO SEXTAVADO 1/4X1\nFAIXA REFLETIVA PARACHOQUE (DM) ARRUELA 1/4\nPORCA 1/4 SEXTAVADA LAMEIRA PRETA 50X60", "valor": 414.09, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "486400", "data_emissao": "2025-10-16", "produto": "FILTRO COMBUS BLIND MT CUMMINS ISB/ISC/I-WK954/1X\nFILTRO COMB CASE COLHEITADEIRA A8800-PC727", "valor": 158.61, "fornecedor_codigo": "", "empresa": "AUTO PECAS PADRE CICERO LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "798928", "data_emissao": "2025-10-27", "produto": "MEIO PARALAMA PLAST. BI-TREM RANDON 2008/2012 L/D INJETADO\nCHAPINHA P/LAMEIRA 60CM (F.C/008280)\nPARAFUSO SEXTAVADO\nFAIXA REFLETIVA PARACHOQUE (DM)\nARRUELA 1/4\nPORCA 1/4 SECTAVADA\nLAMEITA PRETA 50X60", "valor": 313.0, "fornecedor_codigo": "", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "-----", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "41760", "data_emissao": "2025-11-19", "produto": "CUICA FREIO 81650540 30X30", "valor": 239.4, "fornecedor_codigo": "", "empresa": "CASA DO CAMINHAO COMERCIO LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "243", "data_emissao": "2025-11-18", "produto": "SERVICO TROCA DA CUICA DE FREIO TRACAO L.E\nREDUCAO DA CONEXAO DA CUICA", "valor": 290.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5041", "servico": "PNEU", "descricao": "RECAUCHUTAGEM OU REGENERAÇÃO DOS PNEUS\nREFORMA DE PNEUMATICOS USADOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "4687", "data_emissao": "2025-11-25", "produto": "PM CAMINHAO 295/80R22,5 RT61 RT61 DUNLO", "valor": 780.0, "fornecedor_codigo": "", "empresa": "FIGUEIRA COMERCIO E SERVICOS DE PNEU LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E RECARGA, CONSERTO, RESTAURAÇÃO, BLINDAGEM, MANUTENÇÃO E CONSERVAÇÃO DE MAQUINAS, VEICULOS.\nAPARELHOS, EQUIPAMENTOS, MOTORES, ELEVADORES OU DE QUALQUER OBJETO (EXCETO PEÇAS E PARTES EMPREGADAS, QUE FICAM SUJEITOS AO ICMS)", "sistema": "ARREFECIMENTO", "local": "EXTERNO", "nota_fiscal": "260", "data_emissao": "2025-12-09", "produto": "SERVICO DE LIMPEZA NO SISTEMA DE ARREFECIMENTO", "valor": 200.0, "fornecedor_codigo": "", "empresa": "R.E DIESEL LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "VEICULO:CONSTELLATION  25.390/ RETIFICA DO MOTOR CUMMMINS ISC 6-CILINDROS/CA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "2636", "data_emissao": "2026-01-06", "produto": "SERVIÇO DE RETÍFICA E CABEÇOTE MOTOR CUMMNS", "valor": 3005.2, "fornecedor_codigo": "5081", "empresa": "BRASIL (R.E) DIESEL LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "520258", "data_emissao": "2026-01-08", "produto": "JUNTA CABEC VW/OLEO MT PEC...", "valor": 1097.71, "fornecedor_codigo": "5021/3992", "empresa": "PADRE CICERO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "291189", "data_emissao": "2026-01-19", "produto": "JUNTA COLETOR ESCAPE 0102573", "valor": 207.64, "fornecedor_codigo": "136/4413/4343", "empresa": "JS PEÇAS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "RECONDICIONAMENTO DE MOTORES", "sistema": "SERVIÇOS TECNICO", "local": "EXTERNO", "nota_fiscal": "2617", "data_emissao": "2026-01-21", "produto": "SERVIÇOS DE REMOÇÃO E INSTALAÇÃO DO CABEÇOTE DO....", "valor": 1895.0, "fornecedor_codigo": "", "empresa": "R. E DIESEL LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO EMBUHAMENTO TENSOR\n/SERVIÇO  FEIXE MOLA TRASEIRO/  SERVIÇO OXICORTE", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26242", "data_emissao": "2026-01-21", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO,REVISÃO, CARGA E RE..", "valor": 680.0, "fornecedor_codigo": "1975", "empresa": "IRMÃO CLARA DISTRIBUIDORA DE PEÇAS LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TERCNICOS DE MANUTENÇÃO NOS CAMINHÕES", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10787", "data_emissao": "2026-01-21", "produto": "ARRUELA LISA 5/8, BUCHA SUSPENSÃO ,PORCA SEXTA, ETC", "valor": 2279.03, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "26228", "data_emissao": "2026-01-23", "produto": "SO CONS. CAMINHAO 295/80 R 22.5 VULC VULC ALTUR S:2122", "valor": 200.0, "fornecedor_codigo": "", "empresa": "PATRIMONIAL PNEUS"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10787", "data_emissao": "2026-01-21", "produto": "ARRUELA LISA 5/8/BUCHA/MOLA/PORCA/PARAFUSO/PINO", "valor": 2279.03, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS P/EMPILHADEIRA", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26242", "data_emissao": "2026-01-21", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARGA E ETC", "valor": 680.0, "fornecedor_codigo": "1975", "empresa": "IRMAO  CLARA DISTRIBUIDORA DE PEÇAS LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "17511", "data_emissao": "2026-01-27", "produto": "TUBO ESPIRAL P FREIO CARRETA 12X9X4.5M, BUCHA DE RED.", "valor": 282.0, "fornecedor_codigo": "", "empresa": "J. ROCHA DA SILVA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "491", "data_emissao": "2026-01-29", "produto": "LANPADA PINGO LED/ LANTERNA LATERAL/FAIXA REFLETIVA..", "valor": 662.5, "fornecedor_codigo": "4904", "empresa": "TRUCK CENTER CAVERINHA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇOS TECNICOS", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "504", "data_emissao": "2026-02-09", "produto": "LAMPADA/TINTA SPRAY/LANTERNA/ARRUELA/APARABARRO..", "valor": 747.36, "fornecedor_codigo": "4904", "empresa": "TRUCK CENTER CAVERINHA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "2667", "data_emissao": "2026-02-27", "produto": "LAVAGEM", "valor": 200.0, "fornecedor_codigo": "5362", "empresa": "BARUCH AUTO CENTER LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "545890", "data_emissao": "2026-03-07", "produto": "MOTOR PART 38MT VW", "valor": 2275.12, "fornecedor_codigo": "5021/3992", "empresa": "PADRE CICERO"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "73723", "data_emissao": "2026-03-24", "produto": "ABRAÇADEIRA TUCHO MOLA", "valor": 120.0, "fornecedor_codigo": "4777", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "FREIO", "local": "EXTERNO", "nota_fiscal": "1912", "data_emissao": "2026-03-11", "produto": "REP VALV/ DIAFRAGMA SEM ANEL/ DIAFRAGMA COM ANEL/ ...", "valor": 308.0, "fornecedor_codigo": "4823", "empresa": "BELL FREIOS A AR COMERCIO E SERVIÇOS LTDA"}, {"prefixo": "5041", "servico": "MANUTENÇÃO", "descricao": "SERVIÇO TECNICO", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "10960", "data_emissao": "2026-04-06", "produto": "BUCHA/ GRAMPO/PORCA/PINO DE CENTRO/PINO BALANÇA", "valor": 623.0, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "SERVIÇO", "descricao": "SERVIÇO FEIXE MOLA TRASEIRO/ SERVIÇO REFORMAR BALANÇA/ REMOÇÃO E INST BALANÇA", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26415", "data_emissao": "2026-04-06", "produto": "LUBRIFICAÇÃO/ LIMPEZA/ LUSTRAÇÃO/ REVISÃO...", "valor": 860.0, "fornecedor_codigo": "1975", "empresa": "IRMÃOS CLARA DIST DE PEÇAS LTDA ME"}, {"prefixo": "5041", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "MOTOR", "local": "EXTERNO", "nota_fiscal": "297706", "data_emissao": "2026-05-06", "produto": "FILTRO AR DO MOTOR/ FILTRO OLEO/ FILTRO DE COMBUSTIVEL", "valor": 303.71, "fornecedor_codigo": "136", "empresa": "JS PEÇAS"}, {"prefixo": "5041", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "1991", "data_emissao": "2026-05-06", "produto": "REP VALVULA SOLENOIDE COMPLETA", "valor": 230.0, "fornecedor_codigo": "4823", "empresa": "BELL FREIOS A AR COMERCIO E SERVIÇOS"}, {"prefixo": "5041", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "LUBRIFICAÇÃO", "local": "EXTERNO", "nota_fiscal": "26226", "data_emissao": "2026-05-06", "produto": "LUBRIFICAÇÃO, LIMPEZA, LUSTRAÇÃO, REVISÃO, CARA E RECARGA.", "valor": 200.0, "fornecedor_codigo": "4823", "empresa": "BELL FREIOS A AR COMERCIO E SERVIÇOS"}, {"prefixo": "5041", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "106025", "data_emissao": "2026-05-11", "produto": "FILTRO COLHEITADEIRA", "valor": 113.66, "fornecedor_codigo": "3992", "empresa": "PADRE CÍCERO"}, {"prefixo": "5041", "servico": "OFICINA", "descricao": "USO DA OFICINA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "186997", "data_emissao": "2026-05-13", "produto": "BATERIA M150BD", "valor": 2033.46, "fornecedor_codigo": "858", "empresa": "CODIBA COMERCIAL DISTRIBUIDORA DE BATERIA"}, {"prefixo": "5041", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "DIREÇÃO", "local": "EXTERNO", "nota_fiscal": "26538", "data_emissao": "2026-05-14", "produto": "SERVIÇO PONTEIRA BARRA DIREÇÃO", "valor": 1156.0, "fornecedor_codigo": "1975", "empresa": "IRMÃOS CLARA DIST DE PEÇAS LTDA ME"}, {"prefixo": "5041", "servico": "SERVIÇO", "descricao": "MÃO DE OBRA", "sistema": "ELETRICO", "local": "EXTERNO", "nota_fiscal": "260491", "data_emissao": "2026-05-18", "produto": "SERVIÇO ELETRICO, RÉ E MEIA LUZ", "valor": 80.0, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5041", "servico": "VENDA", "descricao": "VENDA DE MERCADORIA", "sistema": "DIVERSOS", "local": "EXTERNO", "nota_fiscal": "22235", "data_emissao": "2026-05-18", "produto": "BUJÃO, PINO REDONDA, PORCA REDONDA, FITA ISOLANTE, TOMADA ELETRICA, LAMPADA, ABRAÇADEIRA, CEBOLINHA, COLA...", "valor": 906.66, "fornecedor_codigo": "4784", "empresa": "PAIZAO AUTOPECAS E ACESSORIOS DISTRIBUIDORA LTDA"}, {"prefixo": "5041", "servico": "OFICINA", "descricao": "PEÇAS", "sistema": "ELETRICO", "local": "INTERNO", "nota_fiscal": "188220", "data_emissao": "2026-06-11", "produto": "BATERIA M150BD MGE SLI", "valor": 972.73, "fornecedor_codigo": "-", "empresa": "CODIBA C. DISTRIB"}, {"prefixo": "5041", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26954", "data_emissao": "2026-06-11", "produto": "ENSAIO E SELAGEM DE TACOGRAFO", "valor": 302.0, "fornecedor_codigo": "2140", "empresa": "G C COMERCIO"}, {"prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "11186", "data_emissao": "2026-06-22", "produto": "BOLSA DE AR", "valor": 599.61, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "SERVIÇO", "descricao": "SERVIÇOS TÉCNICOS", "sistema": "SERVIÇOS TÉCNICOS", "local": "EXTERNO", "nota_fiscal": "26637", "data_emissao": "2026-06-22", "produto": "ROMOÇÃO E INSTALAÇÃO DA BOLDA DE AR", "valor": 150.0, "fornecedor_codigo": "1975", "empresa": "AUTO MOLAS CLARA"}, {"prefixo": "5041", "servico": "OPERAÇÃO", "descricao": "PEÇAS", "sistema": "ACESSORIOS", "local": "EXTERNO", "nota_fiscal": "23084", "data_emissao": "2026-06-30", "produto": "FRANGER RODOAR+CALOTA RODOAR+ARRUELA+ABRAÇADEIRA+PALHETA+MANGUEIRA", "valor": 374.76, "fornecedor_codigo": "4777", "empresa": "PAIZÃO AUTOPEÇAS"}];

async function importarHistorico5041V241() {
  const ja=await pool.query("SELECT valor FROM sistema_config WHERE chave='historico_5041_v241'");
  if(ja.rowCount) return;
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    const v=await c.query("SELECT id FROM veiculos WHERE prefixo='5041' LIMIT 1");
    if(!v.rowCount) throw new Error("Veículo 5041 não encontrado.");

    await c.query(`DELETE FROM manutencoes
      WHERE COALESCE(veiculo_prefixo,'')='5041'
      AND origem_importacao IN ('PLANILHA_MANUTENCAO_2026','HISTORICO_FROTA_V3','HISTORICO_5041_V241')`);

    for(const x of HISTORICO_5041_V241) {
      await c.query(`INSERT INTO manutencoes
        (veiculo_id,veiculo_prefixo,tipo,servico,descricao,sistema,local,nota_fiscal,data_emissao,
         produto,custo,fornecedor_codigo,empresa,status,data_abertura,origem_importacao)
        VALUES($1,'5041',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Concluída',
               COALESCE($8,CURRENT_DATE),'HISTORICO_5041_V241')`,
        [v.rows[0].id,x.servico||'MANUTENÇÃO',x.servico||'MANUTENÇÃO',x.descricao||'',
         x.sistema||'',x.local||'',x.nota_fiscal||'',x.data_emissao||null,x.produto||'',
         Number(x.valor||0),x.fornecedor_codigo||'',x.empresa||'']);
    }
    await c.query("INSERT INTO sistema_config(chave,valor) VALUES('historico_5041_v241',$1)",
      [String(HISTORICO_5041_V241.length)]);
    await c.query("COMMIT");
    console.log(`Histórico 5041 V2.4.1 importado: ${HISTORICO_5041_V241.length} registros.`);
  } catch(e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
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
  .then(migrarFinalizacaoOS)
  .then(importarDadosIniciaisUmaVez)
  .then(importarHistoricoManutencaoV23)
  .then(importarHistoricoFrotaV3)
  .then(importarHistorico5041V241)
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Gestão-Frota online na porta ${PORT}`)))
  .catch(err => { console.error("Falha ao iniciar banco:", err); process.exit(1); });
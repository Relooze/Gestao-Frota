const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// Permite receber JSON
app.use(express.json());

// Conexão com PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Página inicial
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Gestão de Frota & Expedição</title>
      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #0b172a;
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }

        .box {
          text-align: center;
          background: #132238;
          padding: 50px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,.35);
        }

        h1 {
          margin-bottom: 10px;
        }

        .status {
          margin-top: 25px;
          color: #4ade80;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <h1>🚚 Gestão de Frota & Expedição</h1>
        <p>Sistema de gerenciamento operacional</p>

        <div class="status">
          ● Servidor online
        </div>
      </div>
    </body>
    </html>
  `);
});

// Teste da API
app.get("/api/health", (req, res) => {
  res.json({
    sistema: "Gestão de Frota & Expedição",
    servidor: "online",
    data: new Date(),
  });
});

// Teste do PostgreSQL
app.get("/api/database", async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT NOW() AS horario"
    );

    res.json({
      banco: "online",
      postgres: true,
      horario: resultado.rows[0].horario,
    });
  } catch (erro) {
    console.error("Erro PostgreSQL:", erro.message);

    res.status(500).json({
      banco: "offline",
      postgres: false,
      erro: "Não foi possível conectar ao banco.",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});

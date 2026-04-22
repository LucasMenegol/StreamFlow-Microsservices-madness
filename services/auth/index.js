/**
 * StreamFlow — Auth Service
 *
 * Responsável por autenticação de usuários e emissão de tokens JWT (RS256).
 * Único serviço que possui a chave privada.
 */

const Fastify = require('fastify');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = Fastify({ logger: true });

const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || './data/auth.db';
const PRIVATE_KEY = fs.readFileSync(
  process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
  'utf8'
);

// ── Inicialização do banco ──────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    name TEXT NOT NULL
  )
`);

// Seed de dados iniciais (se tabela vazia)
const count = db.prepare('SELECT COUNT(*) as total FROM users').get();
if (count.total === 0) {
  const insert = db.prepare(
    'INSERT INTO users (id, email, password, role, name) VALUES (?, ?, ?, ?, ?)'
  );

  const salt = bcrypt.genSaltSync(10);
  insert.run('user_1', 'admin@streamflow.com', bcrypt.hashSync('admin123', salt), 'admin', 'Ana Silva');
  insert.run('user_2', 'joao@streamflow.com', bcrypt.hashSync('user123', salt), 'user', 'João Santos');
  insert.run('user_3', 'maria@streamflow.com', bcrypt.hashSync('user123', salt), 'user', 'Maria Oliveira');

  console.log('Seed: 3 usuários criados');
}

// ── Rotas ───────────────────────────────────────────────────

// POST /login
app.post('/login', async (request, reply) => {
  const { email, password } = request.body || {};

  if (!email || !password) {
    return reply.code(400).send({ error: 'Email e senha são obrigatórios.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return reply.code(401).send({ error: 'Credenciais inválidas.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return reply.code(401).send({ error: 'Credenciais inválidas.' });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '2h', issuer: 'streamflow-auth' }
  );

  return { token, user: { id: user.id, name: user.name, role: user.role } };
});

// GET /health
app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'auth-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
});

// ── Inicialização ───────────────────────────────────────────
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`auth-service rodando na porta ${PORT}`);
});

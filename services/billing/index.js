/**
 * StreamFlow — Billing Service
 *
 * Gerencia planos de assinatura e faturas dos usuários.
 *
 * ⚠️  ANTIPATTERN: Banco de dados compartilhado
 *     Este serviço usa o arquivo shared_billing.db, que é o MESMO
 *     banco acessado pelo analytics-service. Ambos leem e escrevem
 *     nas mesmas tabelas. Isso viola o princípio "database per service"
 *     e cria acoplamento forte entre os dois serviços.
 */

const Fastify = require('fastify');
const Database = require('better-sqlite3');

const app = Fastify({ logger: true });

const PORT = process.env.PORT || 3006;
const DB_PATH = process.env.DB_PATH || './data/shared_billing.db';

// ── Banco de dados (COMPARTILHADO com analytics!) ───────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    price_monthly REAL NOT NULL,
    status TEXT DEFAULT 'active',
    started_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    paid INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Seed
const subCount = db.prepare('SELECT COUNT(*) as total FROM subscriptions').get();
if (subCount.total === 0) {
  const insertSub = db.prepare(
    'INSERT INTO subscriptions (user_id, plan, price_monthly, status) VALUES (?, ?, ?, ?)'
  );
  insertSub.run('user_1', 'Premium', 49.90, 'active');
  insertSub.run('user_2', 'Básico', 19.90, 'active');
  insertSub.run('user_3', 'Standard', 34.90, 'active');

  const insertInv = db.prepare(
    'INSERT INTO invoices (user_id, amount, due_date, paid) VALUES (?, ?, ?, ?)'
  );
  insertInv.run('user_1', 49.90, '2026-05-05', 0);
  insertInv.run('user_1', 49.90, '2026-04-05', 1);
  insertInv.run('user_2', 19.90, '2026-05-05', 0);
  insertInv.run('user_3', 34.90, '2026-05-05', 0);
  insertInv.run('user_3', 34.90, '2026-04-05', 1);

  console.log('Seed: assinaturas e faturas criadas');
}

// ── Rotas ───────────────────────────────────────────────────

// GET /billing/:userId — informações de faturamento
app.get('/billing/:userId', async (request, reply) => {
  const { userId } = request.params;

  const subscription = db.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? AND status = ?'
  ).get(userId, 'active');

  const invoices = db.prepare(
    'SELECT * FROM invoices WHERE user_id = ? ORDER BY due_date DESC'
  ).all(userId);

  if (!subscription) {
    return reply.code(404).send({ error: 'Assinatura não encontrada.' });
  }

  return { subscription, invoices };
});

// GET /health
app.get('/health', async () => ({
  status: 'ok',
  service: 'billing-service',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// ── Inicialização ───────────────────────────────────────────
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  app.log.info(`billing-service rodando na porta ${PORT}`);
});

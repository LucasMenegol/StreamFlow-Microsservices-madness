# StreamFlow — Especificação Arquitetural

**Sistema:** StreamFlow — Plataforma de Streaming de Vídeo  
**Arquitetura:** Microsserviços containerizados com Docker Compose  
**Stack:** Node.js (Fastify) + SQLite (better-sqlite3) + JWT RS256

---

## Diagrama da Arquitetura

```
                              ┌─────────────────────────────┐
                              │        API Gateway          │
                              │    (Fastify + http-proxy)   │
                              │        :8080                │
                              │                             │
                              │  • Roteamento centralizado  │
                              │  • Autenticação JWT (RS256) │
                              │  • Logging estruturado      │
                              │  • Health check agregado    │
                              └──────────┬──────────────────┘
                                         │
            ┌──────────────┬─────────────┼─────────────┬──────────────┐
            │              │             │             │              │
     ┌──────┴──────┐ ┌─────┴──────┐ ┌───┴────┐ ┌─────┴──────┐ ┌────┴────────┐
     │    Auth     │ │  Catalog   │ │Streaming│ │Recommend.  │ │Notification │
     │  Service    │ │  Service   │ │ Service │ │  Service   │ │  Service    │
     │   :3001     │ │   :3002    │ │  :3003  │ │   :3004    │ │   :3005     │
     │             │ │            │ │         │ │            │ │             │
     │ [auth.db]   │ │[catalog.db]│ │[stream- │ │[recommend- │ │  [SEM BD]   │
     │ users       │ │ movies     │ │ ing.db] │ │ ation.db]  │ │             │
     │             │ │            │ │sessions │ │view_history│ │  Simula     │
     │ RS256 priv. │ │            │ │         │ │preferences │ │  envio      │
     └─────────────┘ └────────────┘ └────┬────┘ └────────────┘ └─────────────┘
                                         │
                                  Chamadas síncronas
                                  durante o Play:
                                  1→ catalog (licença)
                                  2→ recommendation (viewed)
                                  3→ notification (alerta)
                                         │
                          ┌──────────────┴──────────────┐
                          │                             │
                   ┌──────┴──────┐              ┌───────┴───────┐
                   │   Billing   │              │   Analytics   │
                   │   Service   │              │   Pipeline    │
                   │    :3006    │              │    :3007      │
                   │             │              │               │
                   │ ████████████████████████████████████████   │
                   │        shared_billing.db                   │
                   │  subscriptions │ invoices │ report_cache   │
                   │ ████████████████████████████████████████   │
                   └─────────────┘              └───────────────┘
                    Banco COMPARTILHADO entre billing e analytics
```

---

## Descrição dos Serviços

### 1. API Gateway (:8080)

| Atributo             | Detalhe                                                              |
| -------------------- | -------------------------------------------------------------------- |
| **Tecnologia**       | Fastify + @fastify/http-proxy                                        |
| **Responsabilidade** | Ponto de entrada único. Roteia requisições para os serviços internos |
| **Autenticação**     | Valida JWT com chave pública RS256 (preHandler hook)                 |
| **Logging**          | Pino (estruturado, JSON, request-id automático)                      |
| **Banco de dados**   | Nenhum                                                               |

### 2. Auth Service (:3001)

| Atributo             | Detalhe                                                      |
| -------------------- | ------------------------------------------------------------ |
| **Tecnologia**       | Fastify + jsonwebtoken + bcrypt + better-sqlite3             |
| **Responsabilidade** | Autenticação de usuários, emissão de tokens JWT              |
| **Banco**            | `auth.db` — tabela `users` (id, email, password, role, name) |
| **Segurança**        | Único serviço com acesso à chave privada RSA                 |
| **Endpoints**        | `POST /login`, `GET /health`                                 |

### 3. Catalog Service (:3002)

| Atributo             | Detalhe                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| **Tecnologia**       | Fastify + better-sqlite3                                                                  |
| **Responsabilidade** | Gestão do catálogo de filmes e séries                                                     |
| **Banco**            | `catalog.db` — tabela `movies` (id, title, genre, year, rating, license_active, synopsis) |
| **Endpoints**        | `GET /catalog`, `GET /catalog/:id`, `GET /catalog/:id/license`, `GET /health`             |

### 4. Streaming Service (:3003)

| Atributo             | Detalhe                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **Tecnologia**       | Fastify + better-sqlite3                                                                 |
| **Responsabilidade** | Gerenciamento de sessões de reprodução                                                   |
| **Banco**            | `streaming.db` — tabela `sessions` (id, user_id, movie_id, started_at, duration, status) |
| **Endpoints**        | `POST /streaming/play`, `GET /streaming/sessions`, `GET /health`                         |
| **Dependências**     | Chama sincronamente: catalog-service, recommendation-service, notification-service       |

### 5. Recommendation Service (:3004)

| Atributo             | Detalhe                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| **Tecnologia**       | Fastify + better-sqlite3                                                      |
| **Responsabilidade** | Perfis de preferência e histórico de visualizações                            |
| **Banco**            | `recommendation.db` — tabelas `view_history`, `user_preferences`              |
| **Endpoints**        | `GET /recommendations/:userId`, `POST /recommendations/viewed`, `GET /health` |

### 6. Notification Service (:3005)

| Atributo             | Detalhe                                           |
| -------------------- | ------------------------------------------------- |
| **Tecnologia**       | Fastify (sem banco de dados)                      |
| **Responsabilidade** | Simulação de envio de notificações (push, e-mail) |
| **Banco**            | Nenhum                                            |
| **Endpoints**        | `POST /notify`, `GET /health`                     |
| **Latência**         | Simula 100-300ms por notificação                  |

### 7. Billing Service (:3006)

| Atributo             | Detalhe                                                   |
| -------------------- | --------------------------------------------------------- |
| **Tecnologia**       | Fastify + better-sqlite3                                  |
| **Responsabilidade** | Planos de assinatura e faturas                            |
| **Banco**            | `shared_billing.db` — tabelas `subscriptions`, `invoices` |
| **Endpoints**        | `GET /billing/:userId`, `GET /health`                     |

### 8. Analytics Pipeline (:3007)

| Atributo             | Detalhe                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| **Tecnologia**       | Fastify + better-sqlite3                                                      |
| **Responsabilidade** | Geração de relatórios financeiros e métricas                                  |
| **Banco**            | `shared_billing.db` (mesmo banco do billing!) + tabela própria `report_cache` |
| **Endpoints**        | `GET /analytics/report`, `GET /analytics/history`, `GET /health`              |

---

## Fluxos de Comunicação

### Fluxo 1: Login (simples, sem problemas)

```
Cliente → Gateway → Auth Service → responde token JWT
```

### Fluxo 2: Listar catálogo (simples, sem problemas)

```
Cliente → Gateway (valida JWT) → Catalog Service → responde lista de filmes
```

### Fluxo 3: Play (cadeia síncrona — problemático)

```
Cliente → Gateway (valida JWT) → Streaming Service
                                      │
                                      ├─ 1. GET catalog-service/catalog/:id/license
                                      │      (aguarda resposta)
                                      │
                                      ├─ 2. POST recommendation-service/viewed
                                      │      (aguarda resposta)
                                      │
                                      ├─ 3. POST notification-service/notify
                                      │      (aguarda resposta — 100-300ms de latência)
                                      │
                                      └─ 4. INSERT na tabela sessions local
                                             responde ao cliente

Latência total = latência rede (hop 1) + latência rede (hop 2) + latência rede (hop 3)
                 + processamento notification (100-300ms) + overhead serialização
```

### Fluxo 4: Relatório de Analytics (pipeline sequencial)

```
Cliente → Gateway (valida JWT) → Analytics Service
                                      │
                                      ├─ Etapa 1: SELECT * FROM subscriptions (banco do billing!)
                                      ├─ Etapa 2: SELECT * FROM invoices (banco do billing!)
                                      ├─ Etapa 3: Agregação em memória
                                      ├─ Etapa 4: Formatação do relatório
                                      └─ Etapa 5: INSERT INTO report_cache
                                             responde ao cliente

Cada etapa depende da anterior — pipeline sequencial sem paralelismo.
```

---

## Mapa de Bounded Contexts

| Bounded Context    | Serviço             | Entidades                          | Isolamento de dados |
| ------------------ | ------------------- | ---------------------------------- | ------------------- |
| **Identidade**     | Auth                | User (id, email, role)             | ✅ BD próprio       |
| **Conteúdo**       | Catalog             | Movie (title, genre, license)      | ✅ BD próprio       |
| **Reprodução**     | Streaming           | Session (user, movie, status)      | ✅ BD próprio       |
| **Personalização** | Recommendation      | ViewHistory, Preferences           | ✅ BD próprio       |
| **Comunicação**    | Notification        | — (stateless)                      | ⚠️ Sem BD           |
| **Financeiro**     | Billing + Analytics | Subscription, Invoice, ReportCache | ❌ BD compartilhado |

---

## Tecnologias por Serviço

| Serviço        | Framework                     | Persistência   | Autenticação              | Observações                       |
| -------------- | ----------------------------- | -------------- | ------------------------- | --------------------------------- |
| Gateway        | Fastify + @fastify/http-proxy | —              | JWT RS256 (chave pública) | Pino logger                       |
| Auth           | Fastify                       | better-sqlite3 | JWT RS256 (chave privada) | bcrypt para senhas                |
| Catalog        | Fastify                       | better-sqlite3 | — (atrás do gateway)      | —                                 |
| Streaming      | Fastify                       | better-sqlite3 | — (atrás do gateway)      | fetch para chamadas inter-serviço |
| Recommendation | Fastify                       | better-sqlite3 | — (atrás do gateway)      | —                                 |
| Notification   | Fastify                       | —              | —                         | Latência simulada                 |
| Billing        | Fastify                       | better-sqlite3 | — (atrás do gateway)      | Banco compartilhado               |
| Analytics      | Fastify                       | better-sqlite3 | — (atrás do gateway)      | Banco compartilhado + pipeline    |

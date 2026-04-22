# StreamFlow — Guia de Instalação e Execução

## Pré-requisitos

- **Docker** ≥ 24.0 e **Docker Compose** ≥ 2.20
- **Node.js** ≥ 20 (apenas para desenvolvimento local sem Docker)
- **Git** (para clonar o repositório)

Verifique sua instalação:
```bash
docker --version
docker compose version
node --version
```

---

## Executar com Docker Compose (recomendado)

### 1. Clonar o repositório
```bash
git clone <url-do-repositorio>
cd projeto/
```

### 2. Verificar as chaves RSA
O projeto já inclui um par de chaves RSA para JWT. Se quiser gerar novas:
```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### 3. Subir todos os serviços
```bash
docker compose up --build
```

Você verá logs de todos os 8 serviços (gateway + 7 microsserviços).
O gateway estará acessível em `http://localhost:8080`.

### 4. Testar o sistema

**Login (obter token):**
```bash
curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@streamflow.com","password":"admin123"}' | jq
```

**Salvar o token numa variável (Linux/Mac):**
```bash
TOKEN=$(curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@streamflow.com","password":"admin123"}' | jq -r '.token')
```

**Listar catálogo:**
```bash
curl -s http://localhost:8080/api/catalog \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Iniciar reprodução (fluxo com cadeia síncrona):**
```bash
curl -s -X POST http://localhost:8080/api/streaming/play \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"movieId": 1}' | jq
```

**Ver recomendações:**
```bash
curl -s http://localhost:8080/api/recommendations/user_1 \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Ver faturamento:**
```bash
curl -s http://localhost:8080/api/billing/user_1 \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Gerar relatório de analytics (pipeline sequencial):**
```bash
curl -s http://localhost:8080/api/analytics/report \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Health check geral:**
```bash
curl -s http://localhost:8080/health | jq
```

### 5. Parar os serviços
```bash
docker compose down

# Para apagar também os dados persistidos (volumes):
docker compose down -v
```

---

## Executar sem Docker (desenvolvimento local)

Cada serviço pode ser executado individualmente:

```bash
# Instalar dependências de um serviço
cd services/auth
npm install

# Executar com hot-reload
npm run dev
```

As variáveis de ambiente podem ser ajustadas diretamente ou via arquivo `.env`.
Para o gateway, ajuste as URLs dos serviços para `http://localhost:<porta>`.

---

## Estrutura de portas

| Serviço | Porta | Acessível externamente? |
|---|---|---|
| **Gateway** | 8080 | Sim — única porta pública |
| auth-service | 3001 | Não (apenas via gateway) |
| catalog-service | 3002 | Não |
| streaming-service | 3003 | Não |
| recommendation-service | 3004 | Não |
| notification-service | 3005 | Não |
| billing-service | 3006 | Não |
| analytics-service | 3007 | Não |

---

## Usuários disponíveis para testes

| Email | Senha | Role |
|---|---|---|
| admin@streamflow.com | admin123 | admin |
| joao@streamflow.com | user123 | user |
| maria@streamflow.com | user123 | user |

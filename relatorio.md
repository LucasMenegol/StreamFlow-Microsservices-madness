# Report de Análise Arquitetural — StreamFlow
Para: Marcos Oliveira (VP de Produto)

De: Lucas da Silva Menegol

Assunto: Plano de Estabilização e Eficiência Operacional

### Seção 1 — Custo Operacional Oculto
Diagnóstico: O Marcos tem razão. Atualmente, mantemos 7 microsserviços para uma equipe de apenas 15 pessoas.

A Causa: Cada serviço possui seu próprio Dockerfile, banco de dados (SQLite), stack de rede e logs independentes.

O Overhead: Estimamos que a equipe gaste 60% do tempo mantendo a "cola" entre os serviços (infraestrutura) e apenas 40% em features.

Proposta: Consolidação. O Analytics-Service e o Billing-Service já compartilham o mesmo banco de dados (Antipattern detectado!). Eles devem ser fundidos em um único serviço de "Finanças", reduzindo custos de container e complexidade de rede.

### Seção 2 — Latência de Rede
Diagnóstico: O fluxo de "Play" é o coração do sistema e hoje ele é frágil.

Evidência: Em nossos testes, o POST /streaming/play levou cerca de 1.5s. Uma chamada simples ao catálogo leva apenas 0.011s.

Causa Raiz: Para um vídeo começar, o serviço de Streaming espera (sincronamente) o Catálogo, a Recomendação e a Notificação. Se o notification-service demorar 300ms, o usuário sente o atraso na hora.

Proposta: Assincronismo. O Play só deve esperar a licença do Catálogo. O registro de recomendação e o envio de notificação devem ser disparados em "background". O usuário não deve esperar um e-mail ser enviado para o filme começar.

### Seção 3 — Observabilidade Frágil
Diagnóstico: O incidente de 45 minutos ocorreu porque nossos logs são "mudos" entre os serviços.

Problema: Você viu nos logs (level: 30) que as requisições acontecem, mas não há um Correlation ID (um ID único que viaja do Gateway até o último serviço). Sem isso, não sabemos qual log do Streaming pertence a qual login do Auth.

Proposta: Implementar OpenTelemetry para Tracing Distribuído e padronizar os Health Checks (corrigindo o falso positivo de degraded no Gateway que detectamos).

### Seção 4 — Consistência Eventual
Diagnóstico: Há risco de recomendarmos filmes que saíram do catálogo.

Análise: O Recommendation-Service guarda uma cópia local de dados. Se um filme é deletado no Catalog-Service, a recomendação não fica sabendo.

Proposta: Manter a Consistência Eventual. Não precisamos deletar a recomendação instantaneamente, mas precisamos de um "Evento de Exclusão" que limpe o histórico de forma assíncrona.

### Seção 5 — Lei de Conway
Diagnóstico: 15 pessoas para 7 serviços gera "silos" de conhecimento.

O Problema: Quando Rafael e Camila saíram, o conhecimento de infraestrutura morreu.

Proposta: Reduzir a carga cognitiva. Com a fusão de serviços (Sessão 1), teremos 4 ou 5 serviços maiores e mais robustos, permitindo que todos os 15 desenvolvedores conheçam toda a base de código.

### Seção 6 — O Caso Prime Video (Lições Aprendidas)
Diagnóstico: O Prime Video reduziu custos em 90% ao transformar microsserviços de pipeline de vídeo em um monólito funcional.

Analogia no StreamFlow: Nosso Analytics-Service é o exemplo perfeito. Ele faz um processo sequencial (Coleta -> Agregação -> Formatação). Ele não ganha nada sendo um serviço separado via rede; ele só perde performance.

Ação: Mover a lógica de Analytics para dentro do Billing como um módulo interno.

Tarefa Bônus: Análise do Moleculer.js
Se você for entregar o bônus, aqui estão os pontos-chave:

O que resolve: Ele já traz o Circuit Breaker (se o Notification cair, ele para de tentar chamá-lo automaticamente) e o Service Discovery (os serviços se acham sem precisar de URLs fixas no Docker).

O Perigo: Ele esconde a complexidade. Se o transporte de mensagens do Moleculer falhar, a equipe terá ainda mais dificuldade de depurar do que com o Fastify atual.

Recomendação: Não migrar agora. Primeiro, devemos simplificar a arquitetura (consolidar serviços). Migrar para um framework complexo agora só aumentaria o problema de "conhecimento oculto" que o Marcos mencionou.

# Tarefa Bonús

### 1. O que o Moleculer resolve de graça
O Moleculer não é apenas uma biblioteca, mas um ecossistema completo que automatiza a "cola" (o encanamento) entre os microsserviços. No nosso cenário atual, ele resolveria:
Service Discovery & Registry: Hoje, o streaming-service precisa saber a URL exata do notification-service. No Moleculer, os serviços se autodescobrem. Se subirmos 10 instâncias, elas se registram sozinhas.
Resiliência Integrada (Fault Tolerance): Ele possui Circuit Breaker, Retries e Timeouts nativos. Se o notification-service ficar lento (como vimos nos testes), o Moleculer corta a comunicação automaticamente para não travar o streaming-service.
Balanceamento de Carga: Ele distribui as requisições entre instâncias usando estratégias como Round-Robin ou baseadas em latência/uso de CPU, sem precisar de um Load Balancer externo complexo.
Observabilidade Unificada: O framework já vem com exporters para Jaeger/Zipkin (Tracing) e Prometheus (Métricas). Isso resolve diretamente a "cegueira" que tivemos nos últimos incidentes, permitindo rastrear o caminho de um "Play" do início ao fim.
Transporte Flexível: Podemos trocar a comunicação HTTP (lenta) por NATS, Redis ou Kafka apenas mudando uma linha de configuração, sem mexer na lógica de negócio.
### 2. O que o Moleculer esconde
Seguindo o argumento do vídeo "Microservices at Scale", o Moleculer introduz uma abstração de rede que pode ser perigosa:
A "Mágica" do Local vs. Remoto: O Moleculer faz uma chamada para um serviço em outro servidor parecer uma chamada de função local (broker.call("service.action")). Isso esconde o fato de que existe uma rede instável no meio. O desenvolvedor pode esquecer que aquela linha de código pode falhar por problemas de infraestrutura.
Acoplamento ao Framework: Ao adotar o Moleculer, o código deixa de ser "Node.js puro" e passa a depender fortemente da estrutura de actions, events e methods do framework. É o chamado Vendor Lock-in de software.
Debug de Middleware: Como ele intercepta todas as chamadas para injetar métricas e validações, se houver um erro no transporte de dados, o stack trace pode ser confuso, dificultando encontrar se o erro é no seu código ou na configuração do framework.
### 3. Recomendação: O Veredito
Minha recomendação para a StreamFlow é: Adotar Parcialmente (Fase de Transição).
Justificativa: Migrar tudo agora seria adicionar mais uma camada de complexidade em um momento de crise. No entanto, o Moleculer é ideal para resolver o nosso problema de Observabilidade e Resiliência. Sugiro iniciarmos a migração pelo Gateway e pelo Streaming Service, que são os pontos de maior dor, mantendo os serviços menores em Fastify até que a equipe domine a ferramenta. Isso nos daria o tracing que o Rafael e a Camila levaram embora, sem exigir um rewrite total imediato.
### 4. Prova de Conceito (PoC): Streaming Service em Moleculer
Abaixo, um exemplo de como o seu fluxo de play (o mais problemático) ficaria simplificado e protegido com Moleculer:
// services/streaming.service.js
module.exports = {
    name: "streaming",
    actions: {
        async play(ctx) {
            const { movieId, userId } = ctx.params;

            // 1. Verificação de Licença (Síncrona, mas com Circuit Breaker nativo)
            const license = await ctx.call("catalog.getLicense", { movieId });
            if (!license.active) throw new Error("Sem licença!");

            // 2. Registro de Recomendação (ASSÍNCRONO - resolvendo o antipattern)
            // O emit não bloqueia a resposta para o usuário
            ctx.emit("recommendation.viewed", { userId, movieId });

            // 3. Notificação (ASSÍNCRONO com Retry automático se falhar)
            ctx.emit("notification.send", {
                userId,
                message: `Iniciando: ${license.title}`
            });

            return { status: "playing", movie: license.title };
        }
    }
};

Por que isso é melhor?
Código Limpo: Sumiram as URLs de fetch e os blocos try/catch repetitivos.
Performance: O uso de ctx.emit (eventos) garante que o usuário receba o "Play" instantaneamente, enquanto as tarefas secundárias rodam em background.
Segurança: Se o serviço de catálogo estiver fora, o Moleculer nem tenta a chamada (Circuit Breaker), respondendo imediatamente com um erro tratado.



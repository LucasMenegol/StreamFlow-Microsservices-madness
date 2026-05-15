# Report de Análise Arquitetural — StreamFlow
Para: Marcos Oliveira (VP de Produto)

De: Lucas da Silva Menegol

Assunto: Plano de Estabilização e Eficiência Operacional

### Seção 1 — Custo Operacional Oculto
Diagnóstico: O Marcos tem razão. Atualmente, mantemos 7 microsserviços para uma equipe de apenas 15 pessoas.

A Causa: Cada serviço possui seu próprio Dockerfile, banco de dados (SQLite), stack de rede e logs independentes.

O Overhead: Estimamos que a equipe gaste 60% do tempo mantendo a "cola" entre os serviços (infraestrutura) e apenas 40% em features.

Proposta: Consolidação. O Analytics-Service e o Billing-Service já compartilham o mesmo banco de dados (Antipattern detectado!). Eles devem ser fundidos em um único serviço de "Finanças", reduzindo custos de container e complexidade de rede.

### Seção 2 — Latência de Rede (O "Gargalo do Play")
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



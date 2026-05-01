# RaLab5 — Plataforma de Gestão Laboratorial NGE
> Versão maio 2026

---

## O problema que resolve

Laboratórios geotécnicos trabalham com um volume enorme de dados dispersos:
folhas Excel de ensaio de campo, relatórios Word, amostras físicas, pedidos de clientes,
planos de implantação, controlo de qualidade, calibrações de equipamento.

Sem uma plataforma central, a informação perde-se entre ficheiros, o rastreio de
amostras é manual, os relatórios demoram horas a compilar e os erros de referência
são frequentes.

**RaLab5 resolve isso** — num único sistema web, acessível em rede local ou remotamente.

---

## O que é o RaLab5

**RaLab5** é o sistema de informação de laboratório (LIMS) da NGE,
desenvolvido à medida para laboratórios geotécnicos.

Cobre os 4 laboratórios do grupo:
| Código | Laboratório | Região |
|---|---|---|
| SP | Saint-Priest | Rhône-Alpes |
| PDC | Pont-du-Château | Auvergne |
| CHB | Chambéry | Rhône-Alpes |
| CLM | Clermont-Ferrand | Auvergne |

---

## O que o sistema faz

### Do pedido ao relatório — tudo ligado

```
Cliente / Obra
  └── Affaire (obra/projeto)          ex: 2026-RA-042
        └── Demanda RST (pedido)      ex: 2026-SP-D042
              └── Preparação técnica
              └── Intervenção terreno  ex: 2026-SP-I001
                    └── Ensaios terreno (DE, CFE, PMT, SC…)
                    └── Pontos de medição + nivelamento
                    └── Plano de implantação interativo
              └── Amostras labo        ex: 2026-SP-E001
                    └── Ensaios laboratoriais
                    └── Etiquetas
              └── Controlo de qualidade
              └── Relatório / PV
```

Todo o percurso é rastreável: sabe-se sempre de que obra vem cada amostra,
quem fez o ensaio, quando, com que equipamento e com que resultado.

---

## Funcionalidades principais

### Gestão de obras e demandas
- Registo de obras com referência automática
- Pedidos RST com módulos técnicos configuráveis por demanda
- Passação de estaleiro com visibilidade completa do histórico

### Ensaios de campo (terreno)
- Suporte a todos os tipos: **DE** (densité enrobés), **CFE**, **PMT**, **PLD**, **SC** (sondagens), **SO**, **SP**
- **Import direto de Excel** — folhas DE e SC importadas automaticamente, sem reintrodução de dados
- Plano de implantação com **canvas interativo** — arrastar pontos de ensaio sobre a planta da obra
- Nivelamentos com rastreio de cotas

### Laboratório
- Rastreio completo de amostras (prélèvements) desde a recolha até ao resultado
- Ensaios laboratoriais com histórico por amostra
- Impressão de etiquetas de amostras
- Workbench de ensaios por intervenção

### Qualidade
- Gestão de não conformidades (NC)
- Controlo de metrologia e calibração de equipamento
- DST (Dossier Suivi Terrain) com comparação de resultados
- PMT rapport gerado automaticamente

### Planeamento e dashboards
- Planeamento de demandas
- Dashboards diferenciados por perfil (responsável labo, técnico)
- Visibilidade em tempo real do estado de cada demanda

### Acesso e segurança
- Autenticação JWT com roles por utilizador
- Acesso remoto seguro via Cloudflare Tunnel ou Tailscale
- Logs de auditoria de todas as operações

---

## Arquitectura técnica

| Componente | Tecnologia | Porquê |
|---|---|---|
| Backend API | FastAPI + Python | Rápido, documentado automaticamente |
| Base de dados | SQLite | Simples, sem servidor, portátil |
| Frontend | React 18 + Vite | Interface moderna e reactiva |
| Estado/Cache | TanStack Query | Dados sempre frescos, sem recarregamentos |
| UI | Tailwind CSS | Design consistente e adaptável |
| Auth | JWT | Seguro, stateless, fácil de integrar |

O backend é **estável desde RaLab4** — RaLab5 é a migração do frontend para React,
sem tocar nas APIs existentes.

---

## Vantagens práticas

- **Sem instalação no cliente** — corre no browser, qualquer computador da rede
- **Import Excel** — elimina a reintrodução manual de dados de campo
- **Referências automáticas** — nunca há dois registos com a mesma referência
- **Rastreio total** — cada resultado está ligado à obra, demanda, intervenção e técnico
- **Acesso remoto** — técnicos em obra podem consultar e registar em tempo real
- **Escalável** — novos tipos de ensaio adicionados sem refazer o sistema

---

## Estado actual (maio 2026)

| Módulo | Estado |
|---|---|
| Affaires / Demandes | Operacional |
| Intervenções terreno | Operacional |
| Folhas terreno (DE, CFE, PMT, SC…) | Operacional |
| Import Excel DE | Operacional |
| Import Excel SC (sondagens) | Operacional |
| Ensaios laboratoriais | Operacional |
| Amostras / Prélèvements | Operacional |
| Plano de implantação canvas | Operacional |
| Qualidade / DST | Operacional |
| PMT rapport | Operacional |
| Dashboards | Operacional |
| Planeamento | Operacional |
| Acesso remoto Cloudflare/Tailscale | Operacional |
| Auth JWT com roles | Operacional |

---

## Como arrancar

```bash
# Backend (porta 8000)
cd backend/current_fastapi
uvicorn api_main:app --reload --port 8000

# Frontend dev (porta 5173)
cd frontend/react
npm run dev
```

Ou usar os launchers na raiz:
- `launch_ralab5_server.cmd` — servidor local
- `launch_ralab5_cloudflare.cmd` — com túnel Cloudflare para acesso externo
- `launch_ralab5_tailscale.cmd` — com Tailscale para acesso remoto seguro

# Handoff — Import SC « como saisie manual » (2026-06-11)

## Princípio acordado

**Importação ≠ outro tipo de objecto.**

Um ficheiro Excel SC legacy pode chegar já com foto/tramo, « Coupe 1 » e couches — porque o Excel traz esses dados. Mas o sistema deve **materializá-los como se o operador os tivesse introduzido manualmente** na feuille SC (`ModeleSCPage` / `scStratigraphicWorksheet`).

Regra:

> **Só preencher o que pode ser feito à mão na interface**, nos **mesmos sítios** e com as **mesmas regras** que a saisie manual.

A diferença entre manual e import é a **origem dos dados** (operador vs Excel), **não** o modelo nem um pipeline paralelo.

---

## Saisie manual — referência (o que import deve reproduzir)

### Onde se cria / edita

| Passo | Acção do operador | Onde grava |
|-------|-------------------|------------|
| 1 | Intervenção → plano SC → « Créer la fiche » | feuille terrain (BD) |
| 2 | « Créer un sondage » | rascunho local, depois `POST /api/feuilles-terrain/{uid}/points` |
| 3 | Preencher metadados do sondage | colunas `points_terrain` + `payload_json` |
| 4 | Coupe(s) + foto/tramo | `payload_json.carotte_coupes[]` |
| 5 | Couches dentro da coupe activa | `payload_json.carotte_coupes[].couches[]` |
| 6 | **Enregistrer** | `PUT /api/feuilles-terrain/{uid}/points/{point_uid}` |

### Ficheiros de referência

- Frontend payload: `frontend/react/src/pages/modeles/scStratigraphicWorksheet.jsx`
  - `scToPointPayload()` — forma canónica do ponto SC
  - `scToCouchePayload()` / `scNormalizeCoupeLayer()` — forma canónica das couches na coupe
- Backend manual: `backend/current_fastapi/api/feuilles_terrain.py`
  - `create_point_terrain` / `update_point_terrain` — grava `carotte_coupes` em `payload_json`
- UI: `frontend/react/src/pages/modeles/ModeleSCPage.jsx`

### Campos que a UI manual permite (sondage SC)

Metadados do ponto (exemplos): `point_code`, `localisation`, `date_point`, `operateur`, `sondeur`, `procede`, `diametre`, `type_ouvrage`, `partie_ouvrage`, `profondeur_finale_m`, `arret_sondage`, `notes`, …

Por coupe (`carotte_coupes[]`): `id`, `title`, `photo_stored_name`, `photo_url`, `depth_start_m`, `depth_end_m`, `total_height_m`, `notes`, `couches[]`.

Por couche (dentro da coupe): campos estratigráficos completos (`z_haut`, `z_bas`, `texture_matrice`, `description_libre`, …) — ver `scToCouchePayload`.

**Nota:** na feuille SC com `carotte_coupes.length > 0`, as couches **não** passam pelo path API `createCouche` / tabela `sondage_couches`; vivem no `payload_json` da coupe.

---

## Import actual — o que diverge do manual

Ficheiro: `backend/current_fastapi/api/import_essais_sc.py`  
UI: `frontend/react/src/pages/ToolsPage.jsx` (`/api/import-sc/preview`, `/api/import-sc/materialize`)

### Divergências principais

| Aspecto | Manual (UI) | Import actual |
|---------|-------------|---------------|
| Escrita do ponto | `feuilles_terrain` create/update | `INSERT` directo em `points_terrain` |
| Formato `payload_json` | Plano, alinhado com `scToPointPayload` | `build_sc_point_payload()` → schema `SC_POINT_V1` + `legacy_flat` |
| Couches | Só em `carotte_coupes[].couches[]` (path SC) | **Duplicado:** em `carotte_coupes` **e** em `sondage_couches` |
| Formato couche | Campos estratigráficos UI | Excel legacy: `{ description, d, vide, compacite }` |
| Metadados extra | Não definidos pelo operador | `source_payload`, `wbs_full`, `wbs_short`, `source=SC_IMPORT`, `status=imported` |
| Foto | Associada à coupe na UI | Extraída do XLSX; paths/URLs próprios do importador |
| Hierarquia D/C/I | Já existe (feuille criada na intervenção) | Criada/reutilizada pelo importador (OK para Tools, mas ponto deve igualar manual) |

### Consequências visíveis

1. Ponto importado aberto em `ModeleSCPage` pode mostrar couches **duplicadas ou inconsistentes** (`point.couches` via `sondage_couches` vs `carotte_coupes[].couches`).
2. Couches importadas não têm a mesma forma que `scNormalizeCoupeLayer` — edição manual posterior pode comportar-se mal.
3. Campos que o operador **não pode** preencher na UI ficam no payload importado (`source_payload`, WBS internos, etc.).

---

## Estado alvo

Após refactor, um ponto SC importado deve ser **indistinguível** de um ponto preenchido manualmente e gravado com **Enregistrer**, excepto metadados de auditoria **opcionais** e **não editáveis** na UI (ver secção « Auditoria »).

```
Excel SC  →  mapper import  →  mesmo payload que scToPointPayload  →  feuilles_terrain API (ou função partilhada)
```

---

## Plano de implementação

### Fase 0 — Congelar contrato manual (pré-requisito)

- [ ] Documentar em código (docstring ou teste) o contrato de `scToPointPayload` + `scNormalizeCoupeLayer` como **fonte de verdade**.
- [ ] Listar campos Excel → campos UI (tabela de mapping abaixo).
- [ ] Decidir política `sondage_couches` para feuille SC: **não escrever** na importação SC (alinhado com path manual actual).

### Fase 1 — Função partilhada de persistência SC

Criar serviço backend (ex.: `app/services/sc_point_persist_service.py`) que:

1. Aceita payload **já normalizado** (forma `PointTerrainPayload` / equivalente a `scToPointPayload`).
2. Grava via a **mesma lógica** que `create_point_terrain` / `update_point_terrain` (extrair corpo comum de `feuilles_terrain.py` para evitar duplicação).
3. **Não** faz `INSERT` directo com schema `SC_POINT_V1` unless merged into flat manual shape.

Importador chama este serviço em vez de SQL ad hoc.

### Fase 2 — Mapper Excel → payload manual

Em `import_essais_sc.py` (ou módulo dedicado `sc_import_mapper.py`):

1. `_extract_sc_payload` — manter leitura Excel.
2. Novo `_map_sc_import_to_manual_point_payload(extracted, photo_meta) -> dict`:
   - Metadados do ponto: só campos mapeáveis para inputs da UI.
   - Uma coupe « Coupe 1 » se o Excel tiver uma foto/tramo + stratigraphie (caso habitual).
   - `couches[]` dentro da coupe: converter cada linha Excel para forma `scNormalizeCoupeLayer` (uid gerado, `z_haut`/`z_bas` se inferíveis, `description_libre` ← description Excel, lab `d`/`vide`/`compacite` só se existirem campos UI equivalentes).
   - Foto: `photo_stored_name` / `photo_url` nos mesmos campos que a UI usa na coupe.

3. **Não** popular `source_payload` dentro do payload editável (mover para tabela/coluna de auditoria se necessário).

### Fase 3 — Remover dual-write `sondage_couches` no import SC

- [ ] Remover bloco « 5. Create couches from payload » (`INSERT INTO sondage_couches`) em `_materialize_sc_sheet` e `_materialize_sc_payloads`.
- [ ] Script de migração **opcional** para pontos SC já importados: copiar `sondage_couches` → `carotte_coupes[].couches` normalizadas, depois apagar linhas `sondage_couches` órfãs (só se houver dados em produção).

### Fase 4 — Foto alinhada com UI

- [ ] Garantir que foto extraída do XLSX fica referenciada como na coupe manual (`photo_stored_name`, `photo_url` usados por `ScPointDetailView`).
- [ ] Evitar URLs/caminhos que a UI manual não consegue reproduzir.
- [ ] Referência: `docs/HANDOFF_CHAT_PHOTOS_SC_20260424.md`.

### Fase 5 — Auditoria import (sem quebrar princípio)

Campos que **não** existem na saisie manual mas são úteis para rastreio:

| Campo | Onde guardar | Visível na UI? |
|-------|--------------|----------------|
| `source = SC_IMPORT` | coluna ou `payload.audit.source` read-only | Não editável |
| `imported_at` | audit | Não editável |
| hash ficheiro Excel | audit / essai | Não editável |
| `source_payload` raw Excel | tabela essai ou JSON audit separado | **Não** no formulário do sondage |

**Não** misturar auditoria com campos que o operador edita.

### Fase 6 — Testes

- [ ] Teste unitário: mapper Excel sample → payload igual a fixture `scToPointPayload` manual equivalente.
- [ ] Teste integração: materialize → `GET feuille-terrain` → abrir em `ModeleSCPage` sem normalização extra.
- [ ] Regressão foto (logo vs carotte): ver checklist em `HANDOFF_CHAT_PHOTOS_SC_20260424.md`.
- [ ] Comparar ponto importado vs ponto manual gravado: mesmo shape JSON em `payload_json`.

### Fase 7 — UI Tools (opcional, cosmético)

- [ ] Mensagem pós-import: « Données insérées comme saisie manuelle (feuille SC) ».
- [ ] Link directo para `/modeles/sc?source_uid=…&point=…`.

---

## Mapping Excel → manual (rascunho)

A completar na Fase 0 com amostras reais de XLSX.

| Excel / meta import | Campo manual | Notas |
|---------------------|--------------|-------|
| `meta.partie_ouvrage` | `localisation` / `partie_ouvrage` | import actual já copia parcialmente |
| `meta.date_sondage` | `date_point` | |
| `meta.procede`, `diametre`, `type_ouvrage`, `arret_sondage` | homónimos | |
| `meta.arret_sondage` | `profondeur_finale_m` | converter profundidade |
| Foto XLSX | `carotte_coupes[0].photo_*` | uma coupe por folha Excel (v1) |
| Coluna description | `couches[].description_libre` | |
| d / vide / compacite | campos lab se existirem na UI | confirmar destino; senão ignorar ou notas |
| — | `venue_eau`, `niveau_nappe` | **não** preencher em SC carotté (herança SO desactivada) |

---

## O que **não** fazer

- Não manter dois modelos paralelos (SC_POINT_V1 import vs payload plano manual).
- Não escrever `sondage_couches` **e** `carotte_coupes` para o mesmo SC.
- Não injectar « Coupe 1 » no **rascunho UI** como substituto de import — isso é outro assunto (contentor vazio para saisie); import grava coupe **com dados**.
- Não preencher campos que a UI manual não expõe (excepto audit read-only separado).

---

## Critérios de aceite

1. Import materialize → abrir sondage em `ModeleSCPage` → mesma experiência que se o operador tivesse preenchido e gravado.
2. `payload_json` do ponto importado passa validação/schema do payload manual.
3. Zero linhas novas em `sondage_couches` para novos imports SC.
4. Editar e re-gravar ponto importado não perde dados nem muda shape.
5. Foto visível na coupe como na saisie manual.

---

## Ordem de trabalho recomendada

1. Fase 0 + testes de contrato manual  
2. Fase 1 (serviço partilhado)  
3. Fase 2 + 3 (mapper + remover dual-write)  
4. Fase 4 (foto)  
5. Fase 5–7  

Estimativa: refactor médio (backend principalmente); frontend mínimo se payload já bater certo.

---

## Relacionado

- `docs/GLOBAL_IMPORTER_ARCHITECTURE.md` — orquestração D/C/I partilhada (mantém-se)
- `docs/HANDOFF_CHAT_PHOTOS_SC_20260424.md` — extracção foto Excel
- `backend/current_fastapi/api/sc_point_schema.py` — avaliar deprecar `legacy_flat` após alinhamento

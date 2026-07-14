# 🌿 Verde+ — Gerenciador de Horta

Aplicação web single-page para gerenciar uma horta pessoal: acompanhe rega, adubação, poda, crescimento das plantas, lembretes avulsos e os gastos do seu cultivo — tudo em um único painel.

## Índice

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Como usar](#como-usar)
- [Tecnologias](#tecnologias)
- [Armazenamento de dados](#armazenamento-de-dados)
- [Modelo de dados](#modelo-de-dados)

## Visão geral

Verde+ é um app 100% client-side (não depende de backend/servidor) construído com HTML, CSS e JavaScript puro. Os dados ficam salvos via `window.storage`, uma API de armazenamento persistente por chave/valor.

A aplicação é dividida em seis áreas, acessíveis pela barra de navegação:

| Aba | Descrição |
|---|---|
| **Painel** | Visão geral com alertas de rega, adubação e poda, e lista das plantas cadastradas |
| **Minhas plantas** | Lista completa com filtros por categoria, local, favoritas e busca |
| **Calendário** | Visualização mensal com os cuidados já feitos e os próximos previstos |
| **Estatísticas** | Métricas gerais da horta e ranking das plantas mais produtivas |
| **Lembretes** | Tarefas avulsas que não seguem uma frequência fixa (ex: troca de vaso) |
| **Financeiro** | Controle de gastos gerais e por planta |

## Funcionalidades

### 🪴 Cadastro de plantas
- Espécie, apelido, categoria, local, ambiente (interno/externo) e necessidade de luz
- Frequência de rega, adubação e poda (com sugestões automáticas por categoria)
- Data de plantio e observações livres
- Marcar como favorita, editar, remover (arquivar) ou restaurar

### 💧 Cuidados rápidos
- Botões de ação rápida (regar, adubar, podar, colher) em cada card de planta
- Indicador visual em anel mostrando o quanto falta para a próxima rega
- Botão de ação flutuante (⚡) com busca rápida para registrar cuidados sem abrir a planta

### 📸 Acompanhamento de evolução
- Upload de fotos (redimensionadas e comprimidas no navegador) formando uma linha do tempo
- Registro de altura, quantidade de frutos/flores e pragas observadas
- Gráfico de evolução de altura ao longo do tempo

### 🗓️ Calendário
- Mostra cuidados já registrados e datas previstas para os próximos, coloridos por tipo
- Navegação entre meses

### 📊 Estatísticas
- Total de plantas, plantas saudáveis, plantas precisando de rega
- Planta mais produtiva e planta que mais exige cuidados
- Média de dias entre regas e ranking de produtividade
- Exportação de relatório em PDF (via impressão do navegador)

### ⏰ Lembretes
- Tarefas com título, data, tipo e planta relacionada (opcional)
- Marcar como concluído ou excluir

### 💰 Financeiro
- Registro de gastos (muda, substrato, adubo, fertilizante, vaso, defensivo etc.)
- Total investido, custo por planta e histórico completo de lançamentos

## Estrutura de arquivos

```
├── index.html   # Estrutura HTML da aplicação
├── style.css    # Estilos (design tokens, layout, componentes)
└── script.js    # Lógica da aplicação (estado, renderização, ações)
```

Os três arquivos precisam estar na mesma pasta — `index.html` referencia os outros dois via:

```html
<link rel="stylesheet" href="style.css">
<script src="script.js"></script>
```

## Como usar

1. Baixe os três arquivos (`index.html`, `style.css`, `script.js`) para a mesma pasta.
2. Abra `index.html` em um navegador.
3. Clique em **+ Nova planta** para cadastrar sua primeira planta e comece a usar o painel.

> Não é necessário instalar nada nem rodar servidor — é um app estático.

## Tecnologias

- **HTML5 / CSS3** — estrutura e estilo, com variáveis CSS para o tema visual
- **JavaScript (Vanilla)** — toda a lógica de estado e renderização, sem frameworks
- **Google Fonts** — Fraunces (títulos), Inter (texto) e JetBrains Mono
- **`window.storage`** — API de persistência de dados usada no lugar de um backend

## Armazenamento de dados

Todos os dados são persistidos por meio de chaves individuais:

| Chave | Conteúdo |
|---|---|
| `verde-plants` | Lista de plantas cadastradas |
| `verde-carelog` | Histórico de cuidados (rega, adubação, poda, colheita) |
| `verde-growthlog` | Registros de crescimento (altura, frutos, flores, pragas) |
| `verde-photo-index` | Índice das fotos vinculadas às plantas |
| `verde-reminders` | Lembretes avulsos |
| `verde-expenses` | Gastos registrados |
| `photo-data:<id>` | Dado (base64) de cada foto individual |

## Modelo de dados

**Planta**
```js
{
  id, species, nickname, category, location,
  environment, light, plantDate, notes,
  waterFreq, fertFreq, pruneFreq,
  favorite, archived, createdAt
}
```

**Registro de cuidado**
```js
{ id, plantId, type, date } // type: water | fertilize | prune | harvest
```

**Registro de crescimento**
```js
{ id, plantId, date, height, fruits, flowers, pests, notes }
```

**Lembrete**
```js
{ id, title, date, type, plantId, done }
```

**Gasto**
```js
{ id, description, amount, date, category, plantId }
```

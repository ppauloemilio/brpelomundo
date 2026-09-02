# Comunidade Brasil V2

Rede social para brasileiros no exterior — **zero configuração**.

## Como rodar

```bash
npm install
npm run dev
```

Abra **http://localhost:5173**

## Login demo

- **Email:** `ana@demo.com`
- **Senha:** `demo123`

## O que está incluído

- Feed com **geofiltro** (posts filtrados pela data de entrada no país)
- Posts, likes, comentários, compartilhamentos
- Perfis, seguir, amizades
- Negócios com mapa (Leaflet)
- Mensagens com tempo real (Socket.io)
- Notificações
- PT-BR + English
- SQLite local (criado automaticamente em `server/data/`)

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React + Vite + Tailwind + shadcn-style UI |
| Backend | Express + SQLite |
| Mapa | Leaflet + OpenStreetMap |

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia API (porta 3001) + frontend (porta 5173) |
| `npm run build` | Build de produção do frontend |
| `npm run start` | Inicia apenas a API |

## Estrutura

```
├── client/          # Frontend React
├── server/          # API Express + SQLite
│   └── data/        # Banco (auto-criado)
└── uploads/         # Arquivos enviados (auto-criado)
```

Não precisa de conta em serviços externos, API keys ou arquivo `.env`.

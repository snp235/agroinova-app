# AgroInova — Backend

API REST completa para a plataforma AgroInova.  
Construída com **Node.js + Express + TypeScript + Prisma + SQLite**.

---

## Pré-requisitos

- Node.js 18+ instalado
- npm

---

## Como rodar (primeira vez)

```bash
# 1. Entrar na pasta
cd agroinova-backend

# 2. Instalar dependências
npm install

# 3. Gerar o client Prisma
npx prisma generate

# 4. Criar o banco de dados e aplicar as tabelas
npx prisma migrate dev --name init

# 5. Popular o banco com dados de exemplo
npx ts-node prisma/seed.ts

# 6. Iniciar o servidor em modo desenvolvimento
npm run dev
```

O servidor estará disponível em: **http://localhost:3001**

---

## Como rodar (depois da primeira vez)

```bash
npm run dev
```

---

## Usuários de teste

| Tipo             | Email                | Senha  |
|------------------|----------------------|--------|
| Admin/Professor  | camila@escola.com    | 123456 |
| Admin/Professor  | iara@escola.com      | 123456 |
| Aluno            | maria@aluno.com      | 123456 |
| Aluno            | joao@aluno.com       | 123456 |
| Aluno            | ana@escola.com       | 123456 |

---

## Rotas disponíveis

### Auth
| Método | Rota            | Descrição                    | Auth? |
|--------|-----------------|------------------------------|-------|
| POST   | /api/auth/register | Criar conta                | Não   |
| POST   | /api/auth/login    | Fazer login                | Não   |
| GET    | /api/auth/me       | Dados do usuário logado    | Sim   |
| PUT    | /api/auth/me       | Atualizar perfil           | Sim   |

### Posts
| Método | Rota                | Descrição               | Auth?  |
|--------|---------------------|-------------------------|--------|
| GET    | /api/posts          | Listar posts            | Não    |
| GET    | /api/posts/saved    | Posts salvos            | Sim    |
| GET    | /api/posts/:id      | Ver post                | Não    |
| POST   | /api/posts          | Criar post              | Sim    |
| POST   | /api/posts/:id/like | Curtir/descurtir        | Sim    |
| POST   | /api/posts/:id/save | Salvar/remover salvo    | Sim    |
| DELETE | /api/posts/:id      | Remover post            | Sim    |

### Hortas
| Método | Rota                        | Descrição            | Auth?  |
|--------|-----------------------------|----------------------|--------|
| GET    | /api/gardens                | Listar hortas        | Não    |
| GET    | /api/gardens/:id            | Ver horta            | Não    |
| POST   | /api/gardens                | Criar horta          | Admin  |
| PUT    | /api/gardens/:id            | Editar horta         | Admin  |
| POST   | /api/gardens/:id/canteiros  | Adicionar canteiro   | Admin  |
| POST   | /api/gardens/:id/participants | Adicionar membro   | Admin  |

### Eventos
| Método | Rota                          | Descrição             | Auth?  |
|--------|-------------------------------|-----------------------|--------|
| GET    | /api/events                   | Listar eventos        | Não    |
| GET    | /api/events/:id               | Ver evento            | Não    |
| POST   | /api/events                   | Criar evento          | Admin  |
| PUT    | /api/events/:id               | Editar evento         | Admin  |
| POST   | /api/events/:id/interest      | Marcar interesse      | Sim    |
| GET    | /api/events/suggestions/list  | Ver sugestões         | Não    |
| POST   | /api/events/suggestions       | Sugerir evento        | Sim    |
| PUT    | /api/events/suggestions/:id   | Aprovar/Rejeitar      | Admin  |

### Gamificação
| Método | Rota                          | Descrição             | Auth?  |
|--------|-------------------------------|-----------------------|--------|
| GET    | /api/gamification/me          | Meu progresso        | Sim    |
| GET    | /api/gamification/ranking     | Ranking geral        | Não    |
| POST   | /api/gamification/food-answers | Enviar questionário  | Sim    |

### Admin
| Método | Rota                    | Descrição                 | Auth?  |
|--------|-------------------------|---------------------------|--------|
| GET    | /api/admin/stats        | Estatísticas gerais       | Admin  |
| GET    | /api/admin/users        | Listar usuários           | Admin  |
| GET    | /api/admin/users/:id    | Ver usuário               | Admin  |
| PUT    | /api/admin/users/:id    | Editar usuário            | Admin  |
| GET    | /api/admin/curadoria    | Coletas pendentes         | Admin  |
| PUT    | /api/admin/curadoria/:id | Identificar coleta       | Admin  |
| GET    | /api/admin/activity     | Log de atividades         | Admin  |
| GET    | /api/admin/school-summaries | Resumo por escola     | Admin  |

---

## Variáveis de ambiente (.env)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="troque-por-uma-chave-secreta-forte-em-producao"
PORT=3001
UPLOADS_DIR="./uploads"
```

---

## Imagens enviadas (uploads)

As imagens ficam salvas na pasta `uploads/` e são servidas via:
```
http://localhost:3001/uploads/nome-do-arquivo.jpg
```

---

## Migrar para PostgreSQL (produção)

1. No arquivo `prisma/schema.prisma`, troque:
```prisma
provider = "sqlite"  →  provider = "postgresql"
```

2. No `.env`, atualize:
```env
DATABASE_URL="postgresql://usuario:senha@host:5432/agroinova"
```

3. Execute:
```bash
npx prisma migrate deploy
```

# Webhooks: dados necessários e integração via API OctaDesk

Este documento responde a duas perguntas: **(1)** como obter as informações via API da OctaDesk, se for necessário; **(2)** quais dados precisamos receber em cada webhook.

---

## 1. Como obter as informações via API da OctaDesk

Hoje o fluxo é **o OctaDesk (ou outro sistema) chama os nossos webhooks** quando acontecem os eventos (conversa criada, SQL, venda). Se o OctaDesk **não** tiver webhooks/automações nativas para isso, dá para usar a **API da OctaDesk** e um job no nosso lado que “puxa” os dados e envia para os nossos endpoints.

### Autenticação na API OctaDesk

- Documentação: [OctaDesk – Authentication](https://developers.octadesk.com/reference/authentication).
- Resumo: obter um **token de acesso** (OAuth ou API key, conforme a doc) e enviar em todas as requisições (geralmente header `Authorization` ou parâmetro indicado pela OctaDesk).

### Endpoints úteis

- **Tickets:** [Tickets](https://developers.octadesk.com/reference/tickets) – listar/criar tickets.
- **Chat:** [Chat](https://developers.octadesk.com/reference/chat) – listar conversas, buscar por data, canal, contato, etc.
  - `GET /chat` – lista de chats (com filtros).
  - `GET /chat/{id}` – detalhes de um chat (incluindo o objeto que tem `customFields` e o bloco do integrador WhatsApp com o referral CTWA).
  - `GET /chat/{id}/messages` – mensagens do chat.

O objeto de ticket/chat retornado pela API é o **mesmo formato** que o backend espera no webhook **conversation-started**: `id`, `contact`, `createdAt`, `customFields` com o campo de integração (ex.: `id: "octabsp"`) e, dentro dele, `referral` (com `source_id`, `ctwa_clid`, etc.). O código em `lib/octadesk.ts` já faz o parse desse formato.

### Duas formas de usar a API OctaDesk

**A) Webhooks (recomendado)**  
Configurar no OctaDesk uma automação “ao criar ticket” ou “ao receber primeira mensagem” que faz um **POST** para a nossa URL **`/api/webhooks/lead`** com o **payload completo do ticket/chat** (o mesmo que a API do OctaDesk retorna). Assim não precisamos “puxar” nada; só recebemos.

**B) Job que consulta a API (polling)**  
Se não houver webhook nativo no OctaDesk:

1. Obter token da API OctaDesk (e guardar em variável de ambiente, ex.: `OCTADESK_ACCESS_TOKEN`).
2. De tempos em tempos (ex.: a cada 5–15 min), chamar a API OctaDesk:
   - Ex.: `GET /chat` (ou equivalente para tickets) com filtro de **data de criação** (ex.: últimos 30 min).
3. Para cada chat/ticket retornado:
   - Chamar `parseOctaDeskItem` (ou o equivalente em nosso backend) no objeto retornado.
   - Se tiver `referral.source_id` e `referral.ctwa_clid` (CTWA), fazer **POST** para `https://<nosso-backend>/api/webhooks/lead` com:
     - Header: `x-webhook-secret: <WEBHOOK_SECRET>` (ou `Authorization: Bearer <WEBHOOK_SECRET>`).
     - Body: o **mesmo objeto** de ticket/chat que a API OctaDesk retornou (um objeto ou array com um objeto).
4. Para **SQL** e **venda**, o OctaDesk precisaria expor algum evento ou campo (ex.: “status = oportunidade” ou “venda ganha”). Se a API permitir filtrar por isso, o mesmo job pode:
   - Para cada ticket que virou SQL: POST em **`/api/webhooks/sql`** com `{ "conversation_id": "<id do ticket>" }`.
   - Para cada ticket com venda fechada: POST em **`/api/webhooks/sale`** com `{ "conversation_id": "<id do ticket>" }` (ou `phone` se for o caso).

Ou seja: **via API OctaDesk** nós **obtemos** os dados (tickets/chats no formato deles) e **enviamos** para os nossos próprios webhooks; o formato do body é o mesmo que está na seção 2 abaixo.

---

## 2. Dados que precisamos receber em cada webhook

Todos os webhooks exigem **autenticação**:

- Header: `x-webhook-secret: <WEBHOOK_SECRET>` **ou** `Authorization: Bearer <WEBHOOK_SECRET>`  
- `Content-Type: application/json`

---

### POST /api/webhooks/lead (conversa iniciada por CTWA)

**URL recomendada:** `/api/webhooks/lead`. (A antiga `/api/webhooks/conversation-started` continua funcionando.)

**Quando:** nova conversa/ticket criado a partir de um anúncio CTWA (primeira mensagem com dados de referral).

**Body:** o **payload no formato OctaDesk** (um objeto ou array com um objeto), igual ao retornado pela API de tickets/chat da OctaDesk.

**Campos obrigatórios (todos devem estar presentes):**

| Dado (nome amigável) | Origem no payload |
|----------------------|-------------------|
| Telefone do lead | `integrator.from.number` (ou equivalente) |
| Id do anúncio | `referral.source_id` |
| Ctwa_clid | `referral.ctwa_clid` |
| Headline do anúncio | `referral.headline` |
| URL de origem | `referral.source_url` |

**Outros campos usados:** `id` (conversation_id), `contact`, `createdAt`, `referral.body`, `referral.image_url`. Se faltar qualquer obrigatório, o backend retorna 400.

---

### POST /api/webhooks/sql (lead virou SQL)

**Quando:** o lead foi qualificado e virou oportunidade (SQL).

**Body (JSON):**

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `conversation_id` | Sim | Mesmo `id` do ticket usado em conversation-started. |
| `opp_id` | Não | ID da oportunidade no CRM/sistema de vendas (mantido para compatibilidade). |

Exemplo:  
`{ "conversation_id": "id-do-ticket-no-OctaDesk", "opp_id": "id-da-oportunidade-no-CRM" }`

(A antiga `/api/webhooks/opp` continua funcionando.)

---

### POST /api/webhooks/sale (venda fechada)

**Quando:** venda fechada/ganha.

**Body (JSON)** – **uma** das opções:

| Opção | Campos | Descrição |
|-------|--------|-----------|
| Por conversa | `conversation_id` (string) | ID do ticket (recomendado se tiver vínculo). |
| Por telefone | `phone` (string) | Ex.: `"5511999999999"`. Atualiza o lead **mais recente** com esse telefone. |

Exemplos:  
`{ "conversation_id": "id-do-ticket" }`  
`{ "phone": "5511999999999" }`

(A antiga `/api/webhooks/ganho` continua funcionando.)

---

## Resumo rápido

| Evento | Endpoint | Dados obrigatórios |
|--------|----------|--------------------|
| Conversa CTWA criada | **`/api/webhooks/lead`** | Payload OctaDesk com telefone do lead, id do anúncio (source_id), ctwa_clid, headline, source_url. |
| Lead → SQL | **`/api/webhooks/sql`** | `conversation_id`. |
| Venda fechada | **`/api/webhooks/sale`** | `conversation_id` **ou** `phone`. |

Para obter dados **via API OctaDesk**: autenticar, listar tickets/chats (ex.: `GET /chat` com filtros), e para cada item com CTWA enviar esse mesmo objeto para `conversation-started`; para SQL e venda, enviar `conversation_id` (e opcionalmente `opp_id` no opp) para `opp` e `ganho`.

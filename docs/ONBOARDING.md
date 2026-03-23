# Onboarding – O que o usuário precisa para começar

Este documento descreve os passos para um novo usuário começar a usar o WhatsApp Tracking (atribuição CTWA + conversões para Meta).

---

## Visão geral

Para a ferramenta funcionar de ponta a ponta, o usuário precisa:

1. **Ter onde rodar o app** (ou acessar uma instância que você disponibilizar).
2. **Ter um banco de dados** (Supabase) com as tabelas criadas.
3. **Configurar credenciais** (Supabase, token dos webhooks e, opcionalmente, Meta).
4. **Conectar a Meta** (token para atribuição e, se quiser, Conversions API).
5. **Conectar o sistema de atendimento** (OctaDesk, Digital Guru, etc.) para enviar eventos ao nosso backend.

Abaixo, o fluxo passo a passo na ótica do usuário.

---

## Passo a passo (checklist do usuário)

### 1. Acesso ao produto

- **Cenário A – Usuário roda o app:** ele clona/baixa o projeto, instala dependências (`pnpm install`) e sobe o servidor (`pnpm dev`). Acessa `http://localhost:3000` (ou a URL que você indicar).
- **Cenário B – Você hospeda:** você entrega uma URL (ex.: `https://whatsapp-tracking.seudominio.com`). O usuário só acessa essa URL; não precisa rodar nada no terminal.

No fim, o usuário precisa de uma **URL base** do produto (ex.: `https://app.seudominio.com`).

---

### 2. Banco de dados (Supabase)

O usuário precisa de um projeto no Supabase com as tabelas do produto:

- Ele cria um projeto em [supabase.com](https://supabase.com) (ou você cria um projeto por cliente).
- No **SQL Editor**, ele executa as migrations na ordem:
  - `supabase/migrations/001_leads_meta_ad_cache.sql` (tabelas `leads` e `meta_ad_cache`)
  - `supabase/migrations/002_leads_contact_phone_required.sql` (obrigatoriedade do telefone)
  - `supabase/migrations/003_app_settings.sql` (tabela `app_settings` para token Meta e configurações)
  - `supabase/migrations/004_status_sql_venda.sql` (status `sql` / `venda`)
  - `supabase/migrations/005_partners_users.sql` (`partners`, `users`, `partner_members`)
  - `supabase/migrations/006_tenant_enforcement.sql` (`partner_id` em dados de negócio + índices)
  - `supabase/migrations/007_global_admin_seed.sql` (RLS por tenant + bypass admin global)
  - `supabase/migrations/008_auth_user_profile.sql` (trigger: novo usuário Auth → `public.users` + vínculo ao parceiro `default` para `@eumedicoresidente.com.br`)

Depois disso, ele anota:

- **URL do projeto** (Project Settings → API → Project URL)
- **Chave anon** e **chave service_role** (Project Settings → API)

**Login Google:** em Authentication → Providers, habilitar Google. Em **Redirect URLs**, incluir `https://<seu-dominio>/auth/callback` (e `http://localhost:3000/auth/callback` em dev).

*(Se você oferecer um “Supabase gerenciado”, esse passo vira só “conta criada para você”; você roda as migrations e entrega URL e chaves.)*

---

### 3. Configuração inicial (credenciais no servidor)

Quem **hospeda** o app (o usuário ou você) precisa definir variáveis de ambiente. O usuário precisa **saber** o que será pedido, mesmo que quem configure seja você:

| Variável | Obrigatória? | Onde o usuário consegue |
|----------|--------------|--------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Supabase → Project Settings → API (login no browser + APIs com JWT do usuário) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Supabase → Project Settings → API |
| `WEBHOOK_SECRET` | Opcional (fallback legado) | Token global de fallback no servidor. Recomendado em produção: token por empresa na tela de Webhooks |
| `META_ACCESS_TOKEN` | Opcional* | Meta for Developers / Business Manager (token com permissões de ads e, se for usar CAPI, WhatsApp events) |
| `OCTADESK_API_TOKEN` | Opcional | OctaDesk (só se for consultar a API do OctaDesk no futuro) |

\* Se não preencher no servidor, o usuário pode configurar o token depois na interface (Configurações).

Resumo: **Supabase (URL + service_role)** é o mínimo para o app funcionar; o token de webhook pode ser configurado por empresa na tela **Configurações > Webhooks**.

---

### 4. Conectar a Meta (pela interface)

O usuário acessa **Configurações** no app e:

1. **Token da Meta**  
   Cola o token de acesso (Marketing API +, se for usar conversões, `whatsapp_business_manage_events`).  
   Esse token é usado para enriquecer leads (campanha, ad set, anúncio) e, se configurado, para enviar eventos à Conversions API.

2. **(Opcional) Conversões para Meta**  
   Se quiser enviar eventos (Lead, SQL, Venda) para a Meta:
   - Preenche **WABA ID** (WhatsApp Business Account ID).
   - Preenche **Dataset ID** (obtido na integração Conversions API for Business Messaging).
   - Define **qual evento nosso** dispara **qual nome de evento** na Meta (dropdowns na tabela).

Sem isso, o funil ainda aparece no dashboard, mas sem nomes de campanha/ad set/anúncio e sem envio de conversões para a Meta.

---

### 5. Conectar o sistema de atendimento (webhooks)

O usuário precisa fazer o sistema onde rodam as conversas (OctaDesk, Digital Guru, etc.) **chamar nosso backend** quando:

- Uma **conversa é iniciada** (primeira mensagem vinda de anúncio CTWA) → `POST /api/webhooks/lead`
- Um lead vira **SQL** → `POST /api/webhooks/sql`
- Uma **venda** é fechada → `POST /api/webhooks/sale`

Ele precisa:

1. **URL base** do produto (ex.: `https://app.seudominio.com`).
2. **Token dos webhooks** (por empresa) para colocar no header `x-webhook-secret` (ou `Authorization: Bearer <valor>`), configurado em **Configurações > Webhooks**.
3. **Identificador da empresa** no header **`x-partner-id`** com o UUID da linha em `public.partners` (agora visível e copiável em **Configurações > Webhooks**).
4. Configurar no OctaDesk/Digital Guru (ou outro) as **três** chamadas HTTP POST com timestamp obrigatório:
   - `lead`: campo `createdAt` (ISO 8601)
   - `sql` e `sale`: campo `occurred_at` (ISO 8601)
5. Em `sql` e `sale`, a chave pode ser `conversation_id` **ou** `phone`.

Enquanto os webhooks não forem chamados, o dashboard ficará vazio.

---

### 6. Validar que está tudo certo

- **Configurações:** token Meta (e, se aplicável, WABA ID, Dataset ID e mapeamento de eventos) salvos.
- **Dashboard:** após algum evento real (ou teste) que dispare os webhooks, o funil deve aparecer em **Dashboard** (métricas, gráfico, tabela).
- **Exportar:** uso de **Exportar TSV** para conferir os dados.

---

## Resumo em uma frase

O usuário precisa: **(1) acessar o app e entrar com Google** (domínio permitido), **(2) ter Supabase com as tabelas e migrations de tenant**, **(3) ter configurado no servidor URL/anon/service_role**, **(4) escolher a empresa no topo** antes de Configurações/Dashboard, **(5) em Configurações conectar a Meta (por empresa)** e **(6) em Configurações > Webhooks** copiar `x-partner-id`, definir token e enviar eventos com timestamp obrigatório.

---

## Melhorias possíveis (pós-MVP)

- **Wizard de primeiro acesso:** tela “Configure em 3 passos” (Supabase → Meta → Webhooks) com links e campos guiados.
- **Checagem de saúde:** indicar “Token Meta configurado”, “Nenhum webhook recebido nos últimos 7 dias”, etc.
- **Auth real:** login e gestão de usuários; cada usuário com sua conta e configurações.
- **Supabase gerenciado:** você cria o projeto e as tabelas e entrega apenas “conta pronta” ao usuário.

Se quiser, na próxima iteração a gente pode desenhar o fluxo de uma **tela de onboarding** (passo a passo na UI) em cima deste checklist.

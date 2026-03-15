# Visão do Produto – WhatsApp Tracking & Attribution

Este documento descreve a visão de produto para atribuição de campanhas que levam tráfego ao WhatsApp, com foco em ser **configurável pelo usuário** e suportar **múltiplas fontes de mídia** no futuro.

---

## 1. Objetivo central

Resolver a **atribuição de campanhas Click to WhatsApp (CTWA) da Meta**: conectar o que acontece no WhatsApp (leads, OPPs, ganhos) às campanhas, ad sets e anúncios de origem.

---

## 2. Meta (Facebook/Instagram) – CTWA

### Estado atual (MVP)

- Atribuição via dados do webhook CTWA recebidos pelo parceiro (ex.: OctaDesk): `source_id` (AD_ID), `ctwa_clid`, etc.
- Enriquecimento via Meta Marketing API (campanha, ad set, anúncio).
- Detalhes no [CONTEXT-CTWA-EMR.md](../CONTEXT-CTWA-EMR.md).

### Direção desejada: 100% configurável pelo usuário

- O usuário consegue **conectar a própria conta da Meta** (e, se aplicável, **pixel**, configurações de conversão, etc.).
- Tudo configurável na interface, sem depender de script/token manual para cada conta.

### App na Meta

- Para integração “oficial” e configurável (OAuth, leitura de campanhas/ads, possivelmente conversões), normalmente é necessário um **App no Meta for Developers**.
- O App permite:
  - Login com Facebook/Instagram (ou Business Manager).
  - Permissões (scopes) para Marketing API, leitura de anúncios, etc.
  - Uso de tokens de longo prazo e renovação.
- **Conclusão**: para “100% configurável” com conexão da conta Meta pelo usuário, um App na Meta tende a ser necessário; o MVP atual pode seguir com token manual até essa etapa.

---

## 3. Outras formas de mídia para WhatsApp (roadmap)

### 3.1 Campanhas para Landing Page (UTM / parametrização de URL)

- Campanhas que levam para uma **landing page** (Meta, Google, outras) com **UTM** ou outros parâmetros de URL.
- A informação de campanha precisa **chegar até o WhatsApp** para atribuição.

**Abordagem Escale (referência para o futuro):**

- Definir um **ID único do lead** que:
  - Fica no **navegador** do usuário (ex.: cookie/localStorage).
  - É enviado para o WhatsApp em **código (ENCODE)** usando **caracteres invisíveis**, mantendo a informação na mensagem.
- No **backend do motor de WhatsApp**, é feito **DECODE** para resgatar campanha/UTM/lead.
- Assim o funil (landing → WhatsApp → OPP → ganho) fica atribuído mesmo sem CTWA.

**No produto (futuro):**

- Ter esse tipo de **tracking por UTM/parametrização**:
  - Geração/gestão do identificador (lead ID).
  - ENCODE para envio no WhatsApp (caracteres invisíveis).
  - DECODE no backend para persistir e atribuir.

---

### 3.2 Google Ads – Extensões de mensagem (Click to WhatsApp)

- Uso dos recursos de **mensagens / extensões** em campanhas do **Google Ads** que levam ao WhatsApp.

**Referência open source:**

- **WCI (WhatsApp Conversion Import)** – Google:
  - Repositório: https://github.com/google/wci  
  - Guia em PDF: https://github.com/google/wci/blob/main/docs/wci_guide.pdf  
  - Resumo e links salvos em [docs/WCI-REFERENCE.md](WCI-REFERENCE.md).

- Ideia geral:
  - Usuário clica no link “Contato via WhatsApp”.
  - Uma cloud function coleta um identificador (ex.: **gclid**) e gera um **protocolo único**.
  - Redirecionamento para o WhatsApp com mensagem pré-preenchida contendo esse protocolo.
  - Webhook do WhatsApp Business identifica o protocolo e associa ao gclid e ao número que enviou a mensagem.
  - Permite medir, atribuir e otimizar (incl. Conversion API, Customer Match).

**No produto (futuro):**

- Ter **tracking no estilo WCI** para campanhas Google que usam extensões de mensagem/WhatsApp.
- Envio de **conversões de volta para o Google Ads** (Conversion API, etc.), quando aplicável.

---

## 4. Envio de conversões para as plataformas

- **Meta**: além de atribuição (campanha/ad set/ad), enviar eventos de conversão (ex.: lead, OPP, venda) para a Meta, para otimização e relatórios.
- **Google**: nos fluxos que usarem abordagem tipo WCI, enviar conversões para o **Google Ads** (Conversion API, Enhanced Conversions for Leads, etc.).

Os dois trackings adicionais (Landing/UTM e Google WCI) devem, no futuro, **enviar conversões de volta** para as respectivas plataformas.

---

## 5. Processamento de WhatsApp no produto (opcional, futuro)

- Hoje o atendimento pode estar em um motor externo (ex.: OctaDesk, Digital Guru).
- **Possível evolução**: ter o **processamento do próprio WhatsApp dentro do produto** (receber webhooks, manter estado da conversa, etc.).
  - Vantagem: controle total do fluxo e dos dados para atribuição (incl. decode de lead ID / UTM).
  - Possibilidade de **configurar agentes de IA para WhatsApp** dentro do produto.

Isso não é pré-requisito para atribuição Meta ou para o tracking UTM/WCI, mas pode simplificar atribuição e experiência no longo prazo.

---

## 6. Resumo do roadmap (visão)

| Fase | Descrição |
|------|------------|
| **Atual** | Atribuição Meta CTWA (webhook + Marketing API), possivelmente com token manual. |
| **Próximo** | Meta 100% configurável: conexão de conta Meta (e pixel) pelo usuário → provável necessidade de App na Meta. |
| **Futuro** | Tracking Landing/UTM: lead ID no navegador → ENCODE no WhatsApp → DECODE no backend. |
| **Futuro** | Tracking Google WCI: protocolo + gclid, webhook WhatsApp, envio de conversões para Google Ads. |
| **Futuro** | Envio de conversões para Meta e Google a partir dos eventos do funil (lead, OPP, ganho). |
| **Opcional** | Motor WhatsApp no produto + configuração de agentes de IA para WhatsApp. |

---

## 7. Como usar este documento

- **Prioridade imediata**: MVP Meta CTWA + backend/dashboard já planejados (ver TODOs do projeto).
- **Decisão de produto**: definir quando implementar “conexão Meta pelo usuário” (e criar App na Meta).
- **Referência para features futuras**: UTM/encode-decode (Escale) e Google WCI (docs em `docs/WCI-REFERENCE.md` e repositório/google/wci).

Atualizar este arquivo quando houver novas fontes de mídia (ex.: outros canais) ou quando o desenho do motor WhatsApp/agentes IA for definido.

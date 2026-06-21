# Referência: WCI – WhatsApp Conversion Import (Google)

Solução open source do Google para **medir, atribuir e otimizar** campanhas que usam **extensões de mensagem / Click to WhatsApp** no Google Ads.

- **Repositório**: https://github.com/google/wci  
- **Guia em PDF** (vale a pena salvar/consultar): https://github.com/google/wci/blob/main/docs/wci_guide.pdf  

*Disclaimer (do próprio projeto): não é um produto oficialmente suportado pelo Google.*

---

## O que o WCI faz

- Permite que anunciantes que oferecem canal WhatsApp **meçam, atribuam, segmentem e otimizem** campanhas usando sinais de mensagens no chat.
- Integra conversões que acontecem no WhatsApp Business (ex.: agendamentos, compras via chat) ao **clique no anúncio** (click to chat).
- Resultado: visibilidade da jornada no WhatsApp, métricas de interação no chat, atribuição de conversões e uso de **Customer Match** com listas de audiência.

---

## Como funciona (resumo)

1. Usuário clica no link **“Contato via WhatsApp”** (no anúncio/landing).
2. Uma **cloud function** coleta um identificador (ex.: **gclid**) e gera um **protocolo único**.
3. O usuário é **redirecionado para o WhatsApp** com uma mensagem pré-preenchida contendo esse protocolo.
4. Quando o usuário envia a mensagem, uma **cloud function / webhook** ligada à WhatsApp Business Account:
   - Detecta o protocolo na mensagem.
   - Associa ao **gclid** e ao **número** de quem enviou.

Com isso, o clique (gclid) fica ligado à conversa e às conversões no WhatsApp.

---

## Pré-requisitos

- WhatsApp Business Account (e integração com a API/cloud que recebe o webhook).

---

## Deployment (do repositório oficial)

No Cloud Shell:

```bash
git clone https://github.com/google/wci && cd wci && sh ./deployment/deploy.sh
```

Atualizar para a versão mais recente:

```bash
git clone https://github.com/google/wci && cd wci && sh ./deployment/deploy.sh service=update
```

- Guided Deployment (Cloud Shell): link no README do repositório.  
- Video-guided deployment: https://youtu.be/OVXIO5RMHX8  

---

## Recursos úteis (links do README)

| Recurso | URL |
|--------|-----|
| Código fonte WCI | https://github.com/google/wci |
| WhatsApp Business Platform Cloud API (webhooks) | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks |
| Google Cloud Artifacts Registry | https://cloud.google.com/artifact-registry/docs |
| Google Cloud Run | https://cloud.google.com/run/docs |
| Google BigQuery | https://cloud.google.com/bigquery/docs |
| Google Ads Conversion API | https://developers.google.com/google-ads/api/docs/conversions/overview |
| Google Ads Customer Match | https://developers.google.com/google-ads/api/docs/remarketing/audience-types/customer-match |
| Enhanced Conversion for Leads | https://developers.google.com/google-ads/api/docs/conversions/upload-identifiers |

---

## Uso no produto (WhatsApp Tracking)

- Este documento serve de **referência** para implementar, no futuro, o **tracking de campanhas Google Ads com extensões de mensagem (Click to WhatsApp)**.
- O fluxo (protocolo único + gclid + webhook WhatsApp) pode ser adaptado para rodar dentro do nosso backend, com envio de **conversões de volta para o Google Ads** (Conversion API, etc.).
- Ver também [VISAO-PRODUTO.md](VISAO-PRODUTO.md) para o lugar desse tracking no roadmap.

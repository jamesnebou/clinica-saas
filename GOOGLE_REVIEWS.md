# Avaliações do Google no site público

## Modo v1.0 sem billing

A experiência ativa não chama Places API. Em Configurações > Depoimentos, a clínica informa dois links HTTPS públicos: `google_review_write_url` (pedir avaliação) e `google_reviews_view_url` (ver avaliações). Ambos ficam em `clinicas.metadata.site_publico`. O site exibe apenas os botões correspondentes aos links válidos, além dos depoimentos manuais. Nenhuma avaliação, nota ou contagem é buscada ou inventada.

Os campos `google_place_id` e a implementação automática abaixo são preservados para uso futuro. As rotas de Places retornam 404 antes de qualquer consulta ao Google, a menos que `GOOGLE_PLACES_AUTOMATION_ENABLED=true` seja definido explicitamente no servidor. A interface atual não chama essas rotas mesmo com a flag ativa.

## Integração automática reservada para o futuro

## Configuração da NexaWi

Configure `GOOGLE_MAPS_API_KEY` somente no ambiente do servidor. Habilite Places API (New), restrinja a chave à API necessária e configure cotas/alertas de orçamento no Google Cloud. A clínica não cria credenciais nem informa uma chave. A busca autenticada usa Text Search (New); a confirmação e as avaliações usam Place Details (New).

## Persistência e atualização

Somente o Place ID fica salvo em `clinicas.metadata.site_publico.google_place_id`. O vínculo é associado à clínica da sessão e validado no Google antes da gravação. Nome, endereço, nota, quantidade de avaliações e conteúdo das avaliações não são persistidos no banco nem em cache HTTP/Next. As consultas usam `cache: "no-store"` e as respostas da NexaWi usam `Cache-Control: no-store`. O navegador só consulta avaliações quando a seção se aproxima da área visível; navegações sem chegar à seção não fazem chamada de Place Details para reviews. Uma falha deixa os depoimentos manuais disponíveis.

Place Details (New) devolve no máximo cinco avaliações, por relevância. O site exibe apenas reviews com texto, autoria e link individual, preservando autoria, foto, nota, tempo relativo e attributions quando fornecidos. Depoimentos manuais aparecem em bloco separado e nunca recebem marca Google Maps.

## Custos e limites

Text Search com nota/contagem usa campos da categoria Enterprise; Place Details com reviews usa Enterprise + Atmosphere. A seção sob demanda evita chamadas em pageviews que não a alcançam, mas cada visualização efetiva pode custar uma chamada. Há rate limit por IP e clínica para busca e leitura, sem cache de conteúdo. Monitore cotas, custos e erros no Google Cloud antes de ampliar o tráfego.

Referências: [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search), [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details), [políticas e atribuições](https://developers.google.com/maps/documentation/places/web-service/policies).

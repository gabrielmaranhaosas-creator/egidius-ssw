# Importacao de imagem em lote (EGIDIUS 08D2)

POST `/api/import-media/preview?filename=...zip`, corpo binario ZIP, exige sessao + CSRF.
Servidor extrai imagens validas para `backend/var/media/.import-staging` por no maximo 45 minutos.
GET `/api/import-media/preview/{batch_id}/{item_id}/image` exige login.
POST `/api/import-media/apply`, JSON `{batch_id, expected_state_revision, confirm, items:[{item_id,athlete_id,kind}]}` exige sessao + CSRF.
Os nomes podem indicar proposta de vinculo, mas o usuario confirma uma relacao para cada imagem.
Nao exclui fotos anteriores; gravacao com undo de arquivos se o commit falhar.
O lote so vale para o mesmo usuario autenticado; os dados de partidas permanecem intactos.

# Publicação do EGIDIUS no Render

A configuração atual usa **Render Free + Neon Free**, descrita em [PUBLICAR_GRATUITO.md](PUBLICAR_GRATUITO.md).

O `render.yaml` não provisiona disco nem banco pagos. A aplicação depende de PostgreSQL e armazenamento privado S3 no Neon. As credenciais e o backup inicial são configurados como segredos, fora do Git.

O plano anterior com SQLite em disco pago foi substituído. Não siga instruções antigas de criação de disco ou de banco Render. O histórico dessas configurações permanece nos commits anteriores.

Uma configuração no repositório não representa um serviço publicado. A publicação exige as contas conectadas, o workspace identificado, os segredos configurados e a verificação real de acesso, persistência e recuperação.

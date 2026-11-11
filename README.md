# EGIDIUS — Sábado Show

Aplicação para gestão do elenco, fichas, sábados, equipes, súmulas, rankings e arquivos do SSW.

- Operação: leia GUIA_SSW.md.
- Hospedagem gratuita proposta: [Render + Neon](PUBLICAR_GRATUITO.md), com PostgreSQL e arquivos privados externos.
- O render.yaml usa serviço Free, sem disco pago ou banco Render.
- React/TypeScript/Vite no frontend; FastAPI no backend; SQLite local ou PostgreSQL e armazenamento S3 na nuvem.
- Acesso local direto e acesso externo por convite privado, sem formulário de senha.
- Dados pessoais, bancos, mídia privada, ambientes e backups não fazem parte do código.

## Desenvolvimento e testes

Use Node e Python 3.12. Instale `npm ci` e as dependências de `backend/requirements-dev.txt` em um ambiente virtual.

```bash
npm test
npm run build
cd backend
python -m pytest -q tests
```

Os testes usam dados fictícios e bancos temporários. Configure uma base temporária em EGIDIUS_DATABASE_URL antes da coleta da suíte, para evitar inicialização da aplicação no banco operacional.

## Mac já configurado

```bash
bash egidius.sh iniciar
bash egidius.sh status
bash egidius.sh parar
```

No endereço permanente, o computador local deixa de ser o servidor. O disco persistente, o plano de hospedagem e o convite são configurados na publicação.

# Publicação do EGIDIUS: Render Free + Neon Free

O `render.yaml` atual define apenas um serviço Docker Free em Virginia, sem disco e sem banco Render. Banco PostgreSQL e arquivos privados ficam no Neon na mesma região (`aws-us-east-1`). A configuração anterior com disco pago foi substituída. Os arquivos de Oracle permanecem no histórico de preparação; não são o caminho de publicação selecionado.

## Contas, custo e comportamento

Usar exclusivamente os planos Free e conferir o plano no painel antes de criar recursos. As franquias e políticas são consultadas em https://render.com/docs/free e https://neon.com/pricing. Não habilitar upgrade automático ou produtos pagos. O Render suspende instâncias ociosas; o primeiro acesso pode levar aproximadamente um minuto. A disponibilidade contínua não é garantida por esses planos.

O banco e os arquivos não ficam no disco temporário do Render. A pasta `/tmp/egidius-media` guarda somente uploads em processamento e prévias de importação. Uma prévia ainda não confirmada pode precisar ser reenviada após reinício. A reserva de mídia do aplicativo continua em 2 GB para manter margem sobre o armazenamento gratuito; conferir também o tráfego e a franquia de processamento no painel Neon. Vídeos e downloads são os principais candidatos a consumir tráfego.

## Recursos e segredos

1. Criar um projeto Neon exclusivo para EGIDIUS, no plano Free, em Virginia. Não reutilizar banco de outro sistema.
2. Criar bucket **private**, nunca `public_read`, com prefixo exclusivo `egidius-media`. Validar no painel que o bucket é privado e que leitura anônima de um objeto de teste falha. A aplicação também rejeita ACL com leitura pública.
3. Criar credencial de armazenamento com os escopos necessários para leitura e escrita; limitar a esse projeto/branch. Usar endpoint de armazenamento correspondente à branch do banco.
4. Configurar no serviço Render `EGIDIUS_DATABASE_URL` com PostgreSQL, driver psycopg e `sslmode=require` ou `verify-full`. Usar a conexão com pool disponibilizada pelo Neon quando aplicável. Configurar `EGIDIUS_S3_ENDPOINT`, `EGIDIUS_S3_BUCKET`, `EGIDIUS_S3_ACCESS_KEY_ID`, `EGIDIUS_S3_SECRET_ACCESS_KEY` e região.
5. `EGIDIUS_DEPLOYMENT_MODE=neon`, `EGIDIUS_STORAGE_BACKEND=s3`, `EGIDIUS_LOCAL_ACCESS=false` e `EGIDIUS_SECURE_COOKIES=true` são obrigatórios na implantação externa. O convite fica em segredo separado. Nenhum segredo é gravado no repositório.

## Primeira carga e reinicialização

O backup original fica preservado fora do Git. Para a base atual sem mídia, as variáveis privadas `EGIDIUS_INITIAL_DATABASE_B64` (SQLite compactado com gzip e base64) e `EGIDIUS_INITIAL_DATABASE_SHA256` permitem a primeira carga no início do serviço. O importador confere hash, esquema e dados, bloqueia gravação sobre tabelas com registros e importa em transação. Ajusta as sequências PostgreSQL para manter novas gravações funcionando.

Quando há mídia, conferir e transferir o backup completo antes de iniciar o serviço:

```bash
python tools/migrar_nuvem.py /caminho/backup-privado.zip
python tools/migrar_nuvem.py /caminho/backup-privado.zip --aplicar
```

O primeiro comando apenas confere o ZIP e não abre conexão com o destino. O segundo lê as credenciais do ambiente e só aceita banco vazio. Não informe credenciais na linha de comando, em issues ou mensagens. A ferramenta não sobrescreve uma base ativa. Em caso de falha durante a carga, reverte os registros e tenta remover somente os objetos enviados por aquela execução.

Após a carga, conferir os registros, remover as duas variáveis de primeira carga e reiniciar. A base existente é reutilizada; a rotina não limpa registros nem recria dados de exemplo. Não iniciar duas publicações simultâneas durante a primeira carga.

## Arquivos e backup

O upload continua validado pelo EGIDIUS. Os objetos são privados. A rota autenticada emite um link assinado temporário para download; nenhuma chave S3 vai ao navegador. Não divulgue URLs assinadas, pois elas permitem leitura durante sua validade.

O botão **Baixar backup completo** funciona tanto com SQLite local quanto com PostgreSQL: cria um snapshot consistente convertido para SQLite e inclui cada arquivo referenciado. O ZIP mantém o formato `dados/egidius.sqlite3` + `media/`, para permitir restauração no Mac ou migração para outra infraestrutura. O JSON do navegador não substitui esse backup. Testar a restauração em um destino novo antes da liberação ao grupo.

Uma falha na remoção física de um arquivo não restaura o registro já excluído: o aplicativo mantém uma fila de limpeza e repete a exclusão em operações seguintes. O espaço pendente entra na cota de mídia. Conferir eventuais objetos órfãos após falhas de rede durante uploads, principalmente antes de transferências grandes.

## Aceite para publicação

- Confirmar plano Free em ambas as contas e workspace correto do Render.
- Aprovar a revisão do GitHub com testes de API, frontend, PostgreSQL e S3 compatível.
- Conferir importação dos dados reais, sem publicar bancos ou backups no Git.
- Testar convite privado, gravação, conflito entre sessões, importação de elenco e documentos.
- Testar imagem e reprodução de vídeo no endereço real.
- Reiniciar o serviço e confirmar preservação dos dados e arquivos.
- Baixar backup completo e restaurá-lo em ambiente novo.
- Conferir uso em celular e cotas dos dois provedores.

Exportação manual está implementada. Agendamento de cópias externas e retenção ainda dependem de um destino separado e sua configuração. Um snapshot no mesmo provedor não substitui uma cópia independente. Este documento não representa serviço já publicado: registrar a URL e a revisão somente após o aceite real.

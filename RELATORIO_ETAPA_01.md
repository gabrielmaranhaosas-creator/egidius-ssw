# EGIDIUS — conferência e consolidação da versão local

Data: 09/11/2026.

## Origem examinada

Arquivo recebido: `EGIDIUS_DIAGNOSTICO_FONTE_20261109_144809_938138.zip`.

SHA-256: `d115005f89f8f2d589d73d4ff601d4929645ca8e4fcbfd1da1d7519813bef1c7`.

Os 107 arquivos de código conferem com o manifesto. O relatório do Mac informa resposta HTTP 200 da API e do frontend e `quick_check=ok` no SQLite. Contagens informadas: três usuários, nenhum perfil editorial ou mídia, dois registros de histórico e um registro de viagem. O inventário enviado no Terminal indica revisão 31, dois sábados e 31 pessoas na viagem. O ZIP de diagnóstico não contém o banco operacional.

## Pendências encontradas

- A pasta local não tem um repositório Git na raiz. A branch principal remota encontrada mantém a versão anterior em Streamlit.
- A instalação local não contém `intake.py`, `backup_format.py`, importação definitiva de elenco, restauração offline ou `render.yaml` presentes no pacote de entrega anterior.
- O preparador de publicação antigo exige `railway.toml` e orienta executar Railway.
- Uma resposta de consulta iniciada antes de uma gravação pode chegar depois dela e substituir a revisão local por uma versão antiga.
- O botão de nova tentativa pode anunciar salvamento sem confirmar a recuperação da conexão quando não há alterações locais.
- A auditoria npm identificou um aviso moderado no Vite 6.4.4.

## Consolidação preparada

- Importação definitiva de nomes por CSV, XLSX, JSON, TXT/TSV e tabela colada, com prévia, escolha da coluna, seleção, confirmação e proteção contra duplicação e conflito de revisão.
- Atualização de fichas e associação de fotos/caricaturas mantidas. Importar nomes não marca presenças, não monta times e não altera os integrantes da viagem.
- PDFs validados, associados ao sábado e disponíveis para download. PDFs são documentos de consulta; não são convertidos automaticamente em resultados ou cadastros.
- Backup completo pela interface, incluindo SQLite e arquivos referenciados, e ferramenta para conferir e restaurar a cópia offline no Mac.
- Guia de operação na interface e histórico a partir dos registros reais do grupo.
- Proteção da sincronização contra respostas antigas e conferência efetiva da recuperação da conexão.
- Vite atualizado para 6.4.6; nova auditoria npm sem vulnerabilidades conhecidas reportadas.
- Dependências Python fixadas com arquivos de versões e hashes. Dockerfile preparado para instalar essas versões e servir React compilado e API na mesma origem.
- Preparador de publicação voltado ao Render, excluindo banco, uploads, arquivos .env, backups e dependências locais. Configuração Railway antiga retirada da versão consolidada.

Referência do aviso corrigido do Vite: https://github.com/vitejs/vite/security/advisories/GHSA-8g5g-mxqh-grgj.

## Verificações desta rodada

- 77 testes de frontend aprovados, incluindo três regressões de sincronização/reconexão. Os testes novos também foram executados contra o componente anterior e reproduziram a falha.
- 58 testes de backend/manutenção aprovados, incluindo importação, PDF, backup, restauração, primeira carga e exportação de código para Render.
- Quatro testes do instalador aprovados: bloqueio de código desconhecido, recusa de link simbólico, restauração de código e ambientes após falha e reaplicação sem alterar dados.
- TypeScript e build Vite 6.4.6 aprovados.
- Ensaio real de instalação em Linux, com dependências instaladas, execução das suítes e compilação. A base fictícia manteve revisão 31, três usuários, dois sábados, 31 pessoas na viagem e o mesmo SHA-256 do SQLite antes/depois.
- Ensaio HTTP real do serviço de produção com dados fictícios: assets compilados, convite, bloqueio do acesso local externo, importação de 14 jogadores, duplicados, conflito entre duas sessões, foto, PDF, backup completo e reinício sem carga inicial. Banco, sessões e arquivos permaneceram disponíveis após reiniciar o processo.

Os testes utilizam dados fictícios em cópias isoladas. O banco real do Mac não foi disponibilizado nem modificado nesta análise. A suíte de backend emite um aviso de depreciação do adaptador de testes Starlette/httpx, sem falhas na execução.

## Atualização do Mac

O instalador reconhece os hashes do diagnóstico recebido e os arquivos já atualizados por este pacote. Código diferente bloqueia a instalação antes da manutenção. Exige os serviços locais parados, cria um backup completo e confere sua estrutura antes de trocar arquivos. Preserva os ambientes Python, node_modules e dist anteriores para reversão sem depender de downloads.

Os testes do instalador usam banco temporário separado. Ao concluir, ele compara inventário e SHA-256 do SQLite operacional com os valores anteriores. O arquivo `resultado.json`, na pasta de backup, registra a comparação.

## O que ainda precisa ser concluído

1. Aplicar o pacote e confirmar o resultado no Mac do usuário.
2. Conferir visualmente a interface atualizada no Mac e em celulares reais. Não houve nova homologação visual de navegador nesta rodada: o navegador de testes não ficou disponível no ambiente de execução.
3. Concluir a revisão e integração da versão React/API no GitHub.
4. Confirmar o workspace, o custo e os recursos do Render antes da criação do serviço. Nenhum recurso pago foi criado nesta rodada.
5. Preservar e transferir uma cópia atual dos dados reais para o volume persistente.
6. Construir a imagem no provedor, configurar HTTPS e testar o endereço externo com o Mac desligado. O ensaio HTTP local não substitui essa homologação.
7. Configurar cópias externas automáticas, retenção e restauração no ambiente de produção.
8. Fazer a rodada assistida com o responsável do SSW e concluir a passagem da operação.

Esta entrega consolida código e preparação técnica. Não representa um serviço já publicado nem a conclusão da homologação de produção.

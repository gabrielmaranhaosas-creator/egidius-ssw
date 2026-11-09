# EGIDIUS 2.0 — COMO ABRIR NO MAC

## 1. Extração
Descompacte EGIDIUS_2_ETAPA_01.zip. A pasta extraída chama-se `EGIDIUS-2`.
Mova essa pasta para `Documentos` (diretório físico `~/Documents`).

**Não sobrescreva** outra pasta chamada EGIDIUS-2: caso já exista, pare e confira antes.

## 2. VS Code
Abra o Terminal do macOS, copie e execute:

```zsh
cd "$HOME/Documents/EGIDIUS-2"
open -a "Visual Studio Code" .
```

## 3. Instalação
No Terminal integrado do VS Code (Terminal > New Terminal):

```zsh
node --version
npm --version
npm install
npm run dev
```

Abra no Chrome a URL exibida no Terminal, normalmente `http://127.0.0.1:5173/`.

Se `node` ou `npm` não existir, não instale ao acaso: informe a saída de `sw_vers -productVersion`, `uname -m`, `node --version` e `npm --version` para definirmos a instalação compatível com seu macOS.

## 4. Teste de qualidade
Em um segundo Terminal integrado (com o servidor em execução):

```zsh
cd "$HOME/Documents/EGIDIUS-2"
npm run build
```

Esperado: sem erros TypeScript, pasta `dist/` gerada. Se não, envie a mensagem completa de erro.

## 5. Teste visual
1. Visão geral abre com hero e quatro indicadores demonstrativos.
2. Clique em “Entrar na rodada”: faça check-in e desfaça check-in.
3. Confira a ordem dos madrugadores e clique em “Restaurar dados de exemplo”.
4. Rankings: alterne pontos, gols, presenças.
5. História: confira as seções previstas.
6. Teste em modo responsivo do Chrome, largura 390 px, e confira o menu inferior.

## 6. Encerrar
No terminal onde `npm run dev` está rodando, pressione Control+C. O servidor para sem apagar seus arquivos.

## Atenção
- Todos os registros são fictícios e ficam apenas na memória da página.
- Não faça upload do banco `egidius.db` do legado para repositórios públicos.
- Não modifique o antigo projeto `egidius-ssw` nesta fase.

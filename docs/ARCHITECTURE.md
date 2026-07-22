# Arquitetura do gerador

```text
GitHub REST + GraphQL ─┐
                       ├─ scripts/update-profile.mjs
GitLab REST API ───────┘             │
                                     ├─ README.md
                                     ├─ data/portfolio.json
                                     └─ assets/generated/*.svg
```

## Princípios

- Sem dependências npm externas.
- Compatível com Node.js 20 ou superior.
- Nenhum dado privado é publicado.
- Tokens são opcionais para leitura pública.
- Falha temporária de uma API preserva o snapshot anterior.
- O JSON gerado serve como contrato para a futura página do portfólio.
- Os gráficos ficam no próprio repositório, evitando dependência de serviços de cards externos.

## APIs utilizadas

### GitHub

- perfil público;
- repositórios públicos do usuário;
- eventos públicos recentes;
- linguagens de cada repositório;
- busca de commits públicos;
- calendário de contribuições por GraphQL quando existe `GITHUB_TOKEN`.

### GitLab

- perfil público;
- projetos públicos no namespace pessoal;
- eventos públicos recentes;
- linguagens de cada projeto;
- metadados públicos de commits dos repositórios.

## Segurança

- `.env` está ignorado pelo Git;
- tokens não são escritos no README nem no JSON;
- o workflow usa o token efêmero do GitHub;
- o token de escrita do GitLab deve ser armazenado em variável mascarada;
- o script consulta apenas URLs fixas das APIs configuradas.

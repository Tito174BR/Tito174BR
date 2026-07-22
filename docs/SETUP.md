# Configuração do perfil automático

Este repositório foi preparado para o usuário `Tito174BR` no GitHub e no GitLab.

## O que ele atualiza

O gerador consulta apenas dados públicos e produz:

- `README.md` do perfil;
- lista unificada de projetos públicos;
- atividade pública recente;
- contagem de projetos, stars, forks e commits visíveis;
- linguagens agregadas dos repositórios;
- gráficos SVG versionados no próprio repositório;
- `data/portfolio.json`, pronto para ser consumido pelo futuro site.

## Publicar no GitHub

Crie um repositório público com o nome exato:

```text
Tito174BR
```

O GitHub mostra automaticamente o `README.md` desse repositório no perfil quando o nome do repositório é igual ao usuário.

Depois envie os arquivos:

```bash
git init
git branch -M main
git add .
git commit -m "feat: criar perfil profissional automático"
git remote add origin git@github.com:Tito174BR/Tito174BR.git
git push -u origin main
```

### Token do GitLab no GitHub Actions

Os dados públicos do GitLab funcionam sem token. Um token opcional aumenta o limite da API:

1. No GitLab, crie um Personal Access Token com escopo `read_api`.
2. No repositório do GitHub, abra **Settings > Secrets and variables > Actions**.
3. Crie o secret `GITLAB_TOKEN`.
4. Abra **Actions > Atualizar portfólio público > Run workflow**.

O `GITHUB_TOKEN` já é fornecido automaticamente pela própria execução.

## Publicar no GitLab

Crie ou renomeie um projeto público para o caminho exato:

```text
Tito174BR
```

O GitLab pode exibir o README de um projeto cujo caminho corresponde ao nome do usuário no perfil.

Envie a mesma base para o GitLab:

```bash
git remote add gitlab git@gitlab.com:Tito174BR/Tito174BR.git
git push -u gitlab main
```

### Commit automático no GitLab

Para o pipeline gravar as atualizações:

1. Crie um Project Access Token com `write_repository`.
2. Cadastre-o em **Settings > CI/CD > Variables** como `GITLAB_PUSH_TOKEN`.
3. Marque a variável como mascarada e protegida quando o branch principal também for protegido.
4. Crie uma agenda em **Build > Pipeline schedules** para o branch padrão.

Sem `GITLAB_PUSH_TOKEN`, o pipeline ainda gera os arquivos como artifacts, mas não faz commit.

## Rodar localmente

Requisito: Node.js 20 ou superior.

```bash
cp .env.example .env
npm run update
npm run check
```

Sem conexão externa, gere novamente o README usando o snapshot atual:

```bash
npm run update:offline
```

## Dados para o futuro site

A página do portfólio pode consumir diretamente:

```text
data/portfolio.json
```

Campos principais:

- `profile`: apresentação profissional;
- `totals`: métricas consolidadas;
- `languages`: distribuição de linguagens;
- `projects`: projetos em destaque;
- `allProjects`: todos os projetos públicos encontrados;
- `activity`: atividade recente;
- `contributions`: contribuições públicas retornadas pelas plataformas;
- `sources`: disponibilidade e informações dos perfis.

## Personalização

Edite somente:

```text
portfolio.config.json
README.template.md
```

Não edite manualmente os blocos entre marcadores `AUTO` no `README.md`, pois o gerador os substitui.

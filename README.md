# StudyFlow AI

Plataforma de estudos com IA para:

- Criar **cadernos** e **módulos/temas**.
- Enviar documentos **PDF/TXT**.
- Gerar automaticamente:
  - resumo completo estruturado;
  - flashcards;
  - questões de múltipla escolha.
- Conversar com um **chatbot por voz** para tirar dúvidas.

## Stack

- Next.js 16 (App Router + Route Handlers)
- React 19 + TypeScript
- Tailwind CSS 4
- OpenAI SDK (`openai`)
- Extração de texto PDF (`pdf-parse`)

## Configuração

1. Instale dependências:

```bash
npm install
```

2. Configure variáveis de ambiente:

```bash
cp .env.example .env.local
```

Edite `.env.local`:

```env
OPENAI_API_KEY=sua_chave_aqui
OPENAI_API_KEYS=chave_1,chave_2,chave_3
OPENAI_BASE_URL=https://seu-endpoint-openai-compatível/v1
OPENAI_MODEL=gpt-4o-mini
```

Notas:

- `OPENAI_API_KEY`: chave principal.
- `OPENAI_API_KEYS`: lista opcional para rotação automática (fallback quando uma chave falha/limita).
- `OPENAI_BASE_URL`: opcional para gateways OpenAI-compatíveis.

3. Rode o projeto:

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Deploy no Vercel

1. Suba o código para o GitHub.
2. Importe o repositório no Vercel (ou use CLI).
3. Configure as variáveis:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
4. Faça deploy.

## Estrutura principal

- `src/app/page.tsx`: interface de cadernos, geração de materiais e chat por voz.
- `src/app/api/study/generate/route.ts`: upload/processamento de docs e geração de resumo/flashcards/questões.
- `src/app/api/chat/route.ts`: chat tutor com contexto do módulo selecionado.
- `src/lib/server/openai-client.ts`: inicialização do cliente OpenAI.
- `src/lib/types.ts`: tipos compartilhados.

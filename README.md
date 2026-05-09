# 📓 NotebookLM Clone — RAG Document Assistant

A full-stack **Retrieval-Augmented Generation (RAG)** web application inspired by Google NotebookLM. Upload a PDF or text document, and chat with it using AI that answers **only** from the document's contents.

![Tech Stack](https://img.shields.io/badge/Next.js-14-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript) ![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1--mini-green?logo=openai) ![Qdrant](https://img.shields.io/badge/Qdrant-Cloud-red)

---

## 🚀 What It Does

1. **Upload** — Drag-and-drop or click to upload a PDF or `.txt` file.
2. **Chunk & Embed** — The document is split into overlapping chunks and embedded into a vector space.
3. **Chat** — Ask any question. The AI retrieves the most relevant chunks and answers using **only** the document's content.
4. **Stream** — Responses are streamed token-by-token for a real-time experience.

---

## 🧠 Chunking Strategy

| Parameter | Value | Rationale |
|---|---|---|
| **Chunk Size** | 500 characters | Small enough to keep each chunk semantically focused, large enough to retain meaningful context. |
| **Chunk Overlap** | 50 characters | Prevents information loss at chunk boundaries by carrying a small overlap between adjacent chunks. |
| **Splitter** | `RecursiveCharacterTextSplitter` | Tries to split on natural boundaries (paragraphs → sentences → words) before falling back to raw character splits. This preserves semantic coherence far better than a naive fixed-size splitter. |
| **Top-K Retrieval** | 5 chunks | Balances recall (finding all relevant info) with precision (not overwhelming the LLM with noise). |

The combination of small, overlapping chunks with recursive splitting ensures that the retriever surfaces highly relevant context, and the strict system prompt guarantees the model never hallucinates beyond the document.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 14](https://nextjs.org/) (App Router, TypeScript) |
| **AI Orchestration** | [LangChain.js](https://js.langchain.com/) |
| **Embeddings** | OpenAI `text-embedding-3-large` |
| **Generation** | OpenAI `gpt-4.1-mini` |
| **Vector Database** | [Qdrant Cloud](https://qdrant.tech/) |
| **Styling** | Vanilla CSS (dark mode, glassmorphism) |

---

## 📦 Run Locally

### Prerequisites

- Node.js ≥ 18
- npm
- An OpenAI API key
- A Qdrant Cloud cluster URL and API key

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/google-notebook-lm-rag.git
cd google-notebook-lm-rag

# 2. Install dependencies
npm install

# 3. Create environment variables
cp .env.local.example .env.local
# Edit .env.local and add your keys:
#   OPENAI_API_KEY=sk-...
#   QDRANT_URL=https://your-cluster.qdrant.tech
#   QDRANT_API_KEY=your-qdrant-api-key

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and upload a document to start chatting.

---

## 🔐 Environment Variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `QDRANT_URL` | Your Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Your Qdrant Cloud API key |

All secrets go in `.env.local` (which is git-ignored).

---

## 🌐 Deploy to Vercel

1. Push this repo to GitHub (public).
2. Import into [Vercel](https://vercel.com/).
3. Add the three environment variables (`OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`) in the Vercel dashboard under **Settings → Environment Variables**.
4. Deploy!

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── upload/route.ts   — PDF/TXT parsing, chunking, embedding, Qdrant storage
│   │   └── chat/route.ts     — RAG retrieval + GPT-4.1-mini streaming
│   ├── globals.css            — Design system (dark mode, animations)
│   ├── layout.tsx             — Root layout with SEO metadata
│   └── page.tsx               — Two-panel UI (upload + chat)
```

---

## 📄 License

MIT

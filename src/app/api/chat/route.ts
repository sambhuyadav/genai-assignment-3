import { NextRequest } from "next/server";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a document assistant. Answer ONLY using the context provided below. If the answer is not in the context, say: I don't know based on the provided document. Never use outside knowledge.`;

export async function POST(request: NextRequest) {
  try {
    const { question, collectionId } = await request.json();

    if (!question || !collectionId) {
      return new Response(
        JSON.stringify({ error: "Missing question or collectionId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create embeddings for the question (explicitly set base URL to override system env)
    const embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large",
      openAIApiKey: process.env.MY_OPENAI_API_KEY,
      configuration: {
        baseURL: "https://api.openai.com/v1",
      },
    });

    const questionVector = await embeddings.embedQuery(question);

    // Initialize Qdrant client and search
    const qdrant = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });

    const searchResults = await qdrant.search(collectionId, {
      vector: questionVector,
      limit: 5,
      with_payload: true,
    });

    const contextChunks = searchResults
      .map(
        (result, i) =>
          `[Chunk ${i + 1}]:\n${(result.payload as { content: string }).content}`
      )
      .join("\n\n");

    // Build messages for the LLM
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\n--- CONTEXT START ---\n${contextChunks}\n--- CONTEXT END ---`,
      },
      {
        role: "user",
        content: question,
      },
    ];

    // Create OpenAI client and stream response (explicitly set base URL to override system env)
    const openai = new OpenAI({
      apiKey: process.env.MY_OPENAI_API_KEY,
      baseURL: "https://api.openai.com/v1",
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      stream: true,
      temperature: 0.3,
      max_tokens: 1024,
    });

    // Convert to a ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            new TextEncoder().encode("\n\n[Error: Stream interrupted]")
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

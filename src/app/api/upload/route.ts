import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

async function parsePDF(buffer: Buffer): Promise<string> {
  // Import the internal pdf-parse module directly to avoid its test-file-loading bug
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const data = await pdfParse(buffer);
  return cleanExtractedText(data.text);
}

/**
 * Clean duplicated text from PDF extraction.
 * Styled PDFs (Canva, Adobe, etc.) often have overlapping text layers
 * causing pdf-parse to extract the same content multiple times.
 * This handles: duplicate lines, consecutive duplicate words,
 * and repeated multi-word phrases.
 */
function cleanExtractedText(text: string): string {
  // Step 1: Deduplicate identical lines
  const lines = text.split("\n");
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (deduped.length > 0 && deduped[deduped.length - 1] !== "") {
        deduped.push("");
      }
      continue;
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      deduped.push(trimmed);
    }
  }

  // Step 2: Remove phrase-level stuttering within each line
  const cleaned = deduped.map((line) => {
    if (line === "") return line;
    return removePhraseStutter(line);
  });

  return cleaned.join("\n").trim();
}

/**
 * Remove repeated phrases from a line of text.
 * Handles patterns like:
 *   "computer science computer science" → "computer science"
 *   "Yadav Yadav" → "Yadav"
 *   "is a is a" → "is a"
 */
function removePhraseStutter(line: string): string {
  const words = line.split(/\s+/);
  if (words.length < 2) return line;

  const result: string[] = [];
  let i = 0;

  while (i < words.length) {
    let matched = false;

    // Try phrase lengths from longest (half remaining) down to 1
    const maxPhraseLen = Math.floor((words.length - i) / 2);
    for (let phraseLen = Math.min(maxPhraseLen, 5); phraseLen >= 1; phraseLen--) {
      // Check if the next `phraseLen` words repeat immediately after
      if (i + phraseLen * 2 <= words.length) {
        let isRepeat = true;
        for (let j = 0; j < phraseLen; j++) {
          if (words[i + j].toLowerCase() !== words[i + phraseLen + j].toLowerCase()) {
            isRepeat = false;
            break;
          }
        }
        if (isRepeat) {
          // Add the phrase once, skip the duplicate
          for (let j = 0; j < phraseLen; j++) {
            result.push(words[i + j]);
          }
          i += phraseLen * 2;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      result.push(words[i]);
      i++;
    }
  }

  return result.join(" ");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    let text: string;

    if (fileName.endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      text = await parsePDF(buffer);
    } else if (fileName.endsWith(".txt")) {
      text = await file.text();
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or .txt file." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "The uploaded file appears to be empty." },
        { status: 400 }
      );
    }

    // Chunk the text
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });

    const docs = await splitter.createDocuments([text]);

    // Generate a unique collection ID for this session
    const collectionId = `doc_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

    // Create embeddings (explicitly set base URL to override system env)
    const embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large",
      openAIApiKey: process.env.MY_OPENAI_API_KEY,
      configuration: {
        baseURL: "https://api.openai.com/v1",
      },
    });

    // Get embedding vectors for all chunks — batch to stay within API limits
    const texts = docs.map((doc) => doc.pageContent);
    const EMBED_BATCH_SIZE = 32;
    const vectors: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + EMBED_BATCH_SIZE);
      const batchVectors = await embeddings.embedDocuments(batchTexts);
      vectors.push(...batchVectors);
    }

    const vectorSize = vectors[0].length;

    // Initialize Qdrant client
    const qdrant = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });

    // Create the collection
    await qdrant.createCollection(collectionId, {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    });

    // Upsert points in batches
    const UPSERT_BATCH_SIZE = 32;
    for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
      const points = batch.map((vector, j) => ({
        id: uuidv4(),
        vector,
        payload: {
          content: texts[i + j],
          source: file.name,
          chunkIndex: i + j,
        },
      }));

      await qdrant.upsert(collectionId, {
        points,
      });
    }

    return NextResponse.json({
      collectionId,
      chunkCount: docs.length,
      fileName: file.name,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process the uploaded file. Please try again." },
      { status: 500 }
    );
  }
}

"use client";

import { useState, useRef, useEffect, useCallback, FormEvent, DragEvent } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface UploadResult {
  collectionId: string;
  chunkCount: number;
  fileName: string;
}

export default function Home() {
  // Upload state
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ============= Upload Logic =============
  const handleFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".txt")) {
      setUploadError("Only PDF and .txt files are supported.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(10);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Simulate progress (actual upload doesn't give us real progress easily)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 8, 85));
      }, 400);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      setUploadProgress(100);
      const data: UploadResult = await res.json();
      setCollectionId(data.collectionId);
      setUploadResult(data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ============= Chat Logic =============
  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !collectionId || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);

    // Add empty assistant message that we'll stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage, collectionId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Chat request failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const updated = prev.map((msg, idx) => {
              if (idx === prev.length - 1 && msg.role === "assistant") {
                return { ...msg, content: msg.content + chunk };
              }
              return msg;
            });
            return updated;
          });
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === "assistant") {
          lastMsg.content =
            err instanceof Error ? `Error: ${err.message}` : "An error occurred.";
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const chatDisabled = !collectionId;

  return (
    <div className="app-container">
      {/* ===== Header ===== */}
      <header className="app-header">
        <div className="app-logo">
          <div className="logo-icon">N</div>
          <span className="logo-text">NotebookLM</span>
          <span className="logo-badge">RAG Clone</span>
        </div>
      </header>

      {/* ===== Main Content ===== */}
      <main className="app-main">
        {/* ===== Left Panel: Upload ===== */}
        <aside className="panel-left">
          <div className="panel-header">
            <h2 className="panel-title">Sources</h2>
            <p className="panel-subtitle">Upload a document to get started</p>
          </div>

          {/* Drop Zone */}
          <div
            className={`upload-area ${isDragOver ? "drag-over" : ""} ${isUploading ? "disabled" : ""}`}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            role="button"
            tabIndex={0}
            id="upload-drop-zone"
          >
            <div className="upload-icon">📄</div>
            <div className="upload-text">
              <p className="upload-text-main">
                Drop your file here, or <strong>click to browse</strong>
              </p>
              <p className="upload-text-sub">Supports PDF and TXT files</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileSelect}
            style={{ display: "none" }}
            id="file-input"
          />

          {/* Upload Progress */}
          {isUploading && (
            <div className="upload-progress">
              <div className="upload-progress-text">
                <span className="spinner" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
                Processing document…
              </div>
              <div className="upload-progress-bar-track">
                <div
                  className="upload-progress-bar"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="file-card" style={{ borderColor: "var(--error)" }}>
              <div className="file-card-icon" style={{ background: "rgba(248,113,113,0.15)" }}>
                ⚠️
              </div>
              <div className="file-card-info">
                <div className="file-card-name" style={{ color: "var(--error)" }}>
                  Upload Failed
                </div>
                <div className="file-card-meta">{uploadError}</div>
              </div>
            </div>
          )}

          {/* Uploaded File Card */}
          {uploadResult && (
            <div className="file-card">
              <div className="file-card-icon">
                {uploadResult.fileName.toLowerCase().endsWith(".pdf") ? "📕" : "📝"}
              </div>
              <div className="file-card-info">
                <div className="file-card-name">{uploadResult.fileName}</div>
                <div className="file-card-meta">
                  {uploadResult.chunkCount} chunks indexed
                </div>
              </div>
              <div className="file-card-status success">
                <span className="status-dot" />
                Ready
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="info-section">
            <h3 className="info-title">How it works</h3>
            <div className="info-item">
              <span className="info-icon">1️⃣</span>
              Upload a PDF or text file
            </div>
            <div className="info-item">
              <span className="info-icon">2️⃣</span>
              Document is chunked &amp; embedded
            </div>
            <div className="info-item">
              <span className="info-icon">3️⃣</span>
              Ask questions about the content
            </div>
            <div className="info-item">
              <span className="info-icon">4️⃣</span>
              AI answers using only the document
            </div>
          </div>
        </aside>

        {/* ===== Right Panel: Chat ===== */}
        <section className="panel-right">
          {chatDisabled ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <h2 className="chat-empty-title">Start a Conversation</h2>
              <p className="chat-empty-text">
                Upload a document on the left to begin chatting. Your AI
                assistant will answer questions using only the content from your
                uploaded document.
              </p>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="chat-messages" id="chat-messages">
                {messages.length === 0 && (
                  <div className="chat-empty">
                    <div className="chat-empty-icon">✨</div>
                    <h2 className="chat-empty-title">Document Ready</h2>
                    <p className="chat-empty-text">
                      Your document has been processed. Ask any question about its
                      contents and the AI will answer based solely on what&apos;s in the
                      document.
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`message ${msg.role}`}>
                    <div className="message-avatar">
                      {msg.role === "user" ? "👤" : "🤖"}
                    </div>
                    <div className="message-content">
                      {msg.content || (
                        <div className="loading-dots">
                          <span />
                          <span />
                          <span />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="chat-input-container">
                <form
                  className="chat-input-wrapper"
                  onSubmit={handleSend}
                  id="chat-form"
                >
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Ask a question about your document…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isStreaming}
                    id="chat-input"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="send-button"
                    disabled={!input.trim() || isStreaming}
                    id="send-button"
                  >
                    ➤
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

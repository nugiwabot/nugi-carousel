/**
 * SumoPod LLM Service
 * OpenAI-compatible API. API key is server-side only — never exposed to browser.
 */

import { parseActionContent, CarouselAction } from "./actions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMStreamEvent {
  type: "token" | "result" | "error" | "done";
  text?: string;
  error?: string;
}

const SUMOPOD_BASE_URL =
  process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1";

function getApiKey(): string {
  const key = process.env.SUMOPOD_API_KEY;
  if (!key) {
    throw new Error(
      "SUMOPOD_API_KEY is not set. Add it to your .env.local or Vercel Environment Variables."
    );
  }
  return key;
}

function getModel(): string {
  return process.env.SUMOPOD_MODEL || "deepseek-chat";
}

/**
 * Stream a chat completion from SumoPod.
 * Returns a ReadableStream that emits SSE-formatted events compatible
 * with the existing client-side chat handler.
 * Automatically intercepts carousel_action blocks, executes them via onAction,
 * and streams friendly notification tokens to the user instead of raw code.
 */
export function streamLLM(
  messages: ChatMessage[],
  abortSignal?: AbortSignal,
  onAction?: (action: CarouselAction) => Promise<string>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let apiKey: string;
      try {
        apiKey = getApiKey();
      } catch {
        const errMsg =
          "LLM request failed. Please check your SumoPod configuration. (SUMOPOD_API_KEY not set)";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`
          )
        );
        controller.close();
        return;
      }

      const model = getModel();

      let response: Response;
      try {
        response = await fetch(`${SUMOPOD_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: 0.7,
            max_tokens: 8192,
          }),
          signal: abortSignal,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Network error";
        const errMsg = `LLM request failed. Please check your SumoPod configuration. (${message})`;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`
          )
        );
        controller.close();
        return;
      }

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // ignore
        }
        console.error("[llm] SumoPod API error", {
          status: response.status,
          body: errorBody.slice(0, 500),
        });
        const errMsg = `LLM request failed. Please check your SumoPod configuration. (HTTP ${response.status}: ${errorBody.slice(0, 200)})`;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`
          )
        );
        controller.close();
        return;
      }

      // Relay SSE stream from SumoPod to our client
      const reader = response.body?.getReader();
      if (!reader) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error:
                "LLM request failed. Empty response body from SumoPod.",
            })}\n\n`
          )
        );
        controller.close();
        return;
      }

      const decoder = new TextDecoder();
      let streamBuffer = "";
      let fullRawText = "";
      let userFacingText = "";

      let inActionBlock = false;
      let actionBuffer = "";
      let tokenBuffer = "";

      const emitToken = (text: string) => {
        if (!text) return;
        userFacingText += text;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "token", text })}\n\n`
          )
        );
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const chunk = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string };
                  finish_reason?: string | null;
                }>;
              };
              const token = chunk.choices?.[0]?.delta?.content;
              if (!token) continue;

              fullRawText += token;

              if (!inActionBlock) {
                tokenBuffer += token;
                // Check if an action block starts
                const startMarker = tokenBuffer.indexOf("```carousel_action");
                if (startMarker !== -1) {
                  const before = tokenBuffer.slice(0, startMarker);
                  if (before) emitToken(before);

                  inActionBlock = true;
                  actionBuffer = tokenBuffer.slice(startMarker + "```carousel_action".length);
                  tokenBuffer = "";
                } else {
                  // Keep lookahead window for partial ```carousel_action matches
                  const safeLen = Math.max(0, tokenBuffer.length - 20);
                  if (safeLen > 0) {
                    const toEmit = tokenBuffer.slice(0, safeLen);
                    tokenBuffer = tokenBuffer.slice(safeLen);
                    emitToken(toEmit);
                  }
                }
              } else {
                actionBuffer += token;
                const endMarker = actionBuffer.indexOf("```");
                if (endMarker !== -1) {
                  const actionContent = actionBuffer.slice(0, endMarker);
                  const after = actionBuffer.slice(endMarker + 3);

                  const action = parseActionContent(actionContent);
                  if (action && onAction) {
                    try {
                      const notification = await onAction(action);
                      if (notification) {
                        emitToken(notification);
                      }
                    } catch (actionErr) {
                      console.error("[actions] action execution error:", actionErr);
                    }
                  }

                  inActionBlock = false;
                  actionBuffer = "";
                  tokenBuffer = after;
                }
              }
            } catch {
              // skip unparseable lines
            }
          }
        }

        // Flush remaining tokenBuffer if not in action
        if (!inActionBlock && tokenBuffer) {
          emitToken(tokenBuffer);
        } else if (inActionBlock && actionBuffer) {
          const action = parseActionContent(actionBuffer);
          if (action && onAction) {
            try {
              const notification = await onAction(action);
              if (notification) emitToken(notification);
            } catch (actionErr) {
              console.error("[actions] unclosed action execution error:", actionErr);
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("[llm] stream read error", err);
        }
      } finally {
        reader.releaseLock();
      }

      // Emit final result and done
      const finalText = userFacingText || fullRawText;
      if (finalText) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "result", text: finalText })}\n\n`
          )
        );
      }
      controller.enqueue(
        encoder.encode(
          `event: done\ndata: ${JSON.stringify({ sessionId: "", exitCode: 0 })}\n\n`
        )
      );
      controller.close();
    },

    cancel() {
      // abortSignal will be triggered by caller
    },
  });
}

/**
 * Non-streaming completion for simple tasks (e.g., caption/hashtag generation).
 */
export async function completeLLM(
  messages: ChatMessage[]
): Promise<string> {
  const apiKey = getApiKey();
  const model = getModel();

  const response = await fetch(`${SUMOPOD_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `LLM request failed. Please check your SumoPod configuration. (HTTP ${response.status}: ${body.slice(0, 200)})`
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(
      "LLM request failed. Empty response from SumoPod."
    );
  }
  return content;
}

/**
 * RunPod Image Generation Service
 * Uses worker-sdxl endpoint. API key is server-side only — never exposed to browser.
 *
 * Endpoint ID: wcxqunpceum6cw (nugi-content-factory-sdxl, SDXL v2.1.1)
 *
 * Input format: { prompt, negative_prompt?, width?, height?, num_inference_steps?, guidance_scale? }
 * Output: base64 PNG image or URL
 */

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const JOB_POLL_INTERVAL_MS = 2000;
const JOB_MAX_WAIT_MS = 120_000; // 2 minutes

function getApiKey(): string {
  const key = process.env.RUNPOD_API_KEY;
  if (!key) {
    throw new Error(
      "RUNPOD_API_KEY is not set. Add it to your .env.local file."
    );
  }
  return key;
}

function getEndpointId(): string {
  const id = process.env.RUNPOD_ENDPOINT_ID || "wcxqunpceum6cw";
  return id;
}

interface RunpodJobResponse {
  id: string;
  status: string;
}

interface RunpodJobStatus {
  id: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  output?: {
    images?: Array<{ image: string; seed?: number }>;
    image?: string;
    image_url?: string;
  };
  error?: string;
}

/**
 * Submit a job to RunPod and wait for completion.
 * Returns base64 PNG data URI on success.
 */
export async function generateImage(
  prompt: string,
  width = 1024,
  height = 1024,
  negativePrompt = "blurry, low quality, watermark, text, ugly, deformed"
): Promise<string> {
  const apiKey = getApiKey();
  const endpointId = getEndpointId();

  // Submit job
  const submitResponse = await fetch(
    `${RUNPOD_API_BASE}/${endpointId}/run`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: {
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          num_inference_steps: 25,
          guidance_scale: 7.5,
          num_images_per_prompt: 1,
        },
      }),
    }
  );

  if (!submitResponse.ok) {
    const body = await submitResponse.text().catch(() => "");
    throw new Error(
      `Image generation failed. Please check your RunPod configuration. (Submit HTTP ${submitResponse.status}: ${body.slice(0, 200)})`
    );
  }

  const job = (await submitResponse.json()) as RunpodJobResponse;
  if (!job.id) {
    throw new Error(
      "Image generation failed. RunPod did not return a job ID."
    );
  }

  // Poll until completed
  const deadline = Date.now() + JOB_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(JOB_POLL_INTERVAL_MS);

    const statusResponse = await fetch(
      `${RUNPOD_API_BASE}/${endpointId}/status/${job.id}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!statusResponse.ok) {
      throw new Error(
        `Image generation failed. RunPod status check failed (HTTP ${statusResponse.status}).`
      );
    }

    const status = (await statusResponse.json()) as RunpodJobStatus;

    if (status.status === "COMPLETED") {
      return extractImageDataUri(status.output);
    }

    if (
      status.status === "FAILED" ||
      status.status === "CANCELLED" ||
      status.status === "TIMED_OUT"
    ) {
      throw new Error(
        `Image generation failed. RunPod job ${status.status}: ${status.error || "No error details available."}`
      );
    }

    // IN_QUEUE or IN_PROGRESS — keep polling
  }

  throw new Error(
    "Image generation failed. RunPod job timed out after 2 minutes."
  );
}

function extractImageDataUri(
  output: RunpodJobStatus["output"]
): string {
  if (!output) {
    throw new Error(
      "Image generation failed. RunPod returned no output."
    );
  }

  // worker-sdxl returns: { images: [{ image: "base64..." }] }
  const base64 =
    output.images?.[0]?.image ||
    output.image;

  if (base64) {
    // Already a data URI?
    if (base64.startsWith("data:")) return base64;
    // Raw base64
    return `data:image/png;base64,${base64}`;
  }

  // Some workers return a URL
  if (output.image_url) {
    return output.image_url;
  }

  throw new Error(
    "Image generation failed. RunPod output format not recognized."
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

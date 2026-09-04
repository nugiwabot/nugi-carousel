import {
  addSlide,
  updateSlide,
  deleteSlide,
  updateCarousel,
  getCarousel,
  ensureCarousel,
} from "@/lib/carousels";
import { generateImage } from "@/lib/ai/image";
import { DIMENSIONS } from "@/types/carousel";
import type { Slide } from "@/types/carousel";

export type CarouselAction =
  | {
      action: "create_slide";
      html: string;
      notes?: string;
      imagePrompt?: string;
    }
  | {
      action: "update_slide";
      slideId: string;
      html: string;
      notes?: string;
      imagePrompt?: string;
    }
  | {
      action: "delete_slide";
      slideId: string;
      }
  | {
      action: "update_caption";
      caption: string;
      hashtags?: string[];
    }
  | {
      action: "generate_image";
      prompt: string;
    };

export interface ActionResult {
  notification: string;
  data?: {
    slide?: Slide;
    updatedSlide?: Slide;
    deletedSlideId?: string;
    caption?: string;
    hashtags?: string[];
  };
}

/**
 * Execute an action on a carousel.
 * Returns a human-friendly markdown notification message and optional data payload for real-time state sync.
 */
export async function executeCarouselAction(
  carouselId: string,
  action: CarouselAction
): Promise<ActionResult> {
  try {
    let carousel = await getCarousel(carouselId);
    if (!carousel) {
      // Auto-recover on ephemeral serverless containers: ensure carousel exists
      carousel = await ensureCarousel(carouselId);
    }

    const dims = DIMENSIONS[carousel.aspectRatio] || DIMENSIONS["4:5"];

    switch (action.action) {
      case "create_slide": {
        let finalHtml = action.html;

        // If an image prompt was requested, generate via RunPod SDXL
        if (action.imagePrompt && action.imagePrompt.trim()) {
          try {
            const imageDataUri = await generateImage(
              action.imagePrompt.trim(),
              dims.width,
              dims.height
            );
            // Replace {{IMAGE}} placeholder or empty img src
            if (finalHtml.includes("{{IMAGE}}")) {
              finalHtml = finalHtml.replaceAll("{{IMAGE}}", imageDataUri);
            } else if (finalHtml.includes('<img src=""')) {
              finalHtml = finalHtml.replaceAll('<img src=""', `<img src="${imageDataUri}"`);
            } else if (!finalHtml.includes("<img")) {
              // Prepend background image wrapper if no img exists
              finalHtml = `<div style="position:relative; width:100%; height:100%; overflow:hidden;"><img src="${imageDataUri}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0;" /><div style="position:relative; z-index:1; width:100%; height:100%;">${finalHtml}</div></div>`;
            }
          } catch (err) {
            console.error("[actions] Image generation error:", err);
            // Fallback: replace placeholder with a stylish gradient/notice
            finalHtml = finalHtml.replaceAll(
              "{{IMAGE}}",
              "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='1000'><rect width='100%' height='100%' fill='%231e293b'/><text x='50%' y='50%' fill='%2394a3b8' font-size='32' text-anchor='middle' font-family='sans-serif'>Image Generation Failed</text></svg>"
            );
          }
        }

        const newSlide = await addSlide(
          carouselId,
          finalHtml,
          action.notes || `Slide ${carousel.slides.length + 1}`
        );

        if (newSlide) {
          const imgNotice = action.imagePrompt ? " 🎨 *[AI Image generated via RunPod]*" : "";
          return {
            notification: `\n\n✅ **Slide ${newSlide.order + 1} dibuat:** ${action.notes || "New slide"}${imgNotice}\n\n`,
            data: { slide: newSlide },
          };
        }
        return {
          notification: `⚠️ *Slide limit reached or failed to add slide.*`,
        };
      }

      case "update_slide": {
        let finalHtml = action.html;

        if (action.imagePrompt && action.imagePrompt.trim()) {
          try {
            const imageDataUri = await generateImage(
              action.imagePrompt.trim(),
              dims.width,
              dims.height
            );
            finalHtml = finalHtml.replaceAll("{{IMAGE}}", imageDataUri);
          } catch (err) {
            console.error("[actions] Image generation error:", err);
          }
        }

        const updated = await updateSlide(carouselId, action.slideId, {
          html: finalHtml,
          notes: action.notes,
        });

        if (updated) {
          return {
            notification: `\n\n✅ **Slide ${updated.order + 1} diperbarui:** ${action.notes || updated.id}\n\n`,
            data: { updatedSlide: updated },
          };
        }
        return {
          notification: `⚠️ *Slide ${action.slideId} tidak ditemukan.*`,
        };
      }

      case "delete_slide": {
        const deleted = await deleteSlide(carouselId, action.slideId);
        if (deleted) {
          return {
            notification: `\n\n🗑️ **Slide berhasil dihapus.**\n\n`,
            data: { deletedSlideId: action.slideId },
          };
        }
        return {
          notification: `⚠️ *Slide tidak ditemukan untuk dihapus.*`,
        };
      }

      case "update_caption": {
        await updateCarousel(carouselId, {
          caption: action.caption,
          hashtags: action.hashtags || [],
        });
        return {
          notification: `\n\n📝 **Caption & hashtags Instagram telah disimpan ke carousel!**\n\n`,
          data: { caption: action.caption, hashtags: action.hashtags },
        };
      }

      case "generate_image": {
        await generateImage(action.prompt, dims.width, dims.height);
        return {
          notification: `\n\n🎨 **AI Image generated!**\n\n`,
        };
      }

      default:
        return { notification: "" };
    }
  } catch (error) {
    console.error("[actions] executeCarouselAction error:", error);
    return {
      notification: `\n\n⚠️ *Gagal memproses aksi carousel: ${(error as Error).message}*\n\n`,
    };
  }
}

/**
 * Extract and parse carousel action JSON from a code block or curl command.
 */
export function parseActionContent(rawText: string): CarouselAction | null {
  const trimmed = rawText.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.action === "string") {
      return parsed as CarouselAction;
    }
  } catch {
    // Continue to heuristics
  }

  // Try extracting from curl command: curl -X POST .../slides -d '{"html":...}'
  const curlMatch = trimmed.match(/-d\s+['"]({[\s\S]*?})['"]/);
  if (curlMatch && curlMatch[1]) {
    try {
      const curlData = JSON.parse(curlMatch[1]);
      if (trimmed.includes("/slides/") && (trimmed.includes("-X PUT") || trimmed.includes("PUT"))) {
        const slideIdMatch = trimmed.match(/\/slides\/([a-zA-Z0-9_-]+)/);
        return {
          action: "update_slide",
          slideId: slideIdMatch ? slideIdMatch[1] : "",
          html: curlData.html || "",
          notes: curlData.notes,
        };
      }
      if (trimmed.includes("/slides") && (trimmed.includes("-X POST") || trimmed.includes("POST"))) {
        return {
          action: "create_slide",
          html: curlData.html || "",
          notes: curlData.notes,
          imagePrompt: curlData.imagePrompt,
        };
      }
      if (trimmed.includes("/caption")) {
        return {
          action: "update_caption",
          caption: curlData.caption || "",
          hashtags: curlData.hashtags || [],
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

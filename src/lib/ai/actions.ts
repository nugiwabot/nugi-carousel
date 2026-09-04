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
import type { Slide, Carousel } from "@/types/carousel";

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
    carousel?: Carousel | null;
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
/**
 * Helper to inject a generated background image into slide HTML, ensuring contrast and visibility.
 */
function injectBackgroundImage(html: string, imageUri: string): string {
  if (html.includes("{{IMAGE}}")) {
    return html.replaceAll("{{IMAGE}}", imageUri);
  }
  if (html.includes('<img src=""')) {
    return html.replaceAll('<img src=""', `<img src="${imageUri}"`);
  }

  // Strip solid background on outermost container so image shines through
  const strippedHtml = html.replace(
    /(<div[^>]*style=["'][^"']*?)(background(?:-color)?:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+))([^"']*?["'])/i,
    "$1background:transparent$3"
  );

  return `<div style="position:relative; width:100%; height:100%; overflow:hidden; box-sizing:border-box; background:#070b14;"><img src="${imageUri}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.45; filter:brightness(0.7) contrast(1.1); z-index:0;" /><div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(7,11,20,0.35) 0%, rgba(7,11,20,0.85) 60%, #070b14 100%); z-index:1;"></div><div style="position:relative; z-index:2; width:100%; height:100%; box-sizing:border-box;">${strippedHtml}</div></div>`;
}

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

        // Detect if this is Slide 1 (Cover / Hook)
        const isSlide1 =
          carousel.slides.length === 0 ||
          (action.notes && /slide\s*1|hook|cover/i.test(action.notes));

        let effectiveImagePrompt = action.imagePrompt?.trim();

        // Auto-generate AI background image prompt for Slide 1 if omitted
        if (!effectiveImagePrompt && isSlide1 && process.env.RUNPOD_API_KEY) {
          const titleMatch = finalHtml.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
          const titleText = titleMatch
            ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
            : (carousel.name || "business strategy innovation");
          effectiveImagePrompt = `Cinematic photorealistic shot, aesthetic dark obsidian atmosphere, dramatic studio lighting, related to ${titleText.slice(0, 120)}, 8k resolution, ultra detailed, no text, no watermark`;
        }

        // If an image prompt was requested or auto-synthesized for Slide 1, generate via RunPod SDXL
        if (effectiveImagePrompt) {
          try {
            const imageDataUri = await generateImage(
              effectiveImagePrompt,
              dims.width,
              dims.height
            );
            finalHtml = injectBackgroundImage(finalHtml, imageDataUri);
          } catch (err) {
            console.error("[actions] Image generation error:", err);
            // Fallback: replace placeholder with a stylish gradient/notice
            finalHtml = finalHtml.replaceAll(
              "{{IMAGE}}",
              "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='1000'><rect width='100%' height='100%' fill='%23070b14'/><text x='50%' y='50%' fill='%2364748b' font-size='28' text-anchor='middle' font-family='sans-serif'>AI Image Fallback</text></svg>"
            );
          }
        }

        const newSlide = await addSlide(
          carouselId,
          finalHtml,
          action.notes || `Slide ${carousel.slides.length + 1}`
        );

        const latestCarousel = await getCarousel(carouselId);

        if (newSlide) {
          const imgNotice = effectiveImagePrompt ? " 🎨 *[AI Background Image generated via RunPod]*" : "";
          return {
            notification: `\n\n✅ **Slide ${newSlide.order + 1} dibuat:** ${action.notes || "New slide"}${imgNotice}\n\n`,
            data: { carousel: latestCarousel, slide: newSlide },
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
            finalHtml = injectBackgroundImage(finalHtml, imageDataUri);
          } catch (err) {
            console.error("[actions] Image generation error:", err);
          }
        }

        let updated = await updateSlide(carouselId, action.slideId, {
          html: finalHtml,
          notes: action.notes,
        });

        // Fallback: If updateSlide didn't match slideId, create as new slide so content is never lost
        if (!updated) {
          updated = await addSlide(
            carouselId,
            finalHtml,
            action.notes || "Slide"
          );
        }

        const latestCarousel = await getCarousel(carouselId);

        if (updated) {
          return {
            notification: `\n\n✅ **Slide ${updated.order + 1} diperbarui:** ${action.notes || updated.id}\n\n`,
            data: { carousel: latestCarousel, updatedSlide: updated },
          };
        }
        return {
          notification: `⚠️ *Slide ${action.slideId} tidak ditemukan.*`,
        };
      }

      case "delete_slide": {
        const deleted = await deleteSlide(carouselId, action.slideId);
        const latestCarousel = await getCarousel(carouselId);
        if (deleted) {
          return {
            notification: `\n\n🗑️ **Slide berhasil dihapus.**\n\n`,
            data: { carousel: latestCarousel, deletedSlideId: action.slideId },
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
        const latestCarousel = await getCarousel(carouselId);
        return {
          notification: `\n\n📝 **Caption & hashtags Instagram telah disimpan ke carousel!**\n\n`,
          data: { carousel: latestCarousel, caption: action.caption, hashtags: action.hashtags },
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

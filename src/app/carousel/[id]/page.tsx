"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Grid3X3, Bookmark, Maximize2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CarouselPreview } from "@/components/editor/CarouselPreview";
import { SlideFilmstrip } from "@/components/editor/SlideFilmstrip";
import { AspectRatioSelector } from "@/components/editor/AspectRatioSelector";
import { ExportButton } from "@/components/editor/ExportButton";
import { CaptionPanel } from "@/components/editor/CaptionPanel";
import { FullscreenPreview } from "@/components/editor/FullscreenPreview";
import type { Carousel, AspectRatio } from "@/types/carousel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CarouselEditorPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  // claudeAvailable is kept for prop compatibility but AI is always available via SumoPod
  const [chatOpen, setChatOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Ref for focusing chat input when + button is clicked
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleCarouselAction = useCallback(
    (event: any) => {
      if (!event) return;

      // 1. Full carousel payload from server action
      if (event.carousel && Array.isArray(event.carousel.slides)) {
        setCarousel(event.carousel);
        if (event.carousel.slides.length > 0) {
          setActiveSlide(event.carousel.slides.length - 1);
        }
        try {
          localStorage.setItem(`carousel_${id}`, JSON.stringify(event.carousel));
        } catch {}
        return;
      }

      // 2. Individual action fallback
      if (event.action === "create_slide" && event.slide) {
        setCarousel((prev) => {
          if (!prev) return prev;
          const exists = prev.slides.some((s) => s.id === event.slide.id);
          const newSlides = exists
            ? prev.slides.map((s) => (s.id === event.slide.id ? event.slide : s))
            : [...prev.slides, event.slide];
          setActiveSlide(newSlides.length - 1);
          const updated = { ...prev, slides: newSlides };
          try {
            localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } else if (event.action === "update_slide" && event.updatedSlide) {
        setCarousel((prev) => {
          if (!prev) return prev;
          const exists = prev.slides.some((s) => s.id === event.updatedSlide.id);
          const newSlides = exists
            ? prev.slides.map((s) =>
                s.id === event.updatedSlide.id ? event.updatedSlide : s
              )
            : [...prev.slides, event.updatedSlide];
          setActiveSlide(newSlides.length - 1);
          const updated = { ...prev, slides: newSlides };
          try {
            localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } else if (event.action === "delete_slide" && event.deletedSlideId) {
        setCarousel((prev) => {
          if (!prev) return prev;
          const newSlides = prev.slides.filter((s) => s.id !== event.deletedSlideId);
          const updated = { ...prev, slides: newSlides };
          try {
            localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } else if (event.action === "update_caption") {
        setCarousel((prev) => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            caption: event.caption || prev.caption,
            hashtags: event.hashtags || prev.hashtags,
          };
          try {
            localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    },
    [id]
  );

  const fetchCarousel = useCallback(async () => {
    try {
      const res = await fetch(`/api/carousels/${id}`);
      if (res.status === 404) {
        // Check local storage fallback before marking as not found
        try {
          const cached = localStorage.getItem(`carousel_${id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            setCarousel(parsed);
            setNotFound(false);
            fetch(`/api/carousels/${id}/sync`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: cached,
            }).catch(() => {});
            return;
          }
        } catch {}
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setNotFound(false);
        setCarousel((prev) => {
          // Never downgrade client slides if this cold server container has fewer slides!
          if (prev && prev.slides && data.slides && prev.slides.length > data.slides.length) {
            fetch(`/api/carousels/${id}/sync`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(prev),
            }).catch(() => {});
            return prev;
          }
          if (prev && data.slides.length > prev.slides.length) {
            setActiveSlide(data.slides.length - 1);
          } else {
            setActiveSlide((prevIdx) =>
              data.slides.length === 0 ? 0 : Math.min(prevIdx, data.slides.length - 1)
            );
          }
          try {
            localStorage.setItem(`carousel_${id}`, JSON.stringify(data));
          } catch {}
          return data;
        });
      }
    } catch {
      // ignore network errors
    }
  }, [id]);

  // Initial data load
  useEffect(() => {
    let active = true;
    void (async () => {
      // Check localStorage first for instant display
      try {
        const cached = localStorage.getItem(`carousel_${id}`);
        if (cached && active) {
          const parsed = JSON.parse(cached);
          setCarousel(parsed);
          fetch(`/api/carousels/${id}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: cached,
          }).catch(() => {});
        }
      } catch {}

      try {
        const res = await fetch(`/api/carousels/${id}`);
        if (!active) return;
        if (res.status === 404) {
          const cached = localStorage.getItem(`carousel_${id}`);
          if (!cached) {
            setNotFound(true);
          }
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          setNotFound(false);
          setCarousel((prev) => {
            if (prev && prev.slides && data.slides && prev.slides.length > data.slides.length) {
              return prev;
            }
            try {
              localStorage.setItem(`carousel_${id}`, JSON.stringify(data));
            } catch {}
            return data;
          });
          setActiveSlide((prevIdx) =>
            data.slides.length === 0 ? 0 : Math.min(prevIdx, data.slides.length - 1)
          );
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Persist carousel whenever it changes
  useEffect(() => {
    if (carousel) {
      try {
        localStorage.setItem(`carousel_${id}`, JSON.stringify(carousel));
      } catch {}
    }
  }, [carousel, id]);

  const handleAspectChange = async (ratio: AspectRatio) => {
    if (!carousel) return;
    const updated = { ...carousel, aspectRatio: ratio };
    setCarousel(updated);
    try {
      localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
    } catch {}
    fetch(`/api/carousels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspectRatio: ratio }),
    }).catch(() => {});
    fetch(`/api/carousels/${id}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const handleDeleteSlide = (slideId: string) => {
    if (!carousel) return;
    const slideIndex = carousel.slides.findIndex((s) => s.id === slideId);
    setConfirmState({
      open: true,
      title: `Delete slide ${slideIndex + 1}?`,
      description: "This action cannot be undone.",
      onConfirm: async () => {
        const newSlides = carousel.slides
          .filter((s) => s.id !== slideId)
          .map((s, idx) => ({ ...s, order: idx }));
        const updated = { ...carousel, slides: newSlides };
        setCarousel(updated);
        setActiveSlide((prev) => Math.min(prev, Math.max(0, newSlides.length - 1)));
        try {
          localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
        } catch {}
        fetch(`/api/carousels/${id}/slides/${slideId}`, { method: "DELETE" }).catch(() => {});
        fetch(`/api/carousels/${id}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        }).catch(() => {});
      },
    });
  };

  const handleUndoSlide = async (slideId: string) => {
    const res = await fetch(`/api/carousels/${id}/slides/${slideId}/undo`, {
      method: "POST",
    });
    if (res.ok) {
      const updatedSlide = await res.json();
      setCarousel((prev) => {
        if (!prev) return prev;
        const newSlides = prev.slides.map((s) =>
          s.id === slideId ? updatedSlide : s
        );
        const updated = { ...prev, slides: newSlides };
        try {
          localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  };

  const handleDeleteCarousel = useCallback(() => {
    if (!carousel) return;
    setConfirmState({
      open: true,
      title: `Delete "${carousel.name}"?`,
      description: "This will permanently delete the carousel and all its slides.",
      onConfirm: async () => {
        try {
          localStorage.removeItem(`carousel_${id}`);
        } catch {}
        const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
        if (res.ok) router.push("/");
      },
    });
  }, [carousel, id, router]);

  const handleStreamStart = useCallback(() => {
    setIsGenerating(true);
  }, []);

  const handleStreamEnd = useCallback(() => {
    setIsGenerating(false);
    // Sync whatever carousel the client currently holds to the server container in background
    setCarousel((current) => {
      if (current) {
        fetch(`/api/carousels/${id}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(current),
        }).catch(() => {});
      }
      return current;
    });
  }, [id]);

  const handleReorderSlides = useCallback(
    async (slideIds: string[]) => {
      if (!carousel) return;
      const slideMap = new Map(carousel.slides.map((s) => [s.id, s]));
      const reordered = slideIds.map((sid, idx) => {
        const s = slideMap.get(sid)!;
        return { ...s, order: idx };
      });
      const updated = { ...carousel, slides: reordered };
      setCarousel(updated);
      try {
        localStorage.setItem(`carousel_${id}`, JSON.stringify(updated));
      } catch {}
      fetch(`/api/carousels/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideIds }),
      }).catch(() => {});
      fetch(`/api/carousels/${id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      }).catch(() => {});
    },
    [carousel, id]
  );

  const handleAddSlideRequest = useCallback(() => {
    setChatOpen(true);
    // Focus chat input after a tick (to let panel render)
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  }, []);

  if (notFound) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">Carousel not found</p>
        <p className="text-sm text-muted-foreground">
          This carousel may have been deleted.
        </p>
        <Link href="/" className="text-sm text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!carousel) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title={carousel.name}
        showBack
        editable
        onTitleChange={async (name) => {
          const res = await fetch(`/api/carousels/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (res.ok) {
            const updated = await res.json();
            setCarousel(updated);
          }
        }}
      />

      {/* Fullscreen preview */}
      <FullscreenPreview
        open={showFullscreen}
        onOpenChange={setShowFullscreen}
        slides={carousel.slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
      />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmState.onConfirm}
      />

      {/* Main editor area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Chat panel */}
        {chatOpen && (
          <div className="oc-fade w-80 border-r border-border shrink-0 flex flex-col bg-surface">
            <ChatPanel
              carouselId={id}
              currentCarousel={carousel}
              referenceImages={carousel.referenceImages || []}
              onStreamStart={handleStreamStart}
              onStreamEnd={handleStreamEnd}
              onCarouselAction={handleCarouselAction}
              chatInputRef={chatInputRef}
            />
          </div>
        )}

        {/* Right side: toolbar + preview */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Toolbar */}
          <div className="h-11 border-b border-border bg-surface flex items-center px-4 gap-3 shrink-0">
            <AspectRatioSelector
              value={carousel.aspectRatio}
              onChange={handleAspectChange}
            />
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullscreen(true)}
              className="text-muted-foreground"
              aria-label="Fullscreen preview"
              title="Fullscreen preview"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={showSafeZones ? "outline" : "ghost"}
              size="sm"
              onClick={() => setShowSafeZones(!showSafeZones)}
              className={showSafeZones ? "border-accent text-accent" : "text-muted-foreground"}
              aria-label="Toggle safe zones"
              title="Instagram safe zones"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch("/api/templates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ carouselId: carousel.id }),
                });
              }}
              className="text-muted-foreground"
              aria-label="Save as template"
              title="Save as template"
            >
              <Bookmark className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteCarousel}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete carousel"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            >
              {chatOpen ? "Hide Chat" : "Show Chat"}
            </button>
            <ExportButton
              carouselId={carousel.id}
              slideCount={carousel.slides.length}
              carousel={carousel}
            />
          </div>

          {/* Carousel preview */}
          <CarouselPreview
            slides={carousel.slides}
            aspectRatio={carousel.aspectRatio}
            activeIndex={activeSlide}
            onActiveChange={setActiveSlide}
            showSafeZones={showSafeZones}
          />

          {/* Caption panel */}
          <CaptionPanel
            caption={carousel.caption}
            hashtags={carousel.hashtags}
          />
        </div>
      </div>

      {/* Filmstrip */}
      <SlideFilmstrip
        slides={carousel.slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
        onDeleteSlide={handleDeleteSlide}
        onUndoSlide={handleUndoSlide}
        onAddSlideRequest={handleAddSlideRequest}
        onReorderSlides={handleReorderSlides}
        isGenerating={isGenerating}
      />
    </div>
  );
}

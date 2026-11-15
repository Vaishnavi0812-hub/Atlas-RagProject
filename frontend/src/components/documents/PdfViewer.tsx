/**
 * In-app PDF renderer (pdf.js). Renders pages to canvas at the container's
 * width, lazily as they scroll into view, and can open at a given page, which
 * citations use to jump straight to their source.
 */
import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

function Page({ pdf, number, width, zoom }: { pdf: PDFDocumentProxy; number: number; width: number; zoom: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(number <= 2);
  const [ratio, setRatio] = useState(1.294); // A4/Letter-ish until measured

  useEffect(() => {
    const el = holderRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    pdf.getPage(number).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const cssWidth = width * zoom;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssWidth * (base.height / base.width)}px`;
      task = page.render({ canvas, viewport });
      task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, number, width, zoom, visible]);

  return (
    <div ref={holderRef} data-page={number} className="mx-auto w-fit">
      <div className="bg-white shadow-card ring-1 ring-graphite-900/10" style={{ width: width * zoom, minHeight: width * zoom * ratio }}>
        <canvas ref={canvasRef} className="block" aria-label={`Page ${number}`} />
      </div>
      <p className="mt-1.5 text-center font-mono text-[0.6rem] uppercase tracking-wider text-graphite-400">Page {number}</p>
    </div>
  );
}

export default function PdfViewer({ url, initialPage = 1 }: { url: string; initialPage?: number }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(initialPage);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setError(null);
    const task = getDocument({ url, withCredentials: true });
    task.promise
      .then((doc) => !cancelled && setPdf(doc))
      .catch(() => !cancelled && setError("This PDF could not be rendered."));
    return () => {
      // Destroying rejects the pending promise; `cancelled` keeps that from
      // being reported as an error.
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width) - 32));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goTo = (n: number) => {
    const target = scrollRef.current?.querySelector(`[data-page="${n}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrent(n);
  };

  // Open at the requested page once the document has laid out.
  useEffect(() => {
    if (pdf && width && initialPage > 1) {
      const t = window.setTimeout(() => {
        scrollRef.current?.querySelector(`[data-page="${initialPage}"]`)?.scrollIntoView({ block: "start" });
      }, 50);
      return () => window.clearTimeout(t);
    }
  }, [pdf, width, initialPage]);

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    const top = root.getBoundingClientRect().top;
    const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
    const firstVisible = pages.find((p) => p.getBoundingClientRect().bottom > top + 40);
    if (firstVisible) setCurrent(Number(firstVisible.dataset.page));
  };

  const pageCount = pdf?.numPages ?? 0;

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-xl bg-graphite-800 ring-1 ring-graphite-900/10">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-sand-100">
        <div className="flex items-center gap-1">
          <button className="rounded p-1 hover:bg-white/10 disabled:opacity-30" onClick={() => goTo(current - 1)} disabled={current <= 1} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center font-mono text-xs tabular-nums">
            {pageCount ? `${current} / ${pageCount}` : "—"}
          </span>
          <button className="rounded p-1 hover:bg-white/10 disabled:opacity-30" onClick={() => goTo(current + 1)} disabled={current >= pageCount} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded p-1 hover:bg-white/10 disabled:opacity-30" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === ZOOMS[0]} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-mono text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <button className="rounded p-1 hover:bg-white/10 disabled:opacity-30" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin flex-1 space-y-4 overflow-auto p-4">
        {error ? (
          <p className="text-sm text-sand-100">{error}</p>
        ) : !pdf || !width ? (
          <Skeleton className="mx-auto h-full w-full bg-white/10" />
        ) : (
          Array.from({ length: pageCount }, (_, i) => <Page key={i} pdf={pdf} number={i + 1} width={width} zoom={zoom} />)
        )}
      </div>
    </div>
  );
}

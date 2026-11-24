import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readPdf } from "./api";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  root: string;
  /** 每次编译成功后自增，触发重新加载 */
  version: number;
}

type ZoomMode = "fit" | number;

export default function PdfPreview({ root, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<ZoomMode>("fit");
  const [pageInput, setPageInput] = useState("");
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // 加载 PDF（base64 -> Uint8Array）
  useEffect(() => {
    if (!root || version === 0) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const b64 = await readPdf(root);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const task = pdfjsLib.getDocument({ data: bytes });
        const pdf = await task.promise;
        if (cancelled) { pdf.destroy(); return; }

        docRef.current?.destroy();
        docRef.current = pdf;
        setNumPages(pdf.numPages);
        setPageNum(1);
      } catch (e) {
        if (!cancelled) setError(`PDF 加载失败: ${e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [root, version]);

  // 渲染当前页（缩放变化时重渲染）
  useEffect(() => {
    const pdf = docRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        renderTaskRef.current?.cancel();
        const container = canvas.parentElement!;
        const available = container.clientWidth - 32;
        const base = page.getViewport({ scale: 1 });
        const fitScale = Math.max(0.4, Math.min(2.4, available / base.width));
        const scale = zoom === "fit" ? fitScale : zoom;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.scale(dpr, dpr);
        renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
        await renderTaskRef.current.promise;
      } catch (e: unknown) {
        if (!cancelled && (e as Error)?.name !== "RenderingCancelledException") {
          setError(`渲染失败: ${e}`);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [pageNum, numPages, zoom]);

  // 容器宽度变化时，适应宽度模式重渲染（窗口/分屏拖动）
  useEffect(() => {
    if (zoom !== "fit") return;
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;
    const el = canvas.parentElement;
    let timer: number | undefined;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNumPages((n) => n), 120);
    });
    ro.observe(el);
    return () => { ro.disconnect(); window.clearTimeout(timer); };
  }, [zoom]);

  const goPage = (delta: number) => {
    const next = Math.min(numPages, Math.max(1, pageNum + delta));
    if (next !== pageNum) setPageNum(next);
  };

  const jumpToPage = () => {
    const n = Number(pageInput);
    if (Number.isFinite(n) && n >= 1 && n <= numPages) {
      setPageNum(n);
    }
    setPageInput("");
  };

  const changeZoom = (delta: number) => {
    setZoom((z) => {
      const cur = z === "fit" ? 1 : z;
      return Math.max(0.4, Math.min(3, Math.round((cur + delta) * 10) / 10));
    });
  };

  const zoomLabel = zoom === "fit" ? "适应" : `${Math.round(zoom * 100)}%`;

  return (
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <span className="tool-label">PDF 预览</span>
        <span className="spacer" />
        <button className="pdf-nav" onClick={() => goPage(-1)} disabled={pageNum <= 1 || loading}>‹</button>
        <span className="pdf-page">{numPages ? `${pageNum} / ${numPages}` : "—"}</span>
        <button className="pdf-nav" onClick={() => goPage(1)} disabled={pageNum >= numPages || loading}>›</button>
        {numPages > 0 && (
          <input
            className="pdf-jump"
            value={pageInput}
            placeholder="页"
            title="输入页码后回车跳转"
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") jumpToPage(); }}
          />
        )}
        <span className="pdf-toolbar-sep" />
        <button className="pdf-zoom-btn" onClick={() => changeZoom(-0.1)} title="缩小">−</button>
        <button className="pdf-zoom-label" onClick={() => setZoom("fit")} title="点击回到适应宽度">{zoomLabel}</button>
        <button className="pdf-zoom-btn" onClick={() => changeZoom(0.1)} title="放大">＋</button>
      </div>
      <div className="pdf-scroll">
        {loading && <div className="pdf-placeholder">正在加载 PDF…</div>}
        {!loading && error && <div className="pdf-placeholder error">{error}</div>}
        {!loading && !error && version === 0 && (
          <div className="pdf-placeholder">点击「编译 PDF」后，这里会显示预览</div>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: !loading && !error && version > 0 ? "block" : "none", margin: "16px auto" }}
        />
      </div>
    </div>
  );
}

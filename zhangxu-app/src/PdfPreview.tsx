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

export default function PdfPreview({ root, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  // 渲染当前页
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
        const scale = Math.max(0.4, Math.min(2.4, available / base.width));
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
  }, [pageNum, numPages]);

  const goPage = (delta: number) => {
    const next = pageNum + delta;
    if (next >= 1 && next <= numPages) setPageNum(next);
  };

  return (
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <span className="tool-label">PDF 预览</span>
        <span className="spacer" />
        <button className="pdf-nav" onClick={() => goPage(-1)} disabled={pageNum <= 1 || loading}>‹</button>
        <span className="pdf-page">{numPages ? `${pageNum} / ${numPages}` : "—"}</span>
        <button className="pdf-nav" onClick={() => goPage(1)} disabled={pageNum >= numPages || loading}>›</button>
      </div>
      <div className="pdf-scroll">
        {loading && <div className="pdf-placeholder">正在加载 PDF…</div>}
        {!loading && error && <div className="pdf-placeholder error">{error}</div>}
        {!loading && !error && version === 0 && (
          <div className="pdf-placeholder">点击「编译 PDF」后，这里会显示预览</div>
        )}
        <canvas ref={canvasRef} style={{ display: !loading && !error && version > 0 ? "block" : "none", margin: "16px auto" }} />
      </div>
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { ParsedProblem, ProblemBoundingBox } from "@/types/problems";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

// Configure PDF.js worker to avoid warnings.
if (typeof window !== "undefined" && (pdfjsLib as any).GlobalWorkerOptions) {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url
    ).toString();
}

type PdfParserProps = {
    onParsed?: (problems: ParsedProblem[]) => void;
    showPreview?: boolean;
};

export function PdfParser({ onParsed, showPreview = true }: PdfParserProps) {
    const [file, setFile] = useState<File | null>(null);
    const [problems, setProblems] = useState<ParsedProblem[]>([]);
    const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
    const [error, setError] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);

    const hasCrops = useMemo(() => problems.some(p => p.imageUrl), [problems]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextFile = e.target.files?.[0] ?? null;
        setFile(nextFile);
        setProblems([]);
        setError(null);
        setStatus("idle");
        setCollapsed(false);
        if (!nextFile) onParsed?.([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError("Upload a PDF first.");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        setStatus("loading");
        setError(null);
        setProblems([]);

        try {
            const res = await fetch("/api/parse-problems", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Unable to parse PDF right now.");

            const cleaned: ParsedProblem[] = Array.isArray(data.problems)
                ? data.problems.map((p: unknown, idx: number) => {
                    const problem = (p ?? {}) as Record<string, unknown>;
                    return {
                        index: typeof problem.index === "number" ? problem.index : idx + 1,
                        text: typeof problem.text === "string" ? problem.text : "",
                        summary: typeof problem.summary === "string" ? problem.summary : "",
                        imageUrl: null,
                        boundingBox: problem.boundingBox as ProblemBoundingBox | null,
                    };
                })
                : [];

            const withCrops = file ? await attachCropsFromPdf(file, cleaned) : cleaned;

            setProblems(withCrops);
            onParsed?.(withCrops);
            setStatus("success");
            setCollapsed(true);
        } catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    const resetSelection = () => {
        setFile(null);
        setProblems([]);
        setStatus("idle");
        setError(null);
        setCollapsed(false);
        onParsed?.([]);
    };

    if (collapsed && status === "success") {
        return (
            <div className="w-full rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-sm p-4 md:p-6 select-text flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                            Parsed {problems.length} problem{problems.length === 1 ? "" : "s"}
                        </p>
                        {file ? (
                            <p className="text-xs text-muted-foreground truncate">File: {file.name}</p>
                        ) : null}
                        {hasCrops && <p className="text-[11px] text-muted-foreground">Crops generated from PDF</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCollapsed(false)}
                        className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                        Change PDF
                    </button>
                    <button
                        type="button"
                        onClick={resetSelection}
                        className="px-3 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition"
                    >
                        Clear
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-sm p-4 md:p-6 select-text">
            <div className="flex items-start justify-between gap-3 flex-col md:flex-row md:items-center">
                <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        <FileText className="w-4 h-4 text-blue-500" />
                        PDF Problem Parser
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Upload a worksheet PDF and Gemini will pull out each problem—kept separate from the whiteboard.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full sm:w-auto">
                    <label className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg cursor-pointer bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition">
                        <Upload className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-100">
                            {file ? file.name : "Choose PDF"}
                        </span>
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={!file || status === "loading"}
                            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition"
                        >
                            {status === "loading" ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Parsing...
                                </span>
                            ) : "Parse PDF"}
                        </button>
                        {file && (
                            <button
                                type="button"
                                onClick={resetSelection}
                                className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                            >
                                <span className="flex items-center gap-1">
                                    <X className="w-4 h-4" />
                                    Clear
                                </span>
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {status === "success" && !error && (
                <div className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    {problems.length > 0 ? `Found ${problems.length} problem${problems.length === 1 ? "" : "s"}` : "No problems detected in this PDF."}
                    {hasCrops ? " • Crops generated" : ""}
                </div>
            )}

            {showPreview && problems.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {problems.map((problem) => (
                        <div
                            key={`problem-${problem.index}`}
                            className="p-3 rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/60 shadow-sm space-y-2"
                        >
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="font-semibold text-zinc-700 dark:text-zinc-100">
                                    Problem {problem.index}
                                </span>
                            </div>
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-50">
                                {problem.summary}
                            </p>
                            <div className="text-sm whitespace-pre-wrap text-zinc-800 dark:text-zinc-50 border border-border/70 rounded-md bg-white/60 dark:bg-zinc-900/50 p-2">
                                {problem.text}
                            </div>
                            {problem.imageUrl ? (
                                <div className="rounded-md border border-border/70 bg-white dark:bg-zinc-900 overflow-hidden">
                                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground border-b border-border/60">
                                        <ImageIcon className="w-3 h-3" />
                                        Cropped image
                                    </div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={problem.imageUrl} alt={`Problem ${problem.index} crop`} className="w-full h-auto" />
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

type CropTarget = ParsedProblem & { boundingBox?: ProblemBoundingBox | null };

async function attachCropsFromPdf(file: File, problems: CropTarget[]): Promise<ParsedProblem[]> {
    if (!problems.some(p => p.boundingBox)) return problems;

    const data = await file.arrayBuffer();
    const pdf = await (pdfjsLib as any).getDocument({ data, useWorker: false }).promise;

    const pageCache = new Map<number, { canvas: HTMLCanvasElement; scale: number }>();

    const renderPage = async (pageNumber: number) => {
        if (pageCache.has(pageNumber)) return pageCache.get(pageNumber)!;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const entry = { canvas, scale: viewport.scale };
        pageCache.set(pageNumber, entry);
        return entry;
    };

    const cropped = await Promise.all(
        problems.map(async (p) => {
            if (!p.boundingBox) return p;
            const { page, x, y, width, height } = p.boundingBox;
            const rendered = await renderPage(page);
            if (!rendered) return p;
            const { canvas, scale } = rendered;

            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = Math.max(1, Math.floor(width * scale));
            cropCanvas.height = Math.max(1, Math.floor(height * scale));
            const ctx = cropCanvas.getContext("2d");
            if (!ctx) return p;

            const sx = x * scale;
            const sy = y * scale;
            ctx.drawImage(canvas, -sx, -sy);
            const maxHeightPx = Math.max(1, Math.floor(height * scale * 0.45));
            const trimmedCanvas = trimWhitespace(cropCanvas);
            const baseCanvas = trimmedCanvas || cropCanvas;
            const cappedCanvas = capHeight(baseCanvas, maxHeightPx);

            const scaleFactor = 0.6;
            const target = document.createElement("canvas");
            target.width = Math.max(1, Math.floor(cappedCanvas.width * scaleFactor));
            target.height = Math.max(1, Math.floor(cappedCanvas.height * scaleFactor));
            const tctx = target.getContext("2d");
            if (tctx) {
                tctx.drawImage(cappedCanvas, 0, 0, target.width, target.height);
            }
            const finalUrl = target.toDataURL("image/png");
            return { ...p, imageUrl: finalUrl };
        })
    );

    return cropped;
}

function trimWhitespace(source: HTMLCanvasElement): HTMLCanvasElement | null {
    const ctx = source.getContext("2d");
    if (!ctx) return null;
    const { width, height } = source;
    const data = ctx.getImageData(0, 0, width, height);
    const pixels = data.data;
    const threshold = 252; // treat near-white as background

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
            if (a > 0 && (r < threshold || g < threshold || b < threshold)) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX === -1 || maxY === -1) return null;

    // No extra padding to keep crop tight
    const pad = 0;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const trimWidth = maxX - minX + 1;
    const trimHeight = maxY - minY + 1;
    const dest = document.createElement("canvas");
    dest.width = trimWidth;
    dest.height = trimHeight;
    const dctx = dest.getContext("2d");
    if (!dctx) return null;
    dctx.drawImage(source, minX, minY, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);
    return dest;
}

function capHeight(source: HTMLCanvasElement, maxHeight: number): HTMLCanvasElement {
    const h = Math.min(source.height, Math.max(1, Math.floor(maxHeight)));
    const dest = document.createElement("canvas");
    dest.width = source.width;
    dest.height = h;
    const ctx = dest.getContext("2d");
    if (!ctx) return source;
    ctx.drawImage(source, 0, 0, source.width, h, 0, 0, source.width, h);
    return dest;
}

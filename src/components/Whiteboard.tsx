"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Link2, Loader2, Pencil, Send, Trash2, UploadCloud } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { BoundingBox, Problem } from "@/lib/problem";

interface Point {
    x: number;
    y: number;
}

const createId = () => {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
};

export function Whiteboard() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(3);
    const [isSolving, setIsSolving] = useState(false);
    const [isProcessingUpload, setIsProcessingUpload] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [imageUrlInput, setImageUrlInput] = useState("");
    const [problems, setProblems] = useState<Problem[]>([]);
    const [activeProblemId, setActiveProblemId] = useState<string | null>(null);
    const lastPoint = useRef<Point | null>(null);

    useEffect(() => {
        if (problems.length && !activeProblemId) {
            setActiveProblemId(problems[0].id);
        }
    }, [activeProblemId, problems]);

    // Initialize canvas size
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;

                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.strokeStyle = color;
                    ctx.lineWidth = brushSize;
                }
            }
        };

        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, [color, brushSize]);

    // Prevent scrolling when touching the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const preventDefault = (e: TouchEvent) => {
            e.preventDefault();
        };

        canvas.addEventListener("touchstart", preventDefault, { passive: false });
        canvas.addEventListener("touchmove", preventDefault, { passive: false });
        canvas.addEventListener("touchend", preventDefault, { passive: false });

        return () => {
            canvas.removeEventListener("touchstart", preventDefault);
            canvas.removeEventListener("touchmove", preventDefault);
            canvas.removeEventListener("touchend", preventDefault);
        };
    }, []);

    // Update context when state changes
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.strokeStyle = color;
            ctx.lineWidth = brushSize;
        }
    }, [color, brushSize]);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if ("touches" in e) {
            e.preventDefault();
        }
        setIsDrawing(true);
        const { x, y } = getCoordinates(e);
        lastPoint.current = { x, y };
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !canvasRef.current || !lastPoint.current) return;

        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        const { x, y } = getCoordinates(e);

        ctx.beginPath();
        ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        lastPoint.current = { x, y };
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        lastPoint.current = null;
    };

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        if ("touches" in e) {
            const touch = e.touches[0];
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top,
            };
        }
        return {
            x: (e as React.MouseEvent).clientX - rect.left,
            y: (e as React.MouseEvent).clientY - rect.top,
        };
    };

    const paintCanvasBackground = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = color;
            ctx.lineWidth = brushSize;
        }
    }, [brushSize, color]);

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            paintCanvasBackground();
        }
    };

    const solveEquation = async () => {
        if (!canvasRef.current) return;
        setIsSolving(true);

        try {
            const imageData = canvasRef.current.toDataURL("image/png");

            const response = await fetch("/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: imageData }),
            });

            if (!response.ok) throw new Error("Failed to solve");

            const data = await response.json();
            renderTextToCanvas(data.text);
        } catch (error) {
            console.error(error);
            alert("Failed to solve equation. Check API Key.");
        } finally {
            setIsSolving(false);
        }
    };

    const renderTextToCanvas = (text: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.font = "24px sans-serif";
        ctx.fillStyle = "#ef4444";
        ctx.fillText(text, 50, canvas.height - 50);
        ctx.restore();
    };

    const fileToDataUrl = (file: Blob) => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    // Crop a normalized bounding box from a data URL image
    const cropImageByBBox = useCallback((dataUrl: string, bbox: BoundingBox) => {
        return new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const sx = Math.max(0, Math.floor(img.width * bbox.x));
                const sy = Math.max(0, Math.floor(img.height * bbox.y));
                const sw = Math.max(1, Math.floor(img.width * bbox.width));
                const sh = Math.max(1, Math.floor(img.height * bbox.height));

                const canvas = document.createElement("canvas");
                canvas.width = sw;
                canvas.height = sh;
                const ctx = canvas.getContext("2d");
                if (!ctx) return reject(new Error("No canvas context"));
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }, []);

    const renderLatexHtml = (expr: string) => {
        try {
            return { __html: katex.renderToString(expr, { throwOnError: false, strict: "ignore" }) };
        } catch (err) {
            console.error("Failed to render LaTeX", err);
            return { __html: expr };
        }
    };

    const convertPdfToImages = useCallback(async (file: File): Promise<string[]> => {
        // @ts-expect-error - legacy build does not ship types but is required in browsers
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf");

        if (pdfjs.GlobalWorkerOptions) {
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        const buffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: buffer }).promise;
        const pages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.6 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            if (!context) continue;

            await page.render({ canvasContext: context, viewport }).promise;
            pages.push(canvas.toDataURL("image/png"));
        }

        return pages;
    }, []);

    const requestProblemsFromGemini = useCallback(async (imageDataUrl: string, labelPrefix: string) => {
        const response = await fetch("/api/parse-problems", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageDataUrl }),
        });

        if (!response.ok) {
            throw new Error("Failed to parse problems");
        }

        const data = await response.json();
        const parsedProblems = Array.isArray(data.problems) ? data.problems : [];

        const hydrated: Problem[] = [];

        for (let i = 0; i < parsedProblems.length; i++) {
            const raw = parsedProblems[i] || {};
            const bbox = raw.bbox as BoundingBox | undefined;
            let croppedImage: string | undefined;

            if (bbox) {
                const safeBox: BoundingBox = {
                    x: Math.max(0, Math.min(1, bbox.x ?? 0)),
                    y: Math.max(0, Math.min(1, bbox.y ?? 0)),
                    width: Math.max(0.01, Math.min(1, bbox.width ?? 0)),
                    height: Math.max(0.01, Math.min(1, bbox.height ?? 0)),
                };
                try {
                    croppedImage = await cropImageByBBox(imageDataUrl, safeBox);
                } catch (err) {
                    console.error("Failed to crop image for problem", err);
                }
            }

            hydrated.push(
                new Problem({
                    id: createId(),
                    title: raw.title || `${labelPrefix} Problem ${i + 1}`,
                    text: raw.text || "",
                    latex: Array.isArray(raw.latex) ? raw.latex : [],
                    sourceImage: imageDataUrl,
                    croppedImage,
                    bbox: raw.bbox ?? null,
                })
            );
        }

        return hydrated;
    }, [cropImageByBBox]);

    const handleFiles = useCallback(
        async (files: FileList | null) => {
            if (!files?.length) return;
            setUploadError(null);
            setIsProcessingUpload(true);

            try {
                const newProblems: Problem[] = [];

                for (const file of Array.from(files)) {
                    const labelPrefix = file.name || "Upload";
                    const pageImages: string[] = [];

                    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
                        const pages = await convertPdfToImages(file);
                        pageImages.push(...pages);
                    } else if (file.type.startsWith("image/")) {
                        const dataUrl = await fileToDataUrl(file);
                        pageImages.push(dataUrl);
                    } else {
                        setUploadError("Upload a PDF or image file.");
                        continue;
                    }

                    for (let i = 0; i < pageImages.length; i++) {
                        const pageLabel = `${labelPrefix} page ${i + 1}`;
                        const parsed = await requestProblemsFromGemini(pageImages[i], pageLabel);
                        if (parsed.length === 0) {
                            // fallback: keep the whole page as one problem
                            newProblems.push(
                                new Problem({
                                    id: createId(),
                                    title: `${pageLabel} (full page)`,
                                    text: "",
                                    latex: [],
                                    sourceImage: pageImages[i],
                                    croppedImage: pageImages[i],
                                })
                            );
                        } else {
                            newProblems.push(...parsed);
                        }
                    }
                }

                if (newProblems.length) {
                    setProblems((prev) => [...prev, ...newProblems]);
                    setActiveProblemId((prev) => prev ?? newProblems[0]?.id ?? null);
                }
            } catch (error) {
                console.error(error);
                setUploadError("We couldn't parse that document. Try again.");
            } finally {
                setIsProcessingUpload(false);
            }
        },
        [convertPdfToImages, requestProblemsFromGemini]
    );

    const handleImageUrlSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!imageUrlInput.trim()) return;

            setUploadError(null);
            setIsProcessingUpload(true);

            try {
                const response = await fetch(imageUrlInput.trim());
                if (!response.ok) throw new Error("Bad response");
                const blob = await response.blob();
                if (!blob.type.startsWith("image/")) {
                    throw new Error("Not an image");
                }

                const dataUrl = await fileToDataUrl(blob);
                const parsedProblems = await requestProblemsFromGemini(dataUrl, "Image");

                if (parsedProblems.length) {
                    setProblems((prev) => [...prev, ...parsedProblems]);
                    setActiveProblemId((prev) => prev ?? parsedProblems[0]?.id ?? null);
                }
                setImageUrlInput("");
            } catch (error) {
                console.error(error);
                setUploadError("Unable to fetch or parse that image. Make sure the link is public.");
            } finally {
                setIsProcessingUpload(false);
            }
        },
        [imageUrlInput, requestProblemsFromGemini]
    );

    const onDropUpload = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
    };

    useEffect(() => {
        paintCanvasBackground();
    }, [paintCanvasBackground]);

    return (
        <div className="flex h-full w-full flex-col gap-4">
            <div className="rounded-xl border border-border bg-white/80 p-4 shadow-sm dark:bg-zinc-950/80">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <label
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={onDropUpload}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-zinc-50 px-3 py-2 text-sm font-medium transition hover:border-zinc-300 dark:bg-zinc-900"
                        >
                            <UploadCloud className="h-4 w-4" />
                            <span>Upload PDF or image</span>
                            <input
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                className="hidden"
                                multiple
                                onChange={(event) => handleFiles(event.target.files)}
                            />
                        </label>
                        <form onSubmit={handleImageUrlSubmit} className="flex items-center gap-2">
                            <div className="relative">
                                <Link2 className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={imageUrlInput}
                                    onChange={(e) => setImageUrlInput(e.target.value)}
                                    className="w-48 rounded-lg border border-border bg-transparent py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-black/60 dark:focus:ring-white/60"
                                    placeholder="Paste image URL"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isProcessingUpload}
                                className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
                            >
                                Add
                            </button>
                        </form>
                        {isProcessingUpload && (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Processing...
                            </span>
                        )}
                    </div>
                    {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}
                </div>

            </div>

            <div className="relative flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-zinc-50 px-4 py-3 text-sm font-medium dark:bg-zinc-900">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Menu</span>
                        <button
                            onClick={() => setColor("#000000")}
                            className={cn(
                                "flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs transition hover:bg-zinc-100 dark:hover:bg-zinc-800",
                                color === "#000000" && "bg-zinc-100 dark:bg-zinc-800"
                            )}
                            aria-label="Black pen"
                        >
                            <Pencil className="h-4 w-4" />
                            <span>Pen</span>
                        </button>
                        <button
                            onClick={() => setColor("#ef4444")}
                            className={cn(
                                "flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs transition hover:bg-zinc-100 dark:hover:bg-zinc-800",
                                color === "#ef4444" && "bg-zinc-100 dark:bg-zinc-800"
                            )}
                            aria-label="Red pen"
                        >
                            <div className="h-3 w-3 rounded-full bg-red-500" />
                            <span>Red</span>
                        </button>
                        <button
                            onClick={() => setColor("#ffffff")}
                            className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            aria-label="Eraser"
                        >
                            <Eraser className="h-4 w-4" />
                            <span>Eraser</span>
                        </button>
                        <label className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-medium shadow-sm transition dark:bg-zinc-950">
                            <span>Brush</span>
                            <input
                                type="range"
                                min={1}
                                max={12}
                                value={brushSize}
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="h-2 cursor-pointer"
                            />
                        </label>
                        <button
                            onClick={clearCanvas}
                            className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-red-600 transition hover:bg-red-50 dark:text-red-400"
                            aria-label="Clear canvas"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span>Clear</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={solveEquation}
                            disabled={isSolving}
                            className="flex items-center gap-2 rounded-md bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
                        >
                            {isSolving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Solving...</span>
                                </>
                            ) : (
                                <>
                                    <span>Solve</span>
                                    <Send className="h-4 w-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="border-b border-border bg-white/90 px-4 py-3 dark:bg-zinc-900/80">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Problems</span>
                        <span>{problems.length}</span>
                    </div>
                    <div className="mt-2 max-h-56 space-y-3 overflow-y-auto pr-1">
                        {problems.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Upload a PDF or image and we will split it into problems for you.
                            </p>
                        )}
                        {problems.map((problem, index) => {
                            const showImage =
                                !problem.text?.trim() &&
                                (!problem.latex || problem.latex.length === 0) &&
                                problem.croppedImage;
                            return (
                                <button
                                    key={problem.id}
                                    onClick={() => setActiveProblemId(problem.id)}
                                    className={cn(
                                        "w-full rounded-md border border-border bg-white p-3 text-left shadow-sm transition hover:border-black/50 dark:bg-zinc-950",
                                        activeProblemId === problem.id && "ring-1 ring-black dark:ring-white"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                checked={activeProblemId === problem.id}
                                                onChange={() => setActiveProblemId(problem.id)}
                                                className="h-4 w-4 cursor-pointer accent-black dark:accent-white"
                                            />
                                            <span className="text-sm font-semibold">
                                                Problem {index + 1}: {problem.title}
                                            </span>
                                        </div>
                                        {problem.latex && problem.latex.length > 0 && (
                                            <span className="text-[11px] text-muted-foreground">
                                                {problem.latex.length} eq
                                                {problem.latex.length > 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>
                                    {problem.text && (
                                        <p className="mt-2 text-sm leading-relaxed text-foreground">
                                            {problem.text}
                                        </p>
                                    )}
                                    {problem.latex && problem.latex.length > 0 && (
                                        <div className="mt-2 space-y-2 rounded-md bg-zinc-100 p-2 dark:bg-zinc-800">
                                            {problem.latex.map((eq: string, eqIdx: number) => (
                                                <div
                                                    key={`${problem.id}-eq-${eqIdx}`}
                                                    className="rounded bg-white px-2 py-1 text-sm dark:bg-zinc-900"
                                                    dangerouslySetInnerHTML={renderLatexHtml(eq)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {showImage && (
                                        <div className="mt-2 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={problem.croppedImage}
                                                alt={problem.title}
                                                className="w-full object-contain"
                                            />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="relative flex-1">
                    <canvas
                        ref={canvasRef}
                        className="h-full w-full touch-none cursor-crosshair bg-transparent"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />
                </div>
            </div>
        </div>
    );
}

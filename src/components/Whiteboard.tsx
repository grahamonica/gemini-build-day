"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Pencil, Send, Trash2, Undo } from "lucide-react";
import { cn } from "@/lib/utils";

interface Point {
    x: number;
    y: number;
}

export function Whiteboard() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState("#000000"); // Default black
    const [brushSize, setBrushSize] = useState(3);
    const [isSolving, setIsSolving] = useState(false);
    const lastPoint = useRef<Point | null>(null);

    // Initialize canvas size
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;

                // Restore context settings after resize if needed, 
                // usually resize clears canvas so we might want to save/restore image data
                // For MVP we accept resize clears or we implement better resize logic.
                // Let's just set context defaults again.
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

        canvas.addEventListener('touchstart', preventDefault, { passive: false });
        canvas.addEventListener('touchmove', preventDefault, { passive: false });
        canvas.addEventListener('touchend', preventDefault, { passive: false });

        return () => {
            canvas.removeEventListener('touchstart', preventDefault);
            canvas.removeEventListener('touchmove', preventDefault);
            canvas.removeEventListener('touchend', preventDefault);
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
        // Prevent scrolling on touch devices
        if ('touches' in e) {
            // e.preventDefault(); // React synthetic events might complain, but harmless if passive: false
        }
        setIsDrawing(true);
        const { x, y } = getCoordinates(e);
        lastPoint.current = { x, y };
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !canvasRef.current || !lastPoint.current) return;

        // Prevent scrolling on touch devices while drawing
        // Note: In React, touch events are passive by default in some versions, 
        // so e.preventDefault() might not work unless we attach non-passive listener manually.
        // However, for style touch-action: none is the modern way.

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
        if ('touches' in e) {
            const touch = e.touches[0];
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            }
        }
        return {
            x: (e as React.MouseEvent).clientX - rect.left,
            y: (e as React.MouseEvent).clientY - rect.top
        };
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
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
            // data.solution would be the text
            // data.image (optional) if we render it server side, 
            // or we can render text to canvas here.

            console.log("Solution:", data.text);

            // Render text on canvas for now as a simple placeholder for the next step
            // The implementation plan says "Render Solution to Image", which implies 
            // we might want to do that in the API or here.
            // Let's assume the API returns text and we render it.
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

        // Simple text rendering for MVP
        ctx.save();
        ctx.font = "24px sans-serif";
        ctx.fillStyle = "#ef4444"; // Red color for solution
        // Position logic is tricky, let's just put it at bottom left or near center?
        // Better: find empty space? Hard.
        // Let's put it at fixed position for MVP (top left or bottom center)
        ctx.fillText(text, 50, canvas.height - 50);
        ctx.restore();
    }

    return (
        <div className="relative w-full h-full bg-white dark:bg-zinc-950 rounded-xl overflow-hidden shadow-sm border border-border">
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="w-full h-full touch-none cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
            />

            {/* Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-full shadow-lg border border-border">
                <button
                    onClick={() => setColor("#000000")}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#000000" && "bg-zinc-100 dark:bg-zinc-800")}
                >
                    <Pencil className="w-5 h-5 text-black dark:text-white" />
                </button>
                <button
                    onClick={() => setColor("#ef4444")} // Red pen
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#ef4444" && "bg-zinc-100 dark:bg-zinc-800")}
                >
                    <div className="w-5 h-5 rounded-full bg-red-500 border border-zinc-200" />
                </button>
                {/* Eraser just paints white/background? Or composite operation? */}
                <button
                    onClick={() => {
                        // Simple eraser: paint with background color
                        setColor("#ffffff");
                        // But wait, in dark mode bg is different.
                        // We need a real eraser mode which uses globalCompositeOperation = 'destination-out'
                    }}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors")}
                >
                    <Eraser className="w-5 h-5" />
                </button>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />

                <button
                    onClick={clearCanvas}
                    className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* Action Button */}
            <div className="absolute bottom-6 right-6">
                <button
                    onClick={solveEquation}
                    disabled={isSolving}
                    className="flex items-center gap-2 px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSolving ? (
                        <span className="animate-pulse">Solving...</span>
                    ) : (
                        <>
                            <span>Solve</span>
                            <Send className="w-4 h-4 ml-1" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

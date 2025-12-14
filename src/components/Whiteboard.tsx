"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Point {
    x: number;
    y: number;
    id: number;
}

interface Stroke {
    points: Point[];
    color: string;
    size: number;
}

interface WhiteboardProps {
    onCapture: (imageData: string) => void;
    onClear?: () => void;
}

export function Whiteboard({ onCapture, onClear }: WhiteboardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(3);

    // State
    const strokes = useRef<Stroke[]>([]);
    const transform = useRef({ x: 0, y: 0, scale: 1 });

    // Interaction State
    const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
    const isDrawing = useRef(false);
    const currentStroke = useRef<Stroke | null>(null);

    // Gesture State
    const lastTouchDistance = useRef<number>(0);
    const lastTouchCenter = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const isGesturing = useRef(false);

    const idleTimer = useRef<NodeJS.Timeout | null>(null);

    // Optimization: Dirty flag for RAF
    const isDirty = useRef(false);
    const rafId = useRef<number | null>(null);

    // --- Rendering ---

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Low latency context
        const ctx = canvas.getContext("2d", { desynchronized: true });
        if (!ctx) return;

        // Clear entire canvas
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Apply Transform
        ctx.save();
        ctx.translate(transform.current.x, transform.current.y);
        ctx.scale(transform.current.scale, transform.current.scale);

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Draw Dotted Grid
        const gridSize = 40;
        const dotRadius = 1;
        const startX = Math.floor((-transform.current.x) / transform.current.scale / gridSize) * gridSize;
        const startY = Math.floor((-transform.current.y) / transform.current.scale / gridSize) * gridSize;
        const endX = Math.ceil((canvas.width - transform.current.x) / transform.current.scale / gridSize) * gridSize;
        const endY = Math.ceil((canvas.height - transform.current.y) / transform.current.scale / gridSize) * gridSize;

        ctx.beginPath();
        ctx.fillStyle = "#e4e4e7"; // zinc-200

        for (let x = startX; x <= endX; x += gridSize) {
            for (let y = startY; y <= endY; y += gridSize) {
                ctx.moveTo(x + dotRadius, y);
                ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            }
        }
        ctx.fill();

        // Draw Computed Strokes
        strokes.current.forEach(stroke => {
            if (stroke.points.length < 2) return;
            ctx.beginPath();
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            ctx.stroke();
        });

        // Draw Current Stroke
        if (currentStroke.current && currentStroke.current.points.length > 1) {
            const temp = currentStroke.current;
            ctx.beginPath();
            ctx.strokeStyle = temp.color;
            ctx.lineWidth = temp.size;
            ctx.moveTo(temp.points[0].x, temp.points[0].y);
            for (let i = 1; i < temp.points.length; i++) {
                ctx.lineTo(temp.points[i].x, temp.points[i].y);
            }
            ctx.stroke();
        }

        ctx.restore();

        isDirty.current = false;
    }, []);

    // RAF Loop
    useEffect(() => {
        const loop = () => {
            if (isDirty.current) {
                render();
            }
            rafId.current = requestAnimationFrame(loop);
        };
        rafId.current = requestAnimationFrame(loop);

        return () => {
            if (rafId.current) cancelAnimationFrame(rafId.current);
        };
    }, [render]);

    const requestRender = () => {
        isDirty.current = true;
    };

    // Initial Resize
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
                requestRender();
            }
        };
        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    // --- Helpers ---

    const screenToWorld = (x: number, y: number): Point => {
        return {
            x: (x - transform.current.x) / transform.current.scale,
            y: (y - transform.current.y) / transform.current.scale,
            id: 0
        };
    };

    const getDistance = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const getCenter = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
        return {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
    };

    // --- AI Integration ---

    const triggerCapture = () => {
        if (!canvasRef.current) return;
        const imageData = canvasRef.current.toDataURL("image/png");
        onCapture(imageData);
    };

    const scheduleCapture = () => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(triggerCapture, 1000);
    };

    // --- Interaction Handlers (Pointer Events) ---

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        if (idleTimer.current) clearTimeout(idleTimer.current);

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        activePointers.current.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY
        });

        if (activePointers.current.size === 1) {
            // Start Drawing
            isDrawing.current = true;
            isGesturing.current = false;

            const p = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            currentStroke.current = {
                points: [p],
                color: color,
                size: brushSize
            };
        } else if (activePointers.current.size === 2) {
            // Start Gesture
            isDrawing.current = false;
            currentStroke.current = null;
            isGesturing.current = true;

            const pointers = Array.from(activePointers.current.values());
            lastTouchDistance.current = getDistance(pointers[0], pointers[1]);
            const center = getCenter(pointers[0], pointers[1]);
            lastTouchCenter.current = { x: center.x - rect.left, y: center.y - rect.top };
        }
        requestRender();
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();

        // Update local cache
        if (activePointers.current.has(e.pointerId)) {
            activePointers.current.set(e.pointerId, {
                x: e.clientX,
                y: e.clientY
            });
        }

        if (isDrawing.current && activePointers.current.size === 1) {
            // COALESCED EVENTS: High frequency input (Apple Pencil)
            const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];

            events.forEach(event => {
                const p = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
                currentStroke.current?.points.push(p);
            });
            requestRender();

        } else if (isGesturing.current && activePointers.current.size === 2) {
            const pointers = Array.from(activePointers.current.values());
            const dist = getDistance(pointers[0], pointers[1]);
            const centerRaw = getCenter(pointers[0], pointers[1]);
            const center = { x: centerRaw.x - rect.left, y: centerRaw.y - rect.top };

            // 1. Pan
            const dx = center.x - lastTouchCenter.current.x;
            const dy = center.y - lastTouchCenter.current.y;
            transform.current.x += dx;
            transform.current.y += dy;

            // 2. Zoom
            if (lastTouchDistance.current > 0) {
                const scaleFactor = dist / lastTouchDistance.current;
                const oldTx = transform.current.x;
                const oldTy = transform.current.y;

                transform.current.x = center.x - (center.x - oldTx) * scaleFactor;
                transform.current.y = center.y - (center.y - oldTy) * scaleFactor;
                transform.current.scale *= scaleFactor;
            }

            lastTouchDistance.current = dist;
            lastTouchCenter.current = center;

            requestRender();
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        activePointers.current.delete(e.pointerId);

        if (isDrawing.current && activePointers.current.size === 0) {
            // End Drawing
            isDrawing.current = false;
            if (currentStroke.current) {
                strokes.current.push(currentStroke.current);
                currentStroke.current = null;
            }
            requestRender();
            scheduleCapture();
        } else if (isGesturing.current && activePointers.current.size < 2) {
            isGesturing.current = false;
        }
    };

    const clearCanvas = () => {
        strokes.current = [];
        requestRender();
        if (onClear) onClear();
    };

    return (
        <div className="relative w-full h-full bg-white dark:bg-zinc-950 rounded-xl overflow-hidden shadow-sm border border-border">
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="w-full h-full touch-none cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
            />

            {/* Toolbar */}
            <div className="absolute top-4 left-4 flex items-center gap-2 p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-full shadow-lg border border-border z-20">
                <button
                    onClick={() => {
                        setColor("#000000");
                        setBrushSize(3);
                    }}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#000000" && "bg-zinc-100 dark:bg-zinc-800")}
                >
                    <Pencil className="w-5 h-5 text-black dark:text-white" />
                </button>
                <button
                    onClick={() => {
                        setColor("#ef4444");
                        setBrushSize(3);
                    }}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#ef4444" && "bg-zinc-100 dark:bg-zinc-800")}
                >
                    <div className="w-5 h-5 rounded-full bg-red-500 border border-zinc-200" />
                </button>
                <button
                    onClick={() => {
                        setColor("#ffffff");
                        setBrushSize(30);
                    }}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#ffffff" && "bg-zinc-100 dark:bg-zinc-800")}
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
        </div>
    );
}

"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation, Message } from "./Conversation";

interface Point {
    x: number;
    y: number;
}

interface Stroke {
    points: Point[];
    color: string;
    size: number;
}

export function Whiteboard() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(3);
    const [messages, setMessages] = useState<Message[]>([]);

    // State
    const strokes = useRef<Stroke[]>([]);
    const transform = useRef({ x: 0, y: 0, scale: 1 });

    // Interaction State
    const isDrawing = useRef(false);
    const currentStroke = useRef<Stroke | null>(null);

    // Touch State for Gestures
    const lastTouchDistance = useRef<number>(0);
    const lastTouchCenter = useRef<Point>({ x: 0, y: 0 });
    const isGesturing = useRef(false);

    const idleTimer = useRef<NodeJS.Timeout | null>(null);

    // --- Rendering ---

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Clear entire canvas
        // Note: We use setTransform(1,0,0,1,0,0) to clear screen pixels irrespective of current transform
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
    }, []);

    // Initial Resize
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
                render();
            }
        };
        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, [render]);

    // Re-render when brush changes (UI update only, doesn't affect canvas until draw)
    useEffect(() => {
        // Optional: Could show cursor
    }, [color, brushSize]);


    // --- Helpers ---

    const screenToWorld = (x: number, y: number): Point => {
        return {
            x: (x - transform.current.x) / transform.current.scale,
            y: (y - transform.current.y) / transform.current.scale
        };
    };

    const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchCenter = (t1: React.Touch, t2: React.Touch): Point => {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    };

    // --- AI Integration ---

    const captureAndSend = async () => {
        if (!canvasRef.current) return;

        // Capture what is currently visible on screen (WYSIWYG)
        const imageData = canvasRef.current.toDataURL("image/png");
        const newMessageId = Date.now().toString();

        const userMsg: Message = { role: 'user', content: imageData, id: newMessageId };
        setMessages(prev => [...prev, userMsg]);

        try {
            const response = await fetch("/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: imageData,
                    history: messages
                }),
            });

            if (!response.ok) throw new Error("Failed to get response");
            const data = await response.json();
            const aiMsg: Message = {
                role: 'model',
                content: data.text,
                id: (Date.now() + 1).toString()
            };
            setMessages(prev => [...prev, aiMsg]);

        } catch (error) {
            console.error(error);
        }
    };

    const scheduleCapture = () => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(captureAndSend, 1000); // 1s debounce
    };

    // --- Interaction Handlers ---

    // MOUSE EVENTS (Desktop mostly)
    const handleMouseDown = (e: React.MouseEvent) => {
        if (idleTimer.current) clearTimeout(idleTimer.current);

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        const p = screenToWorld(startX, startY);

        isDrawing.current = true;
        currentStroke.current = {
            points: [p],
            color: color,
            size: brushSize
        };
        render();
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing.current || !currentStroke.current || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const p = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        currentStroke.current.points.push(p);
        render();
    };

    const handleMouseUp = () => {
        if (isDrawing.current && currentStroke.current) {
            isDrawing.current = false;
            strokes.current.push(currentStroke.current);
            currentStroke.current = null;
            render(); // Finalize
            scheduleCapture();
        }
    };

    // TOUCH EVENTS (iPad/Mobile)
    const handleTouchStart = (e: React.TouchEvent) => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (e.touches.length === 1) {
            // Start Drawing
            isDrawing.current = true;
            isGesturing.current = false;
            const t = e.touches[0];
            const p = screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
            currentStroke.current = {
                points: [p],
                color: color,
                size: brushSize
            };
        } else if (e.touches.length === 2) {
            // Start Gesture
            isDrawing.current = false;
            currentStroke.current = null; // Cancel current line if accidental
            isGesturing.current = true;

            lastTouchDistance.current = getTouchDistance(e.touches[0], e.touches[1]);
            const center = getTouchCenter(e.touches[0], e.touches[1]);
            lastTouchCenter.current = { x: center.x - rect.left, y: center.y - rect.top };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();

        if (isDrawing.current && e.touches.length === 1) {
            // Drawing
            const t = e.touches[0];
            const p = screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
            currentStroke.current?.points.push(p);
            render();
        } else if (isGesturing.current && e.touches.length === 2) {
            // Pinch/Pan
            const dist = getTouchDistance(e.touches[0], e.touches[1]);
            const centerRaw = getTouchCenter(e.touches[0], e.touches[1]);
            const center = { x: centerRaw.x - rect.left, y: centerRaw.y - rect.top };

            // Calculate Zoom
            // Helper to get previous world center
            // We want the point under the fingers to stay under the fingers
            // Simple approach: pan + zoom individually logic

            // 1. Pan
            const dx = center.x - lastTouchCenter.current.x;
            const dy = center.y - lastTouchCenter.current.y;
            transform.current.x += dx;
            transform.current.y += dy;

            // 2. Zoom
            // Zoom keeping center stationary relative to screen
            // newScale / oldScale = dist / lastDist
            if (lastTouchDistance.current > 0) {
                const scaleFactor = dist / lastTouchDistance.current;

                // Zoom around center:
                // translation -= center * (factor - 1)
                // but center is in screen coords relative to current transform...
                // The standard formula for zooming around a screen point (xs, ys):
                // NewTx = xs - (xs - OldTx) * scaleFactor

                const oldTx = transform.current.x;
                const oldTy = transform.current.y;

                transform.current.x = center.x - (center.x - oldTx) * scaleFactor;
                transform.current.y = center.y - (center.y - oldTy) * scaleFactor;
                transform.current.scale *= scaleFactor;
            }

            // Update stats
            lastTouchDistance.current = dist;
            lastTouchCenter.current = center;

            render();
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (isDrawing.current && e.touches.length === 0) {
            // End Drawing
            isDrawing.current = false;
            if (currentStroke.current) {
                strokes.current.push(currentStroke.current);
                currentStroke.current = null;
            }
            render();
            scheduleCapture();
        } else if (isGesturing.current && e.touches.length < 2) {
            // End Gesture (lifted one finger)
            isGesturing.current = false;
            // Optionally could switch back to drawing if 1 finger remains, but usually better to stop stroke to avoid jumping
        }
    };

    const clearCanvas = () => {
        strokes.current = [];
        // Optionally reset transform? No, user might want to stay zoomed.
        // transform.current = { x: 0, y: 0, scale: 1 }; 
        render();
        setMessages([]);
    };

    return (
        <div className="relative w-full h-full bg-white dark:bg-zinc-950 rounded-xl overflow-hidden shadow-sm border border-border">
            {/* Conversation Overlay */}
            <Conversation messages={messages} />

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="w-full h-full touch-none cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
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

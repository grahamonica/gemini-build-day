"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Pencil, Trash2, Video, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation, Message } from "./Conversation";

interface Point {
    x: number;
    y: number;
}

interface Frame {
    imageData: string;
    timestamp: number;
}

export function Whiteboard() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(3);
    const [messages, setMessages] = useState<Message[]>([]);
    const [frames, setFrames] = useState<Frame[]>([]);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    // Timing refs
    const dragStartTime = useRef<number>(0);
    const idleTimer = useRef<NodeJS.Timeout | null>(null);
    const lastPoint = useRef<Point | null>(null);
    const frameCaptureInterval = useRef<NodeJS.Timeout | null>(null);
    
    // Video generation cancellation
    const abortControllerRef = useRef<AbortController | null>(null);
    const gifInstanceRef = useRef<any>(null);
    const isCancelledRef = useRef<boolean>(false);

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

                    // Fill with white background
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            }
        };

        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, [color, brushSize]);

    // Prevent scrolling
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const preventDefault = (e: TouchEvent) => e.preventDefault();

        canvas.addEventListener('touchstart', preventDefault, { passive: false });
        canvas.addEventListener('touchmove', preventDefault, { passive: false });
        canvas.addEventListener('touchend', preventDefault, { passive: false });

        return () => {
            canvas.removeEventListener('touchstart', preventDefault);
            canvas.removeEventListener('touchmove', preventDefault);
            canvas.removeEventListener('touchend', preventDefault);
        };
    }, []);

    // Update context
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.strokeStyle = color;
            ctx.lineWidth = brushSize;
        }
    }, [color, brushSize]);

    const captureAndSend = async () => {
        if (!canvasRef.current) return;

        const imageData = canvasRef.current.toDataURL("image/png");
        const newMessageId = Date.now().toString();

        // Optimistically add user message
        const userMsg: Message = { role: 'user', content: imageData, id: newMessageId };
        setMessages(prev => [...prev, userMsg]);

        try {
            // We need to send history. For now, let's just send the current image + history text?
            // Or better, send the whole history including previous images if we want true multi-modal context.
            // For MVP efficiency, maybe we just send the new image and text history?
            // Check API route plan: "Expect messages array".

            const response = await fetch("/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: imageData,
                    history: messages // Send previous context
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
            // Optionally remove the optimistically added message or show error
        }
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        // Clear any pending idle timer because user is interacting again
        if (idleTimer.current) {
            clearTimeout(idleTimer.current);
            idleTimer.current = null;
        }

        setIsDrawing(true);
        dragStartTime.current = Date.now();

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
        if (!isDrawing) return;
        setIsDrawing(false);
        lastPoint.current = null;

        const dragDuration = Date.now() - dragStartTime.current;

        // Logic: specific time threshold for "work unit"
        if (dragDuration > 500) {
            // Schedule capture
            idleTimer.current = setTimeout(() => {
                captureAndSend();
            }, 1000); // 1s pause
        }
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
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        setMessages([]); // Clear conversation on canvas clear? Maybe optional.
        setFrames([]); // Clear frames when canvas is cleared
        setVideoUrl(null); // Clear video URL
    };

    // Capture frame periodically while drawing
    const startFrameCapture = useCallback(() => {
        if (frameCaptureInterval.current) return; // Already capturing
        
        frameCaptureInterval.current = setInterval(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            const imageData = canvas.toDataURL("image/png");
            setFrames((prev: Frame[]) => {
                const newFrame: Frame = {
                    imageData,
                    timestamp: Date.now()
                };
                // Only keep frames from the last 5 minutes to avoid memory issues
                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                const filtered = prev.filter((f: Frame) => f.timestamp > fiveMinutesAgo);
                return [...filtered, newFrame];
            });
        }, 500); // Capture every 500ms
    }, []);

    const stopFrameCapture = useCallback(() => {
        if (frameCaptureInterval.current) {
            clearInterval(frameCaptureInterval.current);
            frameCaptureInterval.current = null;
        }
    }, []);

    // Start capturing frames when user starts drawing
    useEffect(() => {
        if (isDrawing) {
            startFrameCapture();
        } else {
            // Continue capturing for a bit after drawing stops
            const timeout = setTimeout(() => {
                stopFrameCapture();
            }, 2000);
            return () => clearTimeout(timeout);
        }
    }, [isDrawing, startFrameCapture, stopFrameCapture]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopFrameCapture();
        };
    }, [stopFrameCapture]);

    const cancelVideoGeneration = useCallback(() => {
        isCancelledRef.current = true;
        
        // Cancel fetch request if active
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        
        // Cancel GIF generation if active
        if (gifInstanceRef.current) {
            try {
                // GIF.js doesn't have a direct cancel method, but we can stop it
                gifInstanceRef.current = null;
            } catch (e) {
                // Ignore errors
            }
        }
        
        setIsGeneratingVideo(false);
    }, []);

    const generateVideo = async () => {
        if (!canvasRef.current || frames.length === 0) {
            alert("No drawing history to create video from. Please draw something first.");
            return;
        }

        setIsGeneratingVideo(true);
        setVideoUrl(null);
        isCancelledRef.current = false;
        abortControllerRef.current = new AbortController();
        gifInstanceRef.current = null;

        try {
            // Capture current state as final frame
            const currentFrame = canvasRef.current.toDataURL("image/png");
            const allFrames = [...frames, { imageData: currentFrame, timestamp: Date.now() }];

            // Check if cancelled before starting
            if (isCancelledRef.current) {
                return;
            }

            // Try server-side video generation first
            try {
                const response = await fetch("/api/nano-banana", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        frames: allFrames.map(f => f.imageData)
                    }),
                    signal: abortControllerRef.current.signal,
                });

                // Check if cancelled after fetch
                if (isCancelledRef.current) {
                    return;
                }

                if (response.ok) {
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("video")) {
                        const blob = await response.blob();
                        
                        // Check if cancelled before setting video
                        if (isCancelledRef.current) {
                            return;
                        }
                        
                        const url = URL.createObjectURL(blob);
                        setVideoUrl(url);
                        setIsGeneratingVideo(false);
                        return; // Success!
                    }
                }

                // If server-side fails, check error and decide on fallback
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || "Server-side generation failed";
                
                // Only fall back to GIF if it's a configuration issue (no API key)
                // Otherwise show the error
                if (errorMessage.includes("NANO_BANANA_API_KEY") || errorMessage.includes("not configured")) {
                    throw new Error(errorMessage + ". Please add NANO_BANANA_API_KEY to your .env.local file.");
                } else {
                    // For other API errors, try GIF fallback as backup
                    console.log("Nano Banana API error, trying GIF fallback:", errorMessage);
                    // Fall through to client-side generation
                }
            } catch (serverError: any) {
                // Check if it was a cancellation
                if (serverError.name === 'AbortError' || isCancelledRef.current) {
                    console.log("Video generation cancelled");
                    return;
                }
                
                // If it's a configuration error, don't fall back to GIF
                if (serverError.message?.includes("NANO_BANANA_API_KEY") || 
                    serverError.message?.includes("not configured")) {
                    throw serverError;
                }
                
                // For other errors, try GIF fallback
                console.log("Server error, trying GIF fallback:", serverError.message);
                // Fall through to client-side generation
            }

            // Check if cancelled before starting GIF generation
            if (isCancelledRef.current) {
                return;
            }

            // Client-side GIF generation fallback
            const GIF = (await import("gif.js")).default;
            const gif = new GIF({
                workers: 2,
                quality: 10,
                width: canvasRef.current.width,
                height: canvasRef.current.height,
            });
            
            gifInstanceRef.current = gif;

            // Generate GIF asynchronously
            const gifPromise = new Promise<Blob>((resolve, reject) => {
                // Check for cancellation periodically
                const checkCancellation = () => {
                    if (isCancelledRef.current) {
                        reject(new Error("Cancelled"));
                    }
                };

                gif.on("finished", (blob: Blob) => {
                    checkCancellation();
                    if (!isCancelledRef.current) {
                        resolve(blob);
                    }
                });
                gif.on("progress", (p: number) => {
                    checkCancellation();
                });

                // Load all frames as images and add to GIF
                let loadedCount = 0;
                const totalFrames = allFrames.length;

                if (totalFrames === 0) {
                    reject(new Error("No frames to generate GIF"));
                    return;
                }

                allFrames.forEach((frame) => {
                    // Check cancellation before processing each frame
                    if (isCancelledRef.current) {
                        return;
                    }
                    
                    const img = new Image();
                    img.onload = () => {
                        if (isCancelledRef.current) return;
                        
                        gif.addFrame(img, { delay: 500 }); // 500ms delay between frames
                        loadedCount++;
                        if (loadedCount === totalFrames && !isCancelledRef.current) {
                            gif.render();
                        }
                    };
                    img.onerror = () => {
                        loadedCount++;
                        if (loadedCount === totalFrames && !isCancelledRef.current) {
                            // Try to render even if some frames failed
                            try {
                                gif.render();
                            } catch (e) {
                                if (!isCancelledRef.current) {
                                    reject(new Error("Failed to generate GIF"));
                                }
                            }
                        }
                    };
                    img.src = frame.imageData;
                });
            });

            const blob = await gifPromise;
            
            // Final cancellation check
            if (isCancelledRef.current) {
                return;
            }
            
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
            setIsGeneratingVideo(false);
        } catch (error: any) {
            // Don't show error if it was cancelled
            if (error.name === 'AbortError' || error.message === "Cancelled" || isCancelledRef.current) {
                console.log("Video generation cancelled by user");
                return;
            }
            
            console.error("Error generating video:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to generate video. Please try again.";
            alert(errorMessage);
            setIsGeneratingVideo(false);
        } finally {
            // Cleanup
            abortControllerRef.current = null;
            gifInstanceRef.current = null;
        }
    };

    // Cleanup video generation on unmount
    useEffect(() => {
        return () => {
            if (isGeneratingVideo) {
                cancelVideoGeneration();
            }
        };
    }, [isGeneratingVideo, cancelVideoGeneration]);

    return (
        <div className="relative w-full h-full bg-white dark:bg-zinc-950 rounded-xl overflow-hidden shadow-sm border border-border">
            {/* Conversation Overlay */}
            <Conversation messages={messages} />

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
            <div className="absolute top-4 left-4 flex items-center gap-2 p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-full shadow-lg border border-border z-20">
                <button
                    onClick={() => setColor("#000000")}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#000000" && "bg-zinc-100 dark:bg-zinc-800")}
                >
                    <Pencil className="w-5 h-5 text-black dark:text-white" />
                </button>
                <button
                    onClick={() => setColor("#ef4444")}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#ef4444" && "bg-zinc-100 dark:bg-zinc-800")}
                >
                    <div className="w-5 h-5 rounded-full bg-red-500 border border-zinc-200" />
                </button>
                <button
                    onClick={() => setColor("#ffffff")}
                    className={cn("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", color === "#ffffff" && "bg-zinc-100 dark:bg-zinc-800")}
                >
                    <Eraser className="w-5 h-5" />
                </button>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />

                {isGeneratingVideo ? (
                    <>
                        <button
                            onClick={cancelVideoGeneration}
                            className="p-2 rounded-full transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                            title="Cancel video generation"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-1 px-2 text-xs text-zinc-600 dark:text-zinc-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Generating...</span>
                        </div>
                    </>
                ) : (
                    <button
                        onClick={generateVideo}
                        disabled={frames.length === 0}
                        className={cn(
                            "p-2 rounded-full transition-colors flex items-center gap-2",
                            frames.length === 0
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        )}
                        title="Nano Banana - Create animated video"
                    >
                        <Video className="w-5 h-5" />
                    </button>
                )}

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />

                <button
                    onClick={clearCanvas}
                    className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* Video Player */}
            {videoUrl && (
                <div className="absolute bottom-4 left-4 right-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-xl shadow-lg border border-border z-20 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold">Generated Video</h3>
                        <button
                            onClick={() => setVideoUrl(null)}
                            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        >
                            ×
                        </button>
                    </div>
                    <video
                        src={videoUrl}
                        controls
                        className="w-full rounded-lg"
                        autoPlay
                    />
                    <a
                        href={videoUrl}
                        download="whiteboard-animation.mp4"
                        className="mt-2 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Download Video
                    </a>
                </div>
            )}
        </div>
    );
}

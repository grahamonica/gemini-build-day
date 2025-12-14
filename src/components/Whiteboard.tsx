"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Pencil, Trash2, Video, Loader2, X, Share2, Download, Copy, Check, Gauge, Image as ImageIcon, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { Message } from "./Conversation";
import { CRTVisualization3D } from "./CRTVisualization3D";
import { Binomial3D } from "./Binomial3D";

interface Point {
    x: number;
    y: number;
}

interface Frame {
    imageData: string;
    timestamp: number;
}

interface WhiteboardProps {
    onCapture?: (imageData: string) => void;
    onClear?: () => void;
}

export function Whiteboard({ onCapture, onClear }: WhiteboardProps = {}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(3);
    // Messages kept for video name generation (optional, can be removed if not needed)
    const [messages] = useState<Message[]>([]);
    const [frames, setFrames] = useState<Frame[]>([]);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoProgress, setVideoProgress] = useState<number>(0);
    const [videoMethod, setVideoMethod] = useState<"nano-banana" | "media-recorder" | null>(null);
    const [showVideoModal, setShowVideoModal] = useState<boolean>(false);
    const [videoName, setVideoName] = useState<string>("whiteboard-animation");
    const [copied, setCopied] = useState<boolean>(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isGeneratingVisualization, setIsGeneratingVisualization] = useState<boolean>(false);
    const [visualizationImage, setVisualizationImage] = useState<string | null>(null);
    const [showVisualizationModal, setShowVisualizationModal] = useState<boolean>(false);
    const [show3DVisualization, setShow3DVisualization] = useState<boolean>(false);
    const [binomialData, setBinomialData] = useState<{
        type?: string;
        expression?: string;
        coefficients?: number[];
        terms?: string[];
        degree?: number;
    } | null>(null);

    // Timing refs
    const dragStartTime = useRef<number>(0);
    const idleTimer = useRef<NodeJS.Timeout | null>(null);
    const lastPoint = useRef<Point | null>(null);
    const frameCaptureInterval = useRef<NodeJS.Timeout | null>(null);

    // Video generation cancellation
    const abortControllerRef = useRef<AbortController | null>(null);
    const gifInstanceRef = useRef<any>(null);
    const isCancelledRef = useRef<boolean>(false);

    // MediaRecorder for efficient video recording
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const isRecordingRef = useRef<boolean>(false);

    // Track if we should capture on next draw
    const shouldCaptureRef = useRef<boolean>(false);
    
    // Track frame count when video was last generated
    const lastVideoFrameCountRef = useRef<number>(0);
    
    // Throttle frame capture - only capture every 500ms
    const lastCaptureTimeRef = useRef<number>(0);
    const CAPTURE_INTERVAL = 500; // Capture frame every 500ms

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

        // Mark that we should capture after the next draw
        shouldCaptureRef.current = true;
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

        // Capture frame after each stroke/movement (this is like a "keystroke" for drawing)
        if (shouldCaptureRef.current) {
            captureFrame();
            shouldCaptureRef.current = true; // Keep capturing for continuous strokes
        }
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        lastPoint.current = null;
        shouldCaptureRef.current = false;

        // Capture final frame when stroke ends
        captureFrame();

        const dragDuration = Date.now() - dragStartTime.current;

        console.log("stopDrawing: Drag duration:", dragDuration, "ms");

        // Logic: Debounce capture to "end of thought"
        // We wait for a pause in drawing to capture, regardless of stroke duration
        if (onCapture) {
            // Schedule capture
            console.log("stopDrawing: Scheduling capture in 2 seconds");
            idleTimer.current = setTimeout(() => {
                console.log("stopDrawing: Timer fired, calling onCapture");
                if (canvasRef.current) {
                    const imageData = canvasRef.current.toDataURL("image/png");
                    onCapture(imageData);
                }
            }, 2000);
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
        // Messages are now managed at page level, no need to clear here
        setFrames([]); // Clear frames when canvas is cleared
        setVideoUrl(null); // Clear video URL
        setShowVideoModal(false); // Close modal
        recordedChunksRef.current = []; // Clear recorded chunks
        stopRecording(); // Stop any active recording
        lastVideoFrameCountRef.current = 0; // Reset video frame count

        if (onClear) onClear();
    };

    // Start recording canvas using MediaRecorder (more efficient)
    const startRecording = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || isRecordingRef.current) return;

        try {
            // Get stream from canvas
            const stream = canvas.captureStream(2); // 2 fps for smooth playback

            // Create MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 2500000 // 2.5 Mbps
            });

            recordedChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                // Video is ready, no need to process
                console.log("Recording stopped, video chunks:", recordedChunksRef.current.length);
            };

            mediaRecorder.start(1000); // Collect data every second
            mediaRecorderRef.current = mediaRecorder;
            isRecordingRef.current = true;

            console.log("Started recording canvas");
        } catch (error) {
            console.error("Error starting MediaRecorder:", error);
        }
    }, []);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecordingRef.current) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            isRecordingRef.current = false;
            console.log("Stopped recording");
        }
    }, []);

    // Capture frame function with throttling
    const captureFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const now = Date.now();
        // Throttle: only capture if enough time has passed since last capture
        if (now - lastCaptureTimeRef.current < CAPTURE_INTERVAL) {
            return;
        }
        
        lastCaptureTimeRef.current = now;
        
        const imageData = canvas.toDataURL("image/png");
        setFrames((prev: Frame[]) => {
            const newFrame: Frame = {
                imageData,
                timestamp: now
            };
            // Only keep frames from the last 5 minutes to avoid memory issues
            const fiveMinutesAgo = now - 5 * 60 * 1000;
            const filtered = prev.filter((f: Frame) => f.timestamp > fiveMinutesAgo);
            return [...filtered, newFrame];
        });
        console.log("Frame captured, total frames:", frames.length + 1);
    }, [frames.length]);

    const stopFrameCapture = useCallback(() => {
        if (frameCaptureInterval.current) {
            clearInterval(frameCaptureInterval.current);
            frameCaptureInterval.current = null;
        }
    }, []);


    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopFrameCapture();
        };
    }, [stopFrameCapture]);

    // Generate video name based on conversation context
    const generateVideoName = useCallback(() => {
        if (messages.length === 0) {
            return "whiteboard-animation";
        }

        // Extract text from AI messages to understand the topic
        const aiMessages = messages
            .filter(msg => msg.role === 'model')
            .map(msg => msg.content)
            .join(' ')
            .toLowerCase();

        // Try to extract key topics (simple keyword extraction)
        const keywords = aiMessages
            .split(/[^\w]+/)
            .filter(word => word.length > 4)
            .slice(0, 3);

        if (keywords.length > 0) {
            return keywords.join('-') + '-whiteboard';
        }

        // Fallback to date-based name
        const date = new Date().toISOString().split('T')[0];
        return `whiteboard-${date}`;
    }, [messages]);

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
        setVideoProgress(0);
        setVideoMethod(null);
    }, []);

    const generate3DBinomial = async () => {
        if (!canvasRef.current) {
            alert("Canvas not available. Please draw something on the whiteboard first.");
            return;
        }

        // Capture the current whiteboard canvas
        const canvasImage = canvasRef.current.toDataURL("image/png");
        
        // Check if canvas is empty
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hasContent = imageData.data.some((pixel, index) => {
                if (index % 4 === 3) {
                    const alpha = pixel;
                    const r = imageData.data[index - 3];
                    const g = imageData.data[index - 2];
                    const b = imageData.data[index - 1];
                    return alpha > 0 && !(r === 255 && g === 255 && b === 255);
                }
                return false;
            });

            if (!hasContent) {
                alert("Whiteboard is empty. Please draw a binomial or graph first.");
                return;
            }
        }

        try {
            // Call API endpoint to analyze the whiteboard
            const response = await fetch("/api/analyze-binomial", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: canvasImage }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to analyze whiteboard");
            }

            const parsedData = await response.json();

            // Set the binomial data and show 3D visualization
            setBinomialData(parsedData);
            setShow3DVisualization(true);
        } catch (error) {
            console.error("Error generating 3D binomial:", error);
            alert("Failed to analyze whiteboard for binomial. Using default visualization.");
            // Use default binomial data
            setBinomialData({
                type: "binomial",
                expression: "(x + y)³",
                degree: 3,
                coefficients: [1, 3, 3, 1],
                terms: ["x³", "3x²y", "3xy²", "y³"]
            });
            setShow3DVisualization(true);
        }
    };

    const generateVisualization = async () => {
        setIsGeneratingVisualization(true);
        setVisualizationImage(null);

        try {
            // Capture the current whiteboard canvas
            if (!canvasRef.current) {
                throw new Error("Canvas not available. Please draw something on the whiteboard first.");
            }

            const canvasImage = canvasRef.current.toDataURL("image/png");
            
            // Check if canvas is empty (all white/transparent)
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasContent = imageData.data.some((pixel, index) => {
                    // Check alpha channel (every 4th value) and non-white pixels
                    if (index % 4 === 3) {
                        const alpha = pixel;
                        const r = imageData.data[index - 3];
                        const g = imageData.data[index - 2];
                        const b = imageData.data[index - 1];
                        // Not transparent and not white
                        return alpha > 0 && !(r === 255 && g === 255 && b === 255);
                    }
                    return false;
                });

                if (!hasContent) {
                    throw new Error("Whiteboard is empty. Please draw something first before generating a visualization.");
                }
            }

            const response = await fetch("/api/nano-banana-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    image: canvasImage,
                    prompt: "Enhance and improve this technical diagram, making it cleaner and more professional while preserving all the key elements and annotations."
                }),
            });

            if (!response.ok) {
                let errorMessage = `Server error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    // Build a comprehensive error message
                    if (errorData.error) {
                        errorMessage = errorData.error;
                        if (errorData.details) {
                            errorMessage += `\n\nDetails: ${errorData.details}`;
                        }
                        if (errorData.alternatives && Array.isArray(errorData.alternatives)) {
                            errorMessage += `\n\nAlternatives:\n${errorData.alternatives.map((alt: string, i: number) => `${i + 1}. ${alt}`).join('\n')}`;
                        }
                        if (errorData.note) {
                            errorMessage += `\n\nNote: ${errorData.note}`;
                        }
                    } else if (errorData.details) {
                        errorMessage = errorData.details;
                    }
                    console.error("API error details:", errorData);
                } catch (e) {
                    const errorText = await response.text().catch(() => "");
                    console.error("API error text:", errorText);
                    if (errorText) {
                        try {
                            const parsed = JSON.parse(errorText);
                            errorMessage = parsed.error || parsed.details || errorMessage;
                        } catch {
                            errorMessage = errorText || errorMessage;
                        }
                    }
                }
                throw new Error(errorMessage);
            }

            // Check if response is JSON (error) or image blob
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to generate visualization");
            }

            // Get the image as blob
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            setVisualizationImage(imageUrl);
            setShowVisualizationModal(true);
        } catch (error) {
            console.error("Error generating visualization:", error);
            alert("Failed to generate visualization: " + (error instanceof Error ? error.message : "Unknown error"));
        } finally {
            setIsGeneratingVisualization(false);
        }
    };

    const generateVideo = async () => {
        if (!canvasRef.current || frames.length === 0) {
            alert("No frames captured. Please draw something first!");
            return;
        }

        // Check if there are new frames since last video generation
        if (frames.length <= lastVideoFrameCountRef.current) {
            alert("No new drawing since last video. Please draw something new to generate a new video!");
            return;
        }

        setIsGeneratingVideo(true);
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoMethod("media-recorder");
        isCancelledRef.current = false;

        try {
            // Add current canvas state as final frame
            const currentFrame = canvasRef.current.toDataURL("image/png");
            const allFrames = [...frames, { imageData: currentFrame, timestamp: Date.now() }];

            console.log(`Generating video from ${allFrames.length} frames...`);
            setVideoProgress(10);

            // Use canvas.captureStream() for smooth video generation
            const canvas = canvasRef.current;

            // Create a temporary canvas to replay frames
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) throw new Error("Could not get context");

            const tempStream = tempCanvas.captureStream(30);
            const mediaRecorder = new MediaRecorder(tempStream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 2500000
            });

            const chunks: Blob[] = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoUrl(url);
                setVideoName(generateVideoName());
                setVideoProgress(100);
                setIsGeneratingVideo(false);
                setVideoMethod(null);
                // Update the frame count when video is successfully generated
                lastVideoFrameCountRef.current = frames.length;
                setShowVideoModal(true);
            };

            // Start recording
            mediaRecorder.start();
            setVideoProgress(30);

            // Replay frames onto temp canvas
            const frameDuration = 100; // ms per frame (10 fps playback)
            for (let i = 0; i < allFrames.length; i++) {
                if (isCancelledRef.current) {
                    mediaRecorder.stop();
                    return;
                }

                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        tempCtx.drawImage(img, 0, 0);
                        setVideoProgress(Math.round(30 + (i / allFrames.length) * 60));
                        setTimeout(resolve, frameDuration);
                    };
                    img.onerror = () => resolve(); // Skip failed frames
                    img.src = allFrames[i].imageData;
                });
            }

            // Stop recording
            setVideoProgress(90);
            mediaRecorder.stop();

        } catch (error) {
            console.error("Error generating video:", error);
            alert("Failed to generate video: " + (error instanceof Error ? error.message : "Unknown error"));
            setIsGeneratingVideo(false);
            setVideoProgress(0);
            setVideoMethod(null);
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
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-full">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="font-medium">Generating {videoProgress}%</span>
                        </div>
                    </>
                ) : (
                    <button
                        onClick={generateVideo}
                        disabled={frames.length === 0 || isGeneratingVideo || frames.length <= lastVideoFrameCountRef.current}
                        className={cn(
                            "p-2 rounded-full transition-colors flex items-center gap-2",
                            frames.length === 0 || isGeneratingVideo || frames.length <= lastVideoFrameCountRef.current
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        )}
                        title={
                            frames.length === 0
                                ? "No frames captured. Draw something first!"
                                : frames.length <= lastVideoFrameCountRef.current
                                    ? "No new drawing since last video. Draw something new!"
                                    : `Generate video (${frames.length} frames captured)`
                        }
                    >
                        <Video className="w-5 h-5" />
                        <span className="text-sm">{frames.length}</span>
                    </button>
                )}

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />

                <button
                    onClick={generateVisualization}
                    disabled={isGeneratingVisualization}
                    className={cn(
                        "p-2 rounded-full transition-colors",
                        isGeneratingVisualization
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                    )}
                    title="Generate problem visualization"
                >
                    {isGeneratingVisualization ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <ImageIcon className="w-5 h-5" />
                    )}
                </button>

                <button
                    onClick={generate3DBinomial}
                    className="p-2 rounded-full transition-colors hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                    title="Generate 3D binomial visualization from whiteboard"
                >
                    <Box className="w-5 h-5" />
                </button>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />

                <button
                    onClick={clearCanvas}
                    className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* Video Modal */}
            {showVideoModal && videoUrl && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setShowVideoModal(false)}
                >
                    <div
                        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                Whiteboard Animation ({frames.length} frames)
                            </h2>
                            <button
                                onClick={() => {
                                    setShowVideoModal(false);
                                    setVideoUrl(null);
                                }}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Video Player */}
                        <div className="flex-1 p-4 overflow-auto bg-zinc-50 dark:bg-zinc-950">
                            <video
                                ref={videoRef}
                                src={videoUrl || undefined}
                                controls
                                autoPlay
                                loop
                                className="w-full rounded-lg shadow-lg"
                                onLoadedMetadata={() => {
                                    if (videoRef.current) {
                                        videoRef.current.playbackRate = playbackSpeed;
                                    }
                                }}
                            />
                        </div>

                        {/* Actions */}
                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                            {/* Playback Speed Control */}
                            <button
                                onClick={() => {
                                    const speeds = [1, 2, 3, 4, 5];
                                    const currentIndex = speeds.indexOf(playbackSpeed);
                                    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
                                    setPlaybackSpeed(nextSpeed);
                                    if (videoRef.current) {
                                        videoRef.current.playbackRate = nextSpeed;
                                    }
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                                title="Change playback speed"
                            >
                                <Gauge className="w-4 h-4" />
                                <span className="text-sm font-medium">{playbackSpeed}x</span>
                            </button>
                            
                            <button
                                onClick={async () => {
                                    if (navigator.share && videoUrl) {
                                        try {
                                            const blob = await fetch(videoUrl).then(r => r.blob());
                                            const file = new File([blob], `${videoName}.webm`, { type: blob.type });
                                            await navigator.share({
                                                title: videoName,
                                                files: [file]
                                            });
                                        } catch (err) {
                                            // If share fails or is cancelled, try copying the URL
                                            if (err instanceof Error && err.name !== 'AbortError') {
                                                try {
                                                    await navigator.clipboard.writeText(videoUrl);
                                                    alert("Video URL copied to clipboard!");
                                                } catch (clipboardErr) {
                                                    console.error("Share and clipboard copy failed:", clipboardErr);
                                                }
                                            }
                                        }
                                    } else if (videoUrl) {
                                        // Fallback: copy URL to clipboard
                                        try {
                                            await navigator.clipboard.writeText(videoUrl);
                                            alert("Video URL copied to clipboard!");
                                        } catch (err) {
                                            console.error("Failed to copy URL:", err);
                                        }
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                            >
                                <Share2 className="w-4 h-4" />
                                <span>Share</span>
                            </button>
                            <a
                                href={videoUrl || undefined}
                                download="whiteboard-animation.webm"
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors ml-auto"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download Video</span>
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Visualization Modal */}
            {showVisualizationModal && visualizationImage && (
                <div 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => {
                        setShowVisualizationModal(false);
                        setVisualizationImage(null);
                    }}
                >
                    <div 
                        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                Problem Visualization
                            </h2>
                            <button
                                onClick={() => {
                                    setShowVisualizationModal(false);
                                    setVisualizationImage(null);
                                }}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Image */}
                        <div className="flex-1 p-4 overflow-auto bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
                            <img
                                src={visualizationImage}
                                alt="Problem visualization"
                                className="max-w-full max-h-full rounded-lg shadow-lg"
                            />
                        </div>

                        {/* Actions */}
                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                            <a
                                href={visualizationImage}
                                download="problem-visualization.png"
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors ml-auto"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download Image</span>
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* 3D Visualization Modal */}
            {show3DVisualization && (
                binomialData ? (
                    <Binomial3D 
                        onClose={() => {
                            setShow3DVisualization(false);
                            setBinomialData(null);
                        }} 
                        binomialData={binomialData}
                    />
                ) : (
                    <CRTVisualization3D onClose={() => setShow3DVisualization(false)} />
                )
            )}
        </div>
    );
}
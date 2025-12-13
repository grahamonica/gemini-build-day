"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Pencil, Trash2, Video, Loader2, X, Share2, Download, Copy, Check } from "lucide-react";
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
    const [videoProgress, setVideoProgress] = useState<number>(0);
    const [videoMethod, setVideoMethod] = useState<"ffmpeg" | "media-recorder" | null>(null);
    const [showVideoModal, setShowVideoModal] = useState<boolean>(false);
    const [videoName, setVideoName] = useState<string>("whiteboard-animation");
    const [copied, setCopied] = useState<boolean>(false);

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
        if (!canvasRef.current) {
            console.log("captureAndSend: No canvas available");
            return;
        }

        console.log("captureAndSend: Starting capture and send");
        const imageData = canvasRef.current.toDataURL("image/png");
        const newMessageId = Date.now().toString();

        // Optimistically add user message
        const userMsg: Message = { role: 'user', content: imageData, id: newMessageId };
        setMessages(prev => [...prev, userMsg]);
        console.log("captureAndSend: User message added, sending to API...");

        try {
            const response = await fetch("/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: imageData,
                    history: messages // Send previous context
                }),
            });

            console.log("captureAndSend: Response received", response.status, response.statusText);

            if (!response.ok) {
                // Try to get error message from response
                let errorMessage = `Server error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (e) {
                    // If response isn't JSON, use status text
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            console.log("captureAndSend: Response data:", data);

            if (!data || !data.text) {
                console.error("captureAndSend: Invalid response data:", data);
                throw new Error("Invalid response from server");
            }

            const aiMsg: Message = {
                role: 'model',
                content: data.text,
                id: (Date.now() + 1).toString()
            };
            console.log("captureAndSend: Adding AI message:", aiMsg.content);
            setMessages(prev => {
                const updated = [...prev, aiMsg];
                console.log("captureAndSend: Updated messages:", updated.length);
                return updated;
            });

        } catch (error) {
            console.error("Error in captureAndSend:", error);
            
            // Don't remove user message if it's a quota error (user should see their message)
            const errorMessage = error instanceof Error ? error.message : "Failed to get AI response";
            
            // Only remove user message for non-quota errors
            if (!errorMessage.includes("quota") && !errorMessage.includes("429")) {
                setMessages(prev => prev.filter(msg => msg.id !== newMessageId));
            }
            
            // Show user-friendly error message
            let displayMessage = errorMessage;
            if (errorMessage.includes("quota") || errorMessage.includes("429")) {
                displayMessage = "⚠️ API quota exceeded. The free tier has daily limits. Please:\n\n• Wait a few minutes and try again\n• Check your Google Cloud Console for quota limits\n• Consider upgrading your billing account for higher quotas";
            } else if (errorMessage.includes("API_KEY")) {
                displayMessage = "❌ API key error. Please check your GEMINI_API_KEY in .env.local";
            }
            
            const errorMsg: Message = {
                role: 'model',
                content: displayMessage,
                id: (Date.now() + 1).toString()
            };
            setMessages(prev => [...prev, errorMsg]);
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

        console.log("stopDrawing: Drag duration:", dragDuration, "ms");

        // Logic: specific time threshold for "work unit"
        // Increased threshold and delay to reduce API calls and avoid quota limits
        if (dragDuration > 1000) { // Only capture if drawing for at least 1 second
            // Schedule capture with longer delay to batch requests
            console.log("stopDrawing: Scheduling capture in 2 seconds");
            idleTimer.current = setTimeout(() => {
                console.log("stopDrawing: Timer fired, calling captureAndSend");
                captureAndSend();
            }, 2000); // 2s pause to reduce frequency
        } else {
            console.log("stopDrawing: Drag too short, not capturing");
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
        setShowVideoModal(false); // Close modal
        recordedChunksRef.current = []; // Clear recorded chunks
        stopRecording(); // Stop any active recording
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
            // Fallback to frame capture if MediaRecorder fails
            startFrameCapture();
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
    
    // Frame capture - captures every 2 seconds
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
        }, 2000); // Capture every 2 seconds
    }, []);

    const stopFrameCapture = useCallback(() => {
        if (frameCaptureInterval.current) {
            clearInterval(frameCaptureInterval.current);
            frameCaptureInterval.current = null;
        }
    }, []);

    // Start frame capture when user starts drawing
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

    const generateVideo = async () => {
        if (!canvasRef.current) {
            alert("No canvas available.");
            return;
        }

        setIsGeneratingVideo(true);
        setVideoUrl(null);
        setVideoProgress(0);
        setVideoMethod("media-recorder");
        isCancelledRef.current = false;
        abortControllerRef.current = new AbortController();
        gifInstanceRef.current = null;

        try {
            // Check if cancelled before starting
            if (isCancelledRef.current) {
                return;
            }

            // First, try to use recorded video from MediaRecorder
            if (recordedChunksRef.current.length > 0 && !isRecordingRef.current) {
                setVideoProgress(50);
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoUrl(url);
                setVideoName(generateVideoName());
                setIsGeneratingVideo(false);
                setVideoProgress(0);
                setVideoMethod(null);
                setShowVideoModal(true);
                return;
            }

            // If no recording available, fall back to frame-based generation
            if (frames.length === 0) {
                alert("No drawing history to create video from. Please draw something first.");
                setIsGeneratingVideo(false);
                setVideoMethod(null);
                return;
            }

            setVideoMethod("ffmpeg");
            setVideoProgress(10);
            
            // Capture current state as final frame
            const currentFrame = canvasRef.current.toDataURL("image/png");
            const allFrames = [...frames, { imageData: currentFrame, timestamp: Date.now() }];

            // Try server-side video generation with FFmpeg
            try {
                setVideoMethod("ffmpeg");
                setVideoProgress(10); // Starting
                
                // Simulate progress during processing
                const progressInterval = setInterval(() => {
                    if (!isCancelledRef.current && isGeneratingVideo) {
                        setVideoProgress(prev => {
                            // Gradually increase from 10% to 80% while processing
                            if (prev < 80) {
                                return Math.min(80, prev + 3);
                            }
                            return prev;
                        });
                    }
                }, 300);
                
                const response = await fetch("/api/nano-banana", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        frames: allFrames.map(f => f.imageData)
                    }),
                    signal: abortControllerRef.current.signal,
                });

                clearInterval(progressInterval);

                // Check if cancelled after fetch
                if (isCancelledRef.current) {
                    return;
                }

                if (response.ok) {
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("video")) {
                        setVideoProgress(90); // Video received
                        const blob = await response.blob();
                        
                        // Check if cancelled before setting video
                        if (isCancelledRef.current) {
                            return;
                        }
                        
                        setVideoProgress(100); // Complete
                        const url = URL.createObjectURL(blob);
                        setVideoUrl(url);
                        setVideoName(generateVideoName());
                        setIsGeneratingVideo(false);
                        setVideoProgress(0);
                        setVideoMethod(null);
                        setShowVideoModal(true); // Show modal
                        return; // Success!
                    }
                }

                // If server-side fails, check error and decide on fallback
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || "Server-side generation failed";
                
                console.log("FFmpeg response:", { status: response.status, error: errorMessage });
                
                // Show clear error message instead of falling back to GIF
                throw new Error(errorMessage);
            } catch (serverError: any) {
                // Check if it was a cancellation
                if (serverError.name === 'AbortError' || isCancelledRef.current) {
                    console.log("Video generation cancelled");
                    return;
                }
                
                // Show error to user - no GIF fallback
                throw serverError;
            }
        } catch (error: any) {
            // Don't show error if it was cancelled
            if (error.name === 'AbortError' || error.message === "Cancelled" || isCancelledRef.current) {
                console.log("Video generation cancelled by user");
                return;
            }
            
            console.error("Error generating video:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to generate video. Please try again.";
            
            // Show error in a more user-friendly way
            if (errorMessage.includes("ffmpeg") || errorMessage.includes("FFmpeg")) {
                const detailedMessage = `FFmpeg is required for video generation.\n\nTo install:\n1. Open Terminal\n2. Run: brew install ffmpeg\n\nOr download from: https://evermeet.cx/ffmpeg/\n\nAfter installing, restart your dev server.`;
                alert(detailedMessage);
            } else {
                alert(errorMessage);
            }
            
            setIsGeneratingVideo(false);
            setVideoProgress(0);
            setVideoMethod(null);
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
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-full">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="font-medium">Generating {videoProgress}%</span>
                            {videoMethod && (
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-semibold",
                                    videoMethod === "media-recorder"
                                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                        : videoMethod === "ffmpeg" 
                                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                        : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                )}>
                                    {videoMethod === "media-recorder" ? "Recording" : "FFmpeg"}
                                </span>
                            )}
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
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={videoName}
                                    onChange={(e) => setVideoName(e.target.value)}
                                    className="text-lg font-semibold bg-transparent border-none outline-none w-full text-zinc-900 dark:text-zinc-100"
                                    placeholder="Video name"
                                />
                            </div>
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
                        <div className="flex-1 p-4 overflow-auto">
                            <video
                                src={videoUrl}
                                controls
                                className="w-full rounded-lg"
                                autoPlay
                            />
                        </div>

                        {/* Actions */}
                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                            <button
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(videoUrl);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    } catch (err) {
                                        console.error("Failed to copy:", err);
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        <span>Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        <span>Copy Link</span>
                                    </>
                                )}
                            </button>

                            <button
                                onClick={async () => {
                                    if (navigator.share && videoUrl) {
                                        try {
                                            const blob = await fetch(videoUrl).then(r => r.blob());
                                            const file = new File([blob], `${videoName}.mp4`, { type: blob.type });
                                            await navigator.share({
                                                title: videoName,
                                                files: [file]
                                            });
                                        } catch (err) {
                                            console.error("Share failed:", err);
                                        }
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                            >
                                <Share2 className="w-4 h-4" />
                                <span>Share</span>
                            </button>

                            <a
                                href={videoUrl}
                                download={`${videoName}.mp4`}
                                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors ml-auto"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download</span>
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

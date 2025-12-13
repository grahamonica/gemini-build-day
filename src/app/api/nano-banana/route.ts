import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function POST(req: NextRequest) {
    try {
        const { frames } = await req.json();

        if (!frames || !Array.isArray(frames) || frames.length === 0) {
            return NextResponse.json(
                { error: "No frames provided" },
                { status: 400 }
            );
        }

        // Create temp directory for frames
        const tempDir = join(process.cwd(), "temp", "frames");
        if (!existsSync(tempDir)) {
            await mkdir(tempDir, { recursive: true });
        }

        // Save frames as images
        const framePaths: string[] = [];
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const base64Data = frame.split(",")[1] || frame;
            const framePath = join(tempDir, `frame-${i.toString().padStart(6, "0")}.png`);
            await writeFile(framePath, Buffer.from(base64Data, "base64"));
            framePaths.push(framePath);
        }

        // Use ffmpeg to create video from frames
        try {
            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);

            const outputPath = join(process.cwd(), "temp", `video-${Date.now()}.mp4`);
            const outputDir = join(process.cwd(), "temp");
            if (!existsSync(outputDir)) {
                await mkdir(outputDir, { recursive: true });
            }

            // Use ffmpeg to create video (2 fps - each frame shows for 0.5 seconds)
            // This creates a smooth timelapse of the drawing process
            const ffmpegCommand = `ffmpeg -y -framerate 2 -i "${join(tempDir, "frame-%06d.png")}" -c:v libx264 -pix_fmt yuv420p -r 30 "${outputPath}"`;

            try {
                await execAsync(ffmpegCommand);
            } catch (ffmpegError: any) {
                console.error("FFmpeg error:", ffmpegError);
                throw new Error("FFmpeg not available. Please install ffmpeg for video generation.");
            }

            // Read the generated video
            const videoBuffer = await readFile(outputPath);

            // Cleanup temp files
            for (const framePath of framePaths) {
                try {
                    await unlink(framePath);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
            try {
                await unlink(outputPath);
            } catch (e) {
                // Ignore cleanup errors
            }

            return new NextResponse(videoBuffer, {
                headers: {
                    "Content-Type": "video/mp4",
                    "Content-Disposition": "attachment; filename=whiteboard-animation.mp4",
                },
            });
        } catch (error: any) {
            // If ffmpeg is not available, provide helpful error message
            if (error.message.includes("FFmpeg")) {
                return NextResponse.json(
                    { 
                        error: "Video generation requires ffmpeg. Please install it: brew install ffmpeg (Mac) or apt-get install ffmpeg (Linux)",
                        details: error.message
                    },
                    { status: 500 }
                );
            }
            throw error;
        }
    } catch (error: any) {
        console.error("Error generating video:", error);
        
        // Handle abort errors (user cancellation)
        if (error.name === 'AbortError') {
            return NextResponse.json(
                { error: "Video generation was cancelled" },
                { status: 499 }
            );
        }
        
        return NextResponse.json(
            { 
                error: "Internal Server Error during video generation",
                details: error.message
            },
            { status: 500 }
        );
    }
}

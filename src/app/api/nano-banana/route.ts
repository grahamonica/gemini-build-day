import { NextRequest, NextResponse } from "next/server";

const NANO_BANANA_API_KEY = process.env.NANO_BANANA_API_KEY;
const NANO_BANANA_BASE_URL = "https://nanobananavideo.com/api/v1";

// Helper function to poll video status
async function pollVideoStatus(videoId: string, maxAttempts: number = 60): Promise<any> {
    const apiKey = NANO_BANANA_API_KEY;
    if (!apiKey) {
        throw new Error("NANO_BANANA_API_KEY is not configured");
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const statusResponse = await fetch(
                `${NANO_BANANA_BASE_URL}/video-status.php?video_id=${videoId}`,
                {
                    method: "GET",
                    headers: {
                        "X-API-Key": apiKey,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!statusResponse.ok) {
                throw new Error(`Status check failed: ${statusResponse.statusText}`);
            }

            const statusData = await statusResponse.json();

            if (statusData.success && statusData.status === "completed") {
                return statusData;
            }

            if (statusData.status === "failed") {
                throw new Error(statusData.error || "Video generation failed");
            }

            // Wait 2 seconds before next poll
            await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error: any) {
            if (attempt === maxAttempts - 1) {
                throw error;
            }
            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    throw new Error("Video generation timeout - took too long");
}

// Helper function to upload image and get URL
// Since Nano Banana expects image URLs, we'll need to either:
// 1. Upload to a temporary hosting service, or
// 2. Use a data URL if the API supports it
// For now, we'll try sending base64 data directly
async function uploadImageToNanoBanana(imageData: string): Promise<string> {
    // Try to use the image directly - if API doesn't support base64,
    // we'll need to upload to a temporary service first
    // For now, return the data URL as-is and let the API handle it
    return imageData;
}

export async function POST(req: NextRequest) {
    try {
        if (!NANO_BANANA_API_KEY) {
            return NextResponse.json(
                { error: "NANO_BANANA_API_KEY is not configured. Please add it to your .env.local file." },
                { status: 500 }
            );
        }

        const { frames } = await req.json();

        if (!frames || !Array.isArray(frames) || frames.length === 0) {
            return NextResponse.json(
                { error: "No frames provided" },
                { status: 400 }
            );
        }

        // Use the final frame (most complete drawing) as the main image
        const finalFrame = frames[frames.length - 1];
        const imageData = finalFrame;

        // Nano Banana API requires publicly accessible image URLs
        // Upload the image to our temporary hosting endpoint first
        const uploadResponse = await fetch(
            `${req.nextUrl.origin}/api/upload-image`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ imageData }),
            }
        );

        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json().catch(() => ({}));
            return NextResponse.json(
                { 
                    error: "Failed to upload image for video generation",
                    details: errorData.error
                },
                { status: 500 }
            );
        }

        const { imageUrl } = await uploadResponse.json();

        // Call Nano Banana image-to-video API
        const requestBody: any = {
            image_urls: [imageUrl], // Try sending base64 data URL
            prompt: "Animate this whiteboard drawing showing the drawing process",
            resolution: "1080p",
            duration: Math.min(10, Math.max(3, frames.length * 0.5)), // Duration based on frame count
            aspect_ratio: "16:9",
        };

        // If base64 doesn't work, we'll need to upload to a hosting service first
        // For now, try the API call
        const response = await fetch(`${NANO_BANANA_BASE_URL}/image-to-video.php`, {
            method: "POST",
            headers: {
                "X-API-Key": NANO_BANANA_API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Nano Banana API error:", errorText);
            
            // If the API doesn't accept base64, we need to upload the image first
            if (response.status === 400 && errorText.includes("image")) {
                // Fallback: Upload image to a temporary service or use a different approach
                // For now, return a helpful error
                return NextResponse.json(
                    { 
                        error: "Image upload format not supported. The API may require a publicly accessible image URL. Please check Nano Banana API documentation.",
                        details: errorText
                    },
                    { status: 400 }
                );
            }
            
            return NextResponse.json(
                { 
                    error: "Nano Banana API request failed",
                    details: errorText,
                    status: response.status
                },
                { status: response.status }
            );
        }

        const result = await response.json();

        if (!result.success) {
            return NextResponse.json(
                { 
                    error: result.error || "Video generation failed",
                    details: result
                },
                { status: 500 }
            );
        }

        // If video is ready immediately, return it
        if (result.video_url && result.status === "completed") {
            // Fetch the video and return it
            const videoResponse = await fetch(result.video_url);
            if (!videoResponse.ok) {
                return NextResponse.json(
                    { error: "Failed to fetch generated video" },
                    { status: 500 }
                );
            }

            const videoBuffer = await videoResponse.arrayBuffer();
            return new NextResponse(videoBuffer, {
                headers: {
                    "Content-Type": "video/mp4",
                    "Content-Disposition": "attachment; filename=whiteboard-animation.mp4",
                },
            });
        }

        // If video is being processed, poll for status
        if (result.video_id) {
            const finalResult = await pollVideoStatus(result.video_id);
            
            if (finalResult.video_url) {
                // Fetch the video and return it
                const videoResponse = await fetch(finalResult.video_url);
                if (!videoResponse.ok) {
                    return NextResponse.json(
                        { error: "Failed to fetch generated video" },
                        { status: 500 }
                    );
                }

                const videoBuffer = await videoResponse.arrayBuffer();
                return new NextResponse(videoBuffer, {
                    headers: {
                        "Content-Type": "video/mp4",
                        "Content-Disposition": "attachment; filename=whiteboard-animation.mp4",
                    },
                });
            }
        }

        return NextResponse.json(
            { error: "Video generation completed but no video URL was returned" },
            { status: 500 }
        );
    } catch (error: any) {
        console.error("Error generating video with Nano Banana:", error);
        
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

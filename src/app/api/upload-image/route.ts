import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Temporary image hosting for Nano Banana API
// Nano Banana requires publicly accessible image URLs
export async function POST(req: NextRequest) {
    try {
        const { imageData } = await req.json();

        if (!imageData) {
            return NextResponse.json(
                { error: "No image data provided" },
                { status: 400 }
            );
        }

        // Extract base64 data
        const base64Data = imageData.split(",")[1] || imageData;
        
        // Create temp directory
        const tempDir = join(process.cwd(), "public", "temp-images");
        if (!existsSync(tempDir)) {
            const fs = await import("fs");
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Generate unique filename
        const filename = `img-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        const filepath = join(tempDir, filename);

        // Save image
        await writeFile(filepath, Buffer.from(base64Data, "base64"));

        // Return public URL
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                       (req.headers.get("host") ? `http://${req.headers.get("host")}` : "http://localhost:3000");
        const imageUrl = `${baseUrl}/temp-images/${filename}`;

        // Schedule cleanup after 1 hour
        setTimeout(async () => {
            try {
                await unlink(filepath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }, 60 * 60 * 1000);

        return NextResponse.json({ imageUrl });
    } catch (error) {
        console.error("Error uploading image:", error);
        return NextResponse.json(
            { error: "Failed to upload image" },
            { status: 500 }
        );
    }
}


import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
    if (!apiKey) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not defined" },
            { status: 500 }
        );
    }

    try {
        const { image } = await req.json();

        if (!image) {
            return NextResponse.json(
                { error: "No image provided" },
                { status: 400 }
            );
        }

        // Image comes as "data:image/png;base64,..."
        // We need to strip the prefix
        const base64Data = image.split(",")[1];

        if (!base64Data) {
            return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
        }

        // Save image for debugging in development
        if (process.env.NODE_ENV === "development") {
            try {
                const fs = await import("fs");
                const path = await import("path");

                const debugDir = path.join(process.cwd(), "debug-images");
                if (!fs.existsSync(debugDir)) {
                    fs.mkdirSync(debugDir, { recursive: true });
                }

                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const filename = `solve-request-${timestamp}.png`;
                const filepath = path.join(debugDir, filename);

                fs.writeFileSync(filepath, Buffer.from(base64Data, "base64"));
                console.log(`Saved debug image to: ${filepath}`);
            } catch (err) {
                console.error("Failed to save debug image:", err);
            }
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = "Solve this math problem. Return ONLY the final answer in a short, clear format (e.g., 'x = 5' or '42'). If it's a complex expression, simplify it.";

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png",
                },
            },
        ]);

        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ text });
    } catch (error) {
        console.error("Error processing with Gemini:", error);
        return NextResponse.json(
            { error: "Internal Server Error during AI processing" },
            { status: 500 }
        );
    }
}

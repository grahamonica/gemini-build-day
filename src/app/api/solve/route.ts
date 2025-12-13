import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Content, Part } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
    if (!apiKey) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not defined" },
            { status: 500 }
        );
    }

    try {
        const { image, history } = await req.json();

        if (!image) {
            return NextResponse.json(
                { error: "No image provided" },
                { status: 400 }
            );
        }

        // Parse history to Gemini Content format
        // Frontend sends: { role: 'user' | 'model', content: string }[]
        const chatHistory: Content[] = (history || []).map((msg: any) => {
            const parts: Part[] = [];
            if (msg.role === 'user') {
                // Determine if content is image or text. 
                // In our current app, user messages are ALWAYS images (base64 data URLs)
                // But we need to strip prefix if present.
                const contentStr = msg.content as string;
                if (contentStr.startsWith('data:image')) {
                    const base64 = contentStr.split(',')[1];
                    parts.push({
                        inlineData: {
                            data: base64,
                            mimeType: "image/png"
                        }
                    });
                } else {
                    parts.push({ text: contentStr });
                }
            } else {
                // Model is text
                parts.push({ text: msg.content });
            }

            return {
                role: msg.role,
                parts: parts
            };
        });

        // Current image
        const base64Data = image.split(",")[1];
        if (!base64Data) {
            return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
        }

        // Save image to filesystem
        try {
            const fs = await import("fs");
            const path = await import("path");

            const snapshotDir = path.join(process.cwd(), "public", "snapshots");
            if (!fs.existsSync(snapshotDir)) {
                fs.mkdirSync(snapshotDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `snapshot-${timestamp}.png`;
            const filepath = path.join(snapshotDir, filename);

            fs.writeFileSync(filepath, Buffer.from(base64Data, "base64"));
            console.log(`Saved snapshot to: ${filepath}`);
        } catch (err) {
            console.error("Failed to save snapshot:", err);
            // Non-critical, continue with AI processing
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash", // Using latest fast model
            systemInstruction: "You are a supportive math tutor. The user is writing on a whiteboard. Review the latest snapshot of their work. Provide very brief, encouraging feedback or a gentle scaffolding question to guide them. Do NOT give the solution immediately. Keep your responses short (1-2 sentences). If the work is correct and finished, say 'Nice job!'. If they are stuck, ask a hint question."
        });

        const chat = model.startChat({
            history: chatHistory,
        });

        const result = await chat.sendMessage([
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png",
                },
            },
            // We can add a text prompt to reinforce instructions if needed, but system instruction handles it.
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

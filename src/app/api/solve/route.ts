import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Content, Part, SchemaType } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
    if (!apiKey) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not defined" },
            { status: 500 }
        );
    }

    try {
        const { image, history, isReply, replyText } = await req.json();

        if (!image) {
            return NextResponse.json(
                { error: "No image provided" },
                { status: 400 }
            );
        }

        const base64Data = image.split(",")[1];
        if (!base64Data) {
            return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
        }

        // Parse history to Gemini Content format
        const parsedHistory: Content[] = (history || []).map((msg: any) => {
            const parts: Part[] = [];
            // Basic text parsing for now as stored messages are simple
            parts.push({ text: msg.content });
            return {
                role: msg.role,
                parts: parts
            };
        });

        // Gemini Chat History MUST start with User.
        // Our Threads start with Model (the comment).
        // So we must prepend the Snapshot as the first User message.
        // BUT only if we are in a Thread context (which implies history exists or isReply is true).
        // If history is empty and !isReply, it's a new snapshot, so history is [] and we send image as current message.

        const outputHistory: Content[] = [];

        if (isReply || parsedHistory.length > 0) {
            // Prepend the context image as the first user message
            outputHistory.push({
                role: 'user',
                parts: [{
                    inlineData: {
                        data: base64Data,
                        mimeType: "image/png"
                    }
                }]
            });
            // Add the rest of the conversation
            outputHistory.push(...parsedHistory);
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `You are a supportive math tutor. The user is writing on a whiteboard.
            
            Context:
            - The conversation starts with a snapshot of the whiteboard.
            - You (the model) may have commented on it.
            - The user may be replying to you.

            Your Goal: Provide helpful feedback via comments.
            
            Rules:
            1. If "isReply" is true (User replied to you), ANSWER their question directly and concisely.
            2. If "isReply" is false (Just a snapshot update):
               - Provide brief, encouraging feedback or a gentle question to guide them.
               - If work is correct, say something positive like "Good progress!" or "Nice work!"
               - If there's a mistake, point it out gently.
               - If they're stuck, ask a helpful question.
               - Always provide a comment (never return null).
            
            Output Format:
            Return valid JSON with a single field "comment" which is a string (never null).
            `,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        comment: {
                            type: SchemaType.STRING,
                            nullable: false,
                        }
                    },
                    required: ["comment"]
                }
            }
        });

        const chat = model.startChat({
            history: outputHistory,
        });

        // Construct the message to send NOW
        let messageParts: Part[] = [];

        if (isReply) {
            // User is replying with text. 
            // The image is already in history (Turn 1).
            // We just send the text.
            messageParts.push({ text: replyText });
        } else {
            // New Snapshot case.
            // History is empty (or we are starting fresh).
            // We send the Image.
            // Wait, if outputHistory was empty, startChat([]) is fine.
            // And we send image here.
            messageParts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png",
                }
            });
            messageParts.push({ text: "[Automated snapshot update]" });
        }

        const result = await chat.sendMessage(messageParts);
        const response = await result.response;
        const jsonText = response.text();

        console.log("Gemini raw response:", jsonText);

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
            console.log("Parsed JSON:", parsed);
        } catch (e) {
            console.error("Failed to parse JSON from model", jsonText);
            parsed = { comment: jsonText };
        }

        const comment = parsed.comment;
        console.log("Returning comment:", comment);

        return NextResponse.json({
            comment: comment,
        });

    } catch (error) {
        console.error("Error processing with Gemini:", error);
        
        // Provide more specific error messages
        let errorMessage = "Internal Server Error during AI processing";
        let statusCode = 500;
        
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        
        // Check for specific Gemini API errors
        if (errorMessage.includes("API_KEY") || errorMessage.includes("api key") || errorMessage.includes("API key")) {
            errorMessage = "Invalid or missing GEMINI_API_KEY. Please check your .env.local file.";
            statusCode = 401;
        } else if (errorMessage.includes("quota") || errorMessage.includes("rate limit") || errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
            errorMessage = "API quota exceeded. The free tier has limits. Please wait a few minutes or upgrade your Google Cloud billing account for higher quotas.";
            statusCode = 429;
        } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
            errorMessage = "Network error. Please check your internet connection.";
            statusCode = 503;
        }
        
        return NextResponse.json(
            { error: errorMessage },
            { status: statusCode }
        );
    }
}

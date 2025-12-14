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
               - Only comment if necessary (mistake, completion, helpful hint).
               - If work is in progress and looks ok, return null.
            
            Output Format:
            Return valid JSON with a single field "comment" which is either a string or null.
            `,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        comment: {
                            type: SchemaType.STRING,
                            nullable: true,
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

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse JSON from model", jsonText);
            parsed = { comment: jsonText };
        }

        return NextResponse.json({
            comment: parsed.comment,
        });

    } catch (error) {
        console.error("Error processing with Gemini:", error);
        return NextResponse.json(
            { error: "Internal Server Error during AI processing" },
            { status: 500 }
        );
    }
}

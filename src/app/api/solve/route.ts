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
        const { image, history, isReply, replyText, existingTopics } = await req.json();

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

        // Separate System Prompts and Schemas for the two modes


        // 1. Snapshot Mode: Evaluate the board, start new threads if needed.
        const snapshotSystemPrompt = `You are a supportive math tutor watching a user write on a whiteboard.

            Context:
            - The conversation starts with a snapshot of the whiteboard.
            - You are "watching" the board updates.

            Your Goal: Evaluate the work.Provide helpful feedback via comments ONLY if necessary.Do not give the user the answer, only provide feedback to steer them towards the right answer.
            
            Rules:
            1. Only comment if necessary(mistake, completion, helpful hint).
            2. If work is in progress and looks ok, return null.
            3. If you comment, simple "Good job" is discouraged unless the problem is fully solved.
            
            Output Format:
            Return valid JSON with:
            - "comment": string or null
            - "topic": string or null(Short 2 - 5 word title for the thread if a comment is generated)
        `;

        const snapshotSchema = {
            type: SchemaType.OBJECT,
            properties: {
                comment: {
                    type: SchemaType.STRING,
                    nullable: true,
                },
                topic: {
                    type: SchemaType.STRING,
                    nullable: true,
                }
            },
            required: ["comment", "topic"]
        };

        // 2. Reply Mode: Continue an existing conversation/thread.
        const replySystemPrompt = `You are a supportive math tutor.The user is replying to a comment you made on their whiteboard.

            Context:
        - This is an existing thread.
            - You should reply to the user's message.

            Your Goal: Answer their question directly and concisely.Do not give the user the answer, only provide feedback to steer them towards the right answer.
            
            Output Format:
            Return valid JSON with:
        - "comment": string(Your response)
            `;

        const replySchema = {
            type: SchemaType.OBJECT,
            properties: {
                comment: {
                    type: SchemaType.STRING,
                    nullable: false,
                }
            },
            required: ["comment"]
        };

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: isReply ? replySystemPrompt : snapshotSystemPrompt,
            generationConfig: {
                responseMimeType: "application/json",
                // @ts-ignore - The types for Schema are slightly finicky in some versions, but this structure is correct.
                responseSchema: isReply ? replySchema : snapshotSchema
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

        // Check redundancy if we have a new thread proposal (comment + topic) and not a reply
        let { comment, topic } = parsed;

        if (!isReply && comment && topic && existingTopics && existingTopics.length > 0) {
            try {
                const redundancyModel = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: SchemaType.OBJECT,
                            properties: {
                                redundant: { type: SchemaType.BOOLEAN }
                            },
                            required: ["redundant"]
                        }
                    }
                });

                const prompt = `
                New Topic: "${topic}"
                Existing Topics: ${JSON.stringify(existingTopics)}
                
                Is the New Topic redundant with any of the Existing Topics ?
            If it is semantically very similar or covers the same ground, return true.
                `;

                const result = await redundancyModel.generateContent(prompt);
                const check = JSON.parse(result.response.text());

                if (check.redundant) {
                    console.log(`Topic "${topic}" rejected as redundant.`);
                    comment = null;
                    topic = null;
                }
            } catch (err) {
                console.error("Redundancy check failed:", err);
                // Fail open? Or fail closed? Let's fail open (allow the comment) to be safe.
            }
        }

        return NextResponse.json({
            comment: comment,
            topic: topic
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

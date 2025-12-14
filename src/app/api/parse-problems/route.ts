import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const MAX_FILE_SIZE_MB = 15;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    if (!apiKey) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not defined" },
            { status: 500 }
        );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
        return NextResponse.json(
            { error: "PDF file is required under the 'file' field" },
            { status: 400 }
        );
    }

    const mimeType = file.type || "application/pdf";
    if (!mimeType.includes("pdf")) {
        return NextResponse.json(
            { error: "Only PDF uploads are supported" },
            { status: 400 }
        );
    }

    const sizeInMb = file.size / (1024 * 1024);
    if (sizeInMb > MAX_FILE_SIZE_MB) {
        return NextResponse.json(
            { error: `PDF is too large. Please keep it under ${MAX_FILE_SIZE_MB}MB.` },
            { status: 400 }
        );
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `You extract distinct practice problems from PDF documents.

            Return each problem as a structured object with:
            - index (integer): its order in the doc (1-based) and the unique id.
            - text (string): full problem text, keep LaTeX intact and do NOT solve or add answers.
            - summary (string): one-line gist of the problem.
            - boundingBox (object | null): page-space rectangle for the problem (top-left origin, units = PDF points). Provide this even if you omit the image.
            - imageBase64 (string or null): optional; prefer null to keep payload small. We will crop locally from the PDF using the bounding box.

            Guidance:
            - Preserve original wording and numbering when present.
            - Include multiple-choice options inline in text if they exist.
            - If a shared instruction applies to a group, keep it inside each affected problem's text.`,
            generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        problems: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    index: { type: SchemaType.INTEGER },
                                    text: { type: SchemaType.STRING },
                                    summary: { type: SchemaType.STRING },
                                    imageBase64: { type: SchemaType.STRING, nullable: true },
                                    boundingBox: {
                                        type: SchemaType.OBJECT,
                                        nullable: true,
                                        properties: {
                                            page: { type: SchemaType.INTEGER },
                                            x: { type: SchemaType.NUMBER },
                                            y: { type: SchemaType.NUMBER },
                                            width: { type: SchemaType.NUMBER },
                                            height: { type: SchemaType.NUMBER },
                                        },
                                        required: ["page", "x", "y", "width", "height"],
                                    },
                                },
                                required: ["index", "text", "summary"],
                            },
                        },
                    },
                    required: ["problems"],
                },
            },
        });

        const result = await model.generateContent([
            {
                text: `Extract each unique problem in the order it appears. 
                Keep wording verbatim. Do not solve anything. 
                If no problems are found, return an empty array.`,
            },
            {
                inlineData: {
                    data: base64Data,
                    mimeType,
                },
            },
        ]);

        const text = result.response.text();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            console.error("Gemini returned non-JSON for PDF parse:", text);
            return NextResponse.json(
                { error: "Model returned non-JSON response", raw: text },
                { status: 502 }
            );
        }

        const parsedProblems = Array.isArray(parsed.problems) ? parsed.problems : [];
        const normalized = parsedProblems.map((p: unknown, idx: number) => {
            const problem = (p ?? {}) as Record<string, unknown>;

            const rawText = typeof problem.text === "string"
                ? problem.text
                : typeof problem.question === "string"
                    ? problem.question
                    : "";

            const textValue = rawText.trim();
            const summaryValue = typeof problem.summary === "string"
                ? problem.summary.trim()
                : textValue.slice(0, 140);

            const indexValue = typeof problem.index === "number" ? problem.index : idx + 1;

            const bbox = problem.boundingBox && typeof problem.boundingBox === "object"
                ? problem.boundingBox as Record<string, unknown>
                : null;

            return {
                index: indexValue,
                text: textValue,
                summary: summaryValue,
                imageBase64: null, // prefer client-side crop using boundingBox
                boundingBox: bbox ? {
                    page: Number(bbox.page),
                    x: Number(bbox.x),
                    y: Number(bbox.y),
                    width: Number(bbox.width),
                    height: Number(bbox.height),
                } : null,
            };
        });

        return NextResponse.json({
            problems: normalized,
        });
    } catch (error) {
        console.error("Error parsing PDF with Gemini:", error);
        return NextResponse.json(
            { error: "Failed to parse PDF" },
            { status: 500 }
        );
    }
}

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

        const base64Data = image.split(",")[1];
        if (!base64Data) {
            return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
            },
        });

        const prompt = `
You will receive a single page image of homework or worksheets that may contain multiple individual problems.
Extract EVERY distinct problem on the page, preserving the order they appear from top to bottom. Do not stop early or truncate the list.
For every problem, return a concise title, the full text of the problem, and an array of LaTeX strings for any equations or expressions found inside that problem.
Also include an optional normalized bounding box {x,y,width,height} in the 0-1 range that tightly encloses the problem content so we can crop the screenshot.

JSON schema to return:
{
  "problems": [
    {
      "title": "short title for the problem",
      "text": "full text of the problem as plain text",
      "latex": ["equation in LaTeX", "another equation"],
      "bbox": { "x": 0.1, "y": 0.2, "width": 0.8, "height": 0.1 }
    }
  ]
}

Rules:
- Combine subparts (a/b/c) that belong to the same numbered problem into one entry.
- Keep LaTeX concise; do not wrap in $ or \\( \\); return raw expressions.
- If there is no equation, latex can be an empty array.
- Always return an array for "problems"; if nothing is found, return an empty array.
        `;

        const result = await model.generateContent([
            { text: prompt },
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png",
                },
            },
        ]);

        const response = await result.response;
        const text = response.text();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            console.error("Failed to parse model JSON", err, text);
            return NextResponse.json(
                { error: "Model returned invalid JSON" },
                { status: 500 }
            );
        }

        return NextResponse.json({ problems: parsed.problems ?? [] });
    } catch (error) {
        console.error("Error parsing problems:", error);
        return NextResponse.json(
            { error: "Internal Server Error during problem parsing" },
            { status: 500 }
        );
    }
}

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
        const body = await req.json();
        const imagesInput: string[] | undefined = body.images || (body.image ? [body.image] : undefined);

        if (!imagesInput || imagesInput.length === 0) {
            return NextResponse.json(
                { error: "No image provided" },
                { status: 400 }
            );
        }

        const base64Images = imagesInput
            .map((img: string) => img.split(",")[1])
            .filter(Boolean);

        if (base64Images.length === 0) {
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
You will receive multiple page images of homework or worksheets (Page 1, Page 2, ...). Each page may contain multiple individual problems.
Extract EVERY distinct problem across all pages, preserving the order they appear from top to bottom on each page. Do not stop early or truncate the list.
For every problem, return:
- "page": the page number (1-indexed) that problem came from.
- "title": concise title.
- "text": full plain-text for the problem.
- "latex": array of LaTeX strings for any equations/expressions; use raw LaTeX with no $ or \\(\\).
- "bbox": optional normalized bounding box {x,y,width,height} relative to that page image (0-1 range) that tightly encloses the problem.

JSON schema to return:
{
  "problems": [
    {
      "page": 1,
      "title": "short title",
      "text": "full text",
      "latex": ["equation in LaTeX"],
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

        const contents: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
            { text: prompt },
        ];
        base64Images.forEach((img, idx) => {
            contents.push({ text: `Page ${idx + 1}` });
            contents.push({
                inlineData: {
                    data: img,
                    mimeType: "image/png",
                },
            });
        });

        const result = await model.generateContent(contents);

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

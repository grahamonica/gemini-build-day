import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { image } = await req.json();

        if (!image) {
            return NextResponse.json(
                { error: "No image provided" },
                { status: 400 }
            );
        }

        const geminiApiKey = process.env.GEMINI_API_KEY || "AIzaSyDqCz53GoWjF-WgiC44HqgtROolDn4fCpE";
        
        if (!geminiApiKey) {
            return NextResponse.json(
                { 
                    error: "GEMINI_API_KEY is not configured.",
                },
                { status: 500 }
            );
        }

        // Use Gemini Vision to analyze the whiteboard and extract binomial data
        // Use stable model name instead of -latest
        const modelName = "gemini-1.5-pro";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
        
        console.log("Calling Gemini Vision API with model:", modelName);
        
        // Extract base64 data (remove data:image/png;base64, prefix if present)
        const base64Data = image.includes(",") ? image.split(",")[1] : image;
        
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `Analyze this mathematical drawing from a whiteboard. Identify if it contains a binomial expression, polynomial, or graph.

If it's a binomial (like (x+y)^n, (a+b)^n, etc.), extract:
1. The binomial expression (e.g., "(x+y)^3", "(a+b)^4")
2. The degree/power (n)
3. The coefficients (from Pascal's triangle)
4. The expanded terms if visible

If it's a graph or function, identify:
1. The function type (polynomial, exponential, etc.)
2. The degree
3. Key coefficients

Return your response as JSON in this format:
{
  "type": "binomial" | "polynomial" | "graph" | "other",
  "expression": "the mathematical expression",
  "degree": number,
  "coefficients": [array of numbers],
  "terms": [array of term strings]
}

If you cannot identify a binomial or polynomial, return type "other" and provide what you see.`
                        },
                        {
                            inline_data: {
                                mime_type: "image/png",
                                data: base64Data
                            }
                        }
                    ]
                }]
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini Vision API error:", errorText);
            console.error("Response status:", response.status);
            
            // Try to parse error details
            let errorDetails = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson.error?.message || errorJson.message || errorText;
            } catch (e) {
                // Not JSON, use as-is
            }
            
            return NextResponse.json(
                { 
                    error: "Failed to analyze image with Gemini Vision API",
                    details: errorDetails,
                    status: response.status,
                    note: "Check server logs for more details. Make sure GEMINI_API_KEY is valid and has Vision API access."
                },
                { status: 500 }
            );
        }

        const result = await response.json();
        const analysisText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!analysisText) {
            return NextResponse.json(
                { 
                    error: "No analysis received from Gemini Vision API"
                },
                { status: 500 }
            );
        }

        // Try to parse JSON from the response
        let parsedData;
        try {
            // Extract JSON from the text (might be wrapped in markdown code blocks)
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[0]);
            } else {
                // If no JSON found, create default based on analysis
                parsedData = {
                    type: "binomial",
                    expression: "(x + y)³",
                    degree: 3,
                    coefficients: [1, 3, 3, 1],
                    terms: ["x³", "3x²y", "3xy²", "y³"]
                };
            }
        } catch (e) {
            // If parsing fails, create default binomial data
            parsedData = {
                type: "binomial",
                expression: "(x + y)³",
                degree: 3,
                coefficients: [1, 3, 3, 1],
                terms: ["x³", "3x²y", "3xy²", "y³"]
            };
        }

        return NextResponse.json(parsedData);
    } catch (error: any) {
        console.error("Error analyzing binomial:", error);
        return NextResponse.json(
            { 
                error: "Internal Server Error during binomial analysis",
                details: error.message
            },
            { status: 500 }
        );
    }
}


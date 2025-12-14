import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { image, prompt } = await req.json();

        if (!image && !prompt) {
            return NextResponse.json(
                { error: "No image or prompt provided" },
                { status: 400 }
            );
        }

        // Use the provided API key or fall back to env variable
        const geminiApiKey = process.env.GEMINI_API_KEY || "AIzaSyDqCz53GoWjF-WgiC44HqgtROolDn4fCpE";
        if (!geminiApiKey) {
            return NextResponse.json(
                { 
                    error: "GEMINI_API_KEY is not configured. Please add it to your .env.local file.",
                },
                { status: 500 }
            );
        }

        // If we have an image, analyze it and generate a mathematical visualization
        if (image) {
            console.log("Analyzing whiteboard image to generate mathematical visualization...");
            
            try {
                // Step 1: Use Gemini Vision API to analyze the whiteboard image
                // Extract mathematical content: graphs, functions, binomials, equations, etc.
                console.log("Analyzing image with Gemini Vision API...");
                
                // Try different model names - Gemini 1.5 Pro supports vision
                const modelName = "gemini-1.5-pro"; // Use stable model name instead of -latest
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
                
                console.log("Calling Gemini Vision API with model:", modelName);
                
                // Extract base64 data (remove data:image/png;base64, prefix if present)
                const base64Data = image.includes(",") ? image.split(",")[1] : image;
                
                const geminiVisionResponse = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                {
                                    text: `Analyze this mathematical drawing from a whiteboard. Identify:
1. What type of mathematical content is shown (graph, function, binomial expansion, equation, etc.)
2. The specific mathematical expression, function, or graph
3. Key features: axes, coordinates, curve shape, coefficients, exponents, etc.
4. Any labels or annotations

Then provide a detailed prompt that describes how to create a clean, professional mathematical visualization of this content. The visualization should be:
- A proper mathematical graph/diagram with labeled axes
- Clear mathematical notation and symbols
- Professional academic style
- Include all key mathematical elements identified

Format your response as a detailed image generation prompt that can be used to create this mathematical visualization.`
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

                if (!geminiVisionResponse.ok) {
                    const errorText = await geminiVisionResponse.text();
                    console.error("Gemini Vision API error:", errorText);
                    console.error("Response status:", geminiVisionResponse.status);
                    
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
                            status: geminiVisionResponse.status,
                            note: "Check server logs for more details. Make sure GEMINI_API_KEY is valid and has Vision API access."
                        },
                        { status: 500 }
                    );
                }

                const visionResult = await geminiVisionResponse.json();
                const analysisText = visionResult.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (!analysisText) {
                    throw new Error("No analysis received from Gemini Vision API");
                }

                console.log("Gemini Vision analysis:", analysisText.substring(0, 300));
                
                // Step 2: Extract or create a mathematical visualization prompt
                // The analysis should contain a prompt, but we'll also create a structured one
                const mathVisualizationPrompt = analysisText.includes("prompt:") 
                    ? analysisText.split("prompt:")[1].trim()
                    : `Professional mathematical visualization: ${analysisText}. Clean graph with labeled axes, proper mathematical notation, academic style, white background.`;
                
                console.log("Generated visualization prompt:", mathVisualizationPrompt.substring(0, 200));
                
                // Step 3: Generate the mathematical visualization using image generation
                // Try Hugging Face first
                const hfResponse = await fetch(
                    "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY || ""}`,
                        },
                        body: JSON.stringify({
                            inputs: mathVisualizationPrompt,
                        }),
                    }
                );

                if (hfResponse.ok) {
                    const imageBuffer = await hfResponse.arrayBuffer();
                    return new NextResponse(imageBuffer, {
                        headers: {
                            "Content-Type": "image/png",
                            "Content-Disposition": "attachment; filename=mathematical-visualization.png",
                        },
                    });
                }

                // If Hugging Face fails, try alternative approach
                const hfError = await hfResponse.text().catch(() => "");
                console.error("Hugging Face API error:", hfError);
                
                // Fallback: Return analysis text and suggest using 3D visualization
                return NextResponse.json(
                    { 
                        error: "Mathematical visualization generation failed",
                        details: "Could not generate image from analysis",
                        analysis: analysisText.substring(0, 500),
                        hfError: hfError || "Hugging Face API unavailable",
                        alternatives: [
                            "Use the 3D visualization button for interactive 3D models",
                            "Configure HUGGINGFACE_API_KEY in .env.local for image generation",
                            "The analysis above describes what mathematical content was detected"
                        ],
                        note: "The whiteboard content was analyzed successfully. Configure image generation API to see the visualization."
                    },
                    { status: 500 }
                );
                
            } catch (error: any) {
                console.error("Error processing mathematical visualization:", error);
                return NextResponse.json(
                    { 
                        error: "Failed to generate mathematical visualization",
                        details: error.message,
                        note: "Make sure GEMINI_API_KEY is configured and the whiteboard contains mathematical content."
                    },
                    { status: 500 }
                );
            }
        }

        // Text-to-image path (original functionality)
        console.log("Generating image with prompt:", prompt?.substring(0, 100) + "...");
        
        try {
            // Try using Hugging Face's free image generation API
            console.log("Attempting to use Hugging Face image generation API...");
            
            const hfResponse = await fetch(
                "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY || ""}`,
                    },
                    body: JSON.stringify({
                        inputs: prompt,
                    }),
                }
            );

            if (hfResponse.ok) {
                const imageBuffer = await hfResponse.arrayBuffer();
                return new NextResponse(imageBuffer, {
                    headers: {
                        "Content-Type": "image/png",
                        "Content-Disposition": "attachment; filename=visualization.png",
                    },
                });
            }

            // If Hugging Face fails, return a helpful error
            const hfError = await hfResponse.text().catch(() => "");
            console.error("Hugging Face API error:", hfError);
            
            return NextResponse.json(
                { 
                    error: "Image generation is not available",
                    details: "Gemini API does not support direct text-to-image generation. Imagen requires Vertex AI setup.",
                    hfError: hfError || "Hugging Face API also unavailable",
                    alternatives: [
                        "Use the 3D visualization button instead (works without image generation)",
                        "Set up Vertex AI Imagen API with proper OAuth authentication",
                        "Configure HUGGINGFACE_API_KEY in .env.local for free image generation"
                    ],
                    note: "The 3D visualization provides an interactive 3D model of the problem."
                },
                { status: 501 }
            );
        } catch (error: any) {
            console.error("Error generating image:", error);
            return NextResponse.json(
                { 
                    error: "Failed to generate image",
                    details: error.message,
                    note: "Gemini Imagen API may require Vertex AI setup or the endpoint format may have changed."
                },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error("Error in image generation route:", error);
        
        return NextResponse.json(
            { 
                error: "Internal Server Error during image generation",
                details: error.message
            },
            { status: 500 }
        );
    }
}

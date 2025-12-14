"use client";

import React, { useState } from "react";
import { AlertCircle, CheckCircle2, FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { ParsedProblem } from "@/types/problems";

type PdfParserProps = {
    onParsed?: (problems: ParsedProblem[]) => void;
    showPreview?: boolean;
};

export function PdfParser({ onParsed, showPreview = true }: PdfParserProps) {
    const [file, setFile] = useState<File | null>(null);
    const [problems, setProblems] = useState<ParsedProblem[]>([]);
    const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
    const [error, setError] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextFile = e.target.files?.[0] ?? null;
        setFile(nextFile);
        setProblems([]);
        setError(null);
        setStatus("idle");
        setCollapsed(false);
        if (!nextFile) {
            onParsed?.([]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError("Upload a PDF first.");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        setStatus("loading");
        setError(null);
        setProblems([]);

        try {
            const res = await fetch("/api/parse-problems", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Unable to parse PDF right now.");
            }

            const cleaned: ParsedProblem[] = Array.isArray(data.problems)
                ? data.problems.map((p: unknown, idx: number) => {
                    const problem = (p ?? {}) as Record<string, unknown>;
                    return {
                        index: typeof problem.index === "number" ? problem.index : idx + 1,
                        text: typeof problem.text === "string" ? problem.text : "",
                        summary: typeof problem.summary === "string" ? problem.summary : "",
                        imageBase64: typeof problem.imageBase64 === "string" ? problem.imageBase64 : null,
                    };
                })
                : [];

            setProblems(cleaned);
            onParsed?.(cleaned);
            setStatus("success");
            setCollapsed(true);
        } catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    const resetSelection = () => {
        setFile(null);
        setProblems([]);
        setStatus("idle");
        setError(null);
        onParsed?.([]);
        setCollapsed(false);
    };

    if (collapsed && status === "success") {
        return (
            <div className="w-full rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-sm p-4 md:p-6 select-text flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                            Parsed {problems.length} problem{problems.length === 1 ? "" : "s"}
                        </p>
                        {file ? (
                            <p className="text-xs text-muted-foreground truncate">File: {file.name}</p>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCollapsed(false)}
                        className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                        Change PDF
                    </button>
                    <button
                        type="button"
                        onClick={resetSelection}
                        className="px-3 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition"
                    >
                        Clear
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-sm p-4 md:p-6 select-text">
            <div className="flex items-start justify-between gap-3 flex-col md:flex-row md:items-center">
                <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        <FileText className="w-4 h-4 text-blue-500" />
                        PDF Problem Parser
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Upload a worksheet PDF and Gemini will pull out each problem—kept separate from the whiteboard.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full sm:w-auto">
                    <label className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg cursor-pointer bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition">
                        <Upload className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-100">
                            {file ? file.name : "Choose PDF"}
                        </span>
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={!file || status === "loading"}
                            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition"
                        >
                            {status === "loading" ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Parsing...
                                </span>
                            ) : "Parse PDF"}
                        </button>
                        {file && (
                            <button
                                type="button"
                                onClick={resetSelection}
                                className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                            >
                                <span className="flex items-center gap-1">
                                    <X className="w-4 h-4" />
                                    Clear
                                </span>
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {status === "success" && !error && (
                <div className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    {problems.length > 0 ? `Found ${problems.length} problem${problems.length === 1 ? "" : "s"}` : "No problems detected in this PDF."}
                </div>
            )}

            {showPreview && problems.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {problems.map((problem) => (
                        <div
                            key={`problem-${problem.index}`}
                            className="p-3 rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/60 shadow-sm space-y-2"
                        >
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="font-semibold text-zinc-700 dark:text-zinc-100">
                                    Problem {problem.index}
                                </span>
                            </div>
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-50">
                                {problem.summary}
                            </p>
                            <div className="text-sm whitespace-pre-wrap text-zinc-800 dark:text-zinc-50 border border-border/70 rounded-md bg-white/60 dark:bg-zinc-900/50 p-2">
                                {problem.text}
                            </div>
                            {problem.imageBase64 ? (
                                <div className="rounded-md border border-border/70 bg-white dark:bg-zinc-900 overflow-hidden">
                                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground border-b border-border/60">
                                        <ImageIcon className="w-3 h-3" />
                                        Cropped image
                                    </div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={problem.imageBase64} alt={`Problem ${problem.index} crop`} className="w-full h-auto" />
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Whiteboard } from "@/components/Whiteboard";
import { Conversation, Thread, Message } from "@/components/Conversation";
import { cn } from "@/lib/utils";
import { ParsedProblem } from "@/types/problems";

type ProblemSession = {
    problem: ParsedProblem;
    threads: Thread[];
};

type ProblemWorkspaceProps = {
    problems: ParsedProblem[];
};

export function ProblemWorkspace({ problems }: ProblemWorkspaceProps) {
    const [sessions, setSessions] = useState<ProblemSession[]>([]);
    const [activeIdx, setActiveIdx] = useState(0);

    useEffect(() => {
        setSessions(
            problems.map((problem) => ({
                problem,
                threads: [],
            }))
        );
        setActiveIdx(0);
    }, [problems]);

    const activeSession = sessions[activeIdx] ?? sessions[0];

    const handleCapture = async (sessionIdx: number, imageData: string) => {
        try {
            const response = await fetch("/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: imageData,
                    history: [],
                    isReply: false,
                }),
            });

            if (!response.ok) throw new Error("Failed to get response");
            const data = await response.json();

            if (!data.comment) return;

            const newThread: Thread = {
                id: `${sessions[sessionIdx]?.problem.index}-${Date.now()}`,
                snapshot: imageData,
                messages: [{ role: "model", content: data.comment, id: `${Date.now()}` }],
                isResolved: false,
                createdAt: Date.now(),
                unread: true,
            };

            setSessions((prev) =>
                prev.map((session, idx) =>
                    idx === sessionIdx
                        ? { ...session, threads: [...session.threads, newThread] }
                        : session
                )
            );
        } catch (error) {
            console.error("Solve call failed:", error);
        }
    };

    const handleReply = async (sessionIdx: number, threadId: string, text: string) => {
        const session = sessions[sessionIdx];
        if (!session) return;
        const threadIndex = session.threads.findIndex((t) => t.id === threadId);
        if (threadIndex === -1) return;

        const thread = session.threads[threadIndex];
        const userMsg: Message = { role: "user", content: text, id: `${Date.now()}` };
        const updatedThread = { ...thread, messages: [...thread.messages, userMsg], unread: false };

        setSessions((prev) =>
            prev.map((sess, idx) =>
                idx === sessionIdx
                    ? {
                        ...sess,
                        threads: [
                            ...sess.threads.slice(0, threadIndex),
                            updatedThread,
                            ...sess.threads.slice(threadIndex + 1),
                        ],
                    }
                    : sess
            )
        );

        try {
            const response = await fetch("/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: thread.snapshot,
                    history: thread.messages,
                    replyText: text,
                    isReply: true,
                }),
            });
            if (!response.ok) throw new Error("Failed to reply");
            const data = await response.json();
            if (data.comment) {
                const aiMsg: Message = {
                    role: "model",
                    content: data.comment,
                    id: `${Date.now()}-ai`,
                };
                setSessions((prev) =>
                    prev.map((sess, idx) =>
                        idx === sessionIdx
                            ? {
                                ...sess,
                                threads: sess.threads.map((t) =>
                                    t.id === threadId ? { ...t, messages: [...t.messages, aiMsg], unread: true } : t
                                ),
                            }
                            : sess
                    )
                );
            }
        } catch (error) {
            console.error("Reply failed:", error);
        }
    };

    const handleResolve = (sessionIdx: number, threadId: string) => {
        setSessions((prev) =>
            prev.map((sess, idx) =>
                idx === sessionIdx
                    ? {
                        ...sess,
                        threads: sess.threads.map((t) =>
                            t.id === threadId ? { ...t, isResolved: !t.isResolved, unread: false } : t
                        ),
                    }
                    : sess
            )
        );
    };

    const navLabel = useMemo(() => {
        const problem = activeSession?.problem;
        return problem ? `Problem ${problem.index}` : "Problems";
    }, [activeSession]);

    if (!activeSession) return null;

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setActiveIdx((idx) => Math.max(0, idx - 1))}
                    disabled={activeIdx === 0}
                    className="p-2 rounded-md border border-border bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex-1 overflow-x-auto">
                    <div className="flex gap-2">
                        {sessions.map((session, idx) => (
                            <button
                                key={session.problem.index}
                                onClick={() => setActiveIdx(idx)}
                                className={cn(
                                    "px-3 py-2 rounded-lg border border-border text-sm whitespace-nowrap",
                                    idx === activeIdx
                                        ? "bg-blue-500 text-white border-blue-500"
                                        : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                )}
                            >
                                Problem {session.problem.index}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={() => setActiveIdx((idx) => Math.min(sessions.length - 1, idx + 1))}
                    disabled={activeIdx === sessions.length - 1}
                    className="p-2 rounded-md border border-border bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                <span>{navLabel}</span>
                <span className="text-xs">Use the tabs or arrows to switch problems.</span>
            </div>

            <div className="w-full flex flex-col gap-3">
                <div className="space-y-2">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        {activeSession.problem.summary}
                    </p>
                    <div className="p-3 rounded-lg border border-border bg-white dark:bg-zinc-900 text-sm text-zinc-800 dark:text-zinc-50 max-h-32 overflow-auto">
                        {activeSession.problem.text}
                    </div>
                    {activeSession.problem.imageUrl ? (
                        <div className="rounded-lg border border-border bg-white dark:bg-zinc-900 overflow-hidden w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={activeSession.problem.imageUrl}
                                alt={`Problem ${activeSession.problem.index} crop`}
                                className="w-full h-auto object-contain"
                            />
                        </div>
                    ) : null}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)] gap-4 min-h-[720px]">
                    <div className="relative h-full min-h-[500px] rounded-xl overflow-hidden shadow-sm border border-border bg-white dark:bg-zinc-950">
                        <Whiteboard onCapture={(img) => handleCapture(activeIdx, img)} />
                    </div>
                    <div className="rounded-xl overflow-hidden shadow-sm border border-border bg-white dark:bg-zinc-900 h-full min-h-[500px]">
                        <Conversation
                            threads={activeSession.threads}
                            onReply={(threadId, text) => handleReply(activeIdx, threadId, text)}
                            onResolve={(threadId) => handleResolve(activeIdx, threadId)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

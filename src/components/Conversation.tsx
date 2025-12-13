import React, { useEffect, useRef } from 'react';
import { cn } from "@/lib/utils";

export type Message = {
    role: 'user' | 'model';
    content: string; // For user, this is base64 image (or we can just show "Snapshot sent"). For model, text.
    id: string;
};

interface ConversationProps {
    messages: Message[];
}

export function Conversation({ messages }: ConversationProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    if (messages.length === 0) return null;

    return (
        <div
            ref={scrollRef}
            className="absolute top-4 right-4 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm rounded-xl shadow-lg border border-border flex flex-col gap-4 p-4 z-10"
        >
            {messages.map((msg) => (
                <div
                    key={msg.id}
                    className={cn(
                        "flex flex-col gap-1 max-w-[85%]",
                        msg.role === 'user' ? "self-end items-end" : "self-start items-start"
                    )}
                >
                    <div className={cn(
                        "px-3 py-2 rounded-lg text-sm",
                        msg.role === 'user'
                            ? "bg-blue-500 text-white rounded-br-none"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-none"
                    )}>
                        {msg.role === 'user' ? (
                            <span>Snapshot sent</span>
                        ) : (
                            <p>{msg.content}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

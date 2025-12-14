import React, { useEffect, useRef, useState } from 'react';
import { cn } from "@/lib/utils";
import { Check, MessageCircle, Send, X } from 'lucide-react';

export type Message = {
    role: 'user' | 'model';
    content: string;
    id: string;
};

export type Thread = {
    id: string;
    snapshot: string; // Base64 image
    messages: Message[];
    isResolved: boolean;
    createdAt: number;
    unread: boolean;
    topic: string;
};

interface ConversationProps {
    threads: Thread[];
    onReply: (threadId: string, text: string) => void;
    onResolve: (threadId: string) => void;
}

export function Conversation({ threads, onReply, onResolve }: ConversationProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showResolved, setShowResolved] = useState(false);

    const displayedThreads = threads.filter(t => showResolved ? true : !t.isResolved);

    // Auto-scroll to bottom only when new threads are added
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [threads.length]);

    if (threads.length === 0) return (
        <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center border-l border-border bg-zinc-50 dark:bg-zinc-900/50">
            Start drawing... <br /> AI will comment when it has feedback.
        </div>
    );

    return (
        <div className="h-full w-full bg-white dark:bg-zinc-900 border-l border-border flex flex-col min-h-0">
            {/* Filter Header */}
            <div className="flex-none h-10 border-b border-border flex items-center justify-end px-2 bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm">
                <button
                    onClick={() => setShowResolved(!showResolved)}
                    className="text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-muted-foreground font-medium"
                >
                    <Check className={cn("w-3.5 h-3.5", showResolved ? "text-green-500" : "text-zinc-400")} />
                    {showResolved ? "Hide Resolved" : "Show Resolved"}
                </button>
            </div>

            {/* Thread List */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-h-0"
            >
                {displayedThreads.map((thread) => (
                    <ThreadView
                        key={thread.id}
                        thread={thread}
                        onReply={onReply}
                        onResolve={onResolve}
                    />
                ))}
            </div>
        </div>
    );
}

function ThreadView({ thread, onReply, onResolve }: {
    thread: Thread,
    onReply: (id: string, text: string) => void,
    onResolve: (id: string) => void
}) {
    const [replyText, setReplyText] = useState("");
    const [isExpanded, setIsExpanded] = useState(!thread.isResolved);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyText.trim()) return;
        onReply(thread.id, replyText);
        setReplyText("");
    };

    // If resolved, we show a minimized view by default
    if (thread.isResolved && !isExpanded) {
        return (
            <div
                className="group flex items-center justify-between p-3 rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/50 opacity-60 hover:opacity-100 transition-all cursor-pointer flex-none"
                onClick={() => setIsExpanded(true)}
            >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="truncate max-w-[150px]">{thread.topic || "Resolved Thread"}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(thread.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        );
    }

    return (
        <div className={cn(
            "flex flex-col rounded-lg border border-border shadow-sm overflow-hidden bg-zinc-50 dark:bg-zinc-900 flex-none",
            thread.isResolved && "opacity-75"
        )}>
            {/* Thread Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-white dark:bg-zinc-800">
                <div className="flex items-center gap-2">
                    <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-1 rounded">
                        <MessageCircle className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        {thread.topic}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        • {new Date(thread.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <button
                    onClick={() => onResolve(thread.id)}
                    className="text-xs text-muted-foreground hover:text-green-600 flex items-center gap-1 hover:bg-green-50 dark:hover:bg-green-900/20 px-2 py-1 rounded transition-colors"
                >
                    {thread.isResolved ? 'Re-open' : 'Resolve'}
                    {thread.isResolved ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                </button>
            </div>

            {/* Messages */}
            <div className="p-3 flex flex-col gap-3">
                {/* Snapshot Thumbnail (Optional, maybe just hidden or small) */}

                {thread.messages.map((msg, idx) => (
                    <div
                        key={msg.id || idx}
                        className={cn(
                            "flex flex-col gap-1 max-w-[90%] text-sm",
                            msg.role === 'user' ? "self-end items-end" : "self-start items-start"
                        )}
                    >
                        <div className={cn(
                            "px-3 py-2 rounded-lg",
                            msg.role === 'user'
                                ? "bg-blue-500 text-white rounded-br-none"
                                : "bg-white border border-border text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 rounded-bl-none shadow-sm"
                        )}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Reply Input */}
            {!thread.isResolved && (
                <form onSubmit={handleSubmit} className="p-2 border-t border-border bg-white dark:bg-zinc-800 flex gap-2">
                    <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Reply..."
                        className="flex-1 text-sm bg-transparent outline-none px-2"
                    />
                    <button
                        type="submit"
                        disabled={!replyText.trim()}
                        className="p-1.5 rounded-full bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                    >
                        <Send className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                </form>
            )}
        </div>
    );
}

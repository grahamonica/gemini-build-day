"use client";

import { useState, useMemo } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Whiteboard } from "@/components/Whiteboard";
import { Conversation, Thread, Message } from "@/components/Conversation";
import { cn } from "@/lib/utils";

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(true);

  // Computed state for unread notification
  const unreadCount = useMemo(() => threads.filter(t => t.unread).length, [threads]);

  const handleCapture = async (imageData: string) => {
    // 1. Send snapshot to API
    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageData,
          history: [], // New snapshot starts fresh context for now
          isReply: false,
          existingTopics: threads.filter(t => !t.isResolved).map(t => t.topic)
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");
      const data = await response.json();

      // 2. If API returns a comment, create a new thread
      if (data.comment) {
        const newThread: Thread = {
          id: Date.now().toString(),
          snapshot: imageData,
          messages: [
            // The model's comment is the start of the visible conversation
            { role: 'model', content: data.comment, id: Date.now().toString() }
          ],
          isResolved: false,
          createdAt: Date.now(),
          unread: true,
          topic: data.topic || "New Discussion"
        };

        setThreads(prev => [...prev, newThread]);

        // Auto-open chat if closed
        if (!isChatOpen) setIsChatOpen(true);
      }

    } catch (error) {
      console.error(error);
    }
  };

  const handleReply = async (threadId: string, text: string) => {
    const threadIndex = threads.findIndex(t => t.id === threadId);
    if (threadIndex === -1) return;

    const thread = threads[threadIndex];

    // Add User Message Optimistically
    const userMsg: Message = {
      role: 'user',
      content: text,
      id: Date.now().toString()
    };

    const updatedThread = {
      ...thread,
      messages: [...thread.messages, userMsg],
      unread: false // replying reads the thread
    };

    // Update state immediately
    const newThreads = [...threads];
    newThreads[threadIndex] = updatedThread;
    setThreads(newThreads);

    try {
      // Send to API
      // history: The existing conversation [Model_Comment, User_Reply...]
      // We exclude the *new* user message from 'history' param because we pass it as 'replyText'
      // and handle logic in backend to structure it correctly.
      const historyForBackend = thread.messages;

      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: thread.snapshot, // The context image
          history: historyForBackend, // Existing history
          replyText: text, // The new message
          isReply: true
        }),
      });

      if (!response.ok) throw new Error("Failed to reply");
      const data = await response.json();

      if (data.comment) {
        const aiMsg: Message = {
          role: 'model',
          content: data.comment,
          id: (Date.now() + 1).toString()
        };

        // Update thread with AI response
        setThreads(currentThreads => {
          const idx = currentThreads.findIndex(t => t.id === threadId);
          if (idx === -1) return currentThreads;

          const t = currentThreads[idx];
          return [
            ...currentThreads.slice(0, idx),
            { ...t, messages: [...t.messages, aiMsg], unread: true }, // Mark unread for attention? Or maybe not if user is chatting. Let's say yes for now to pulse it.
            ...currentThreads.slice(idx + 1)
          ];
        });
      }

    } catch (error) {
      console.error("Failed to reply:", error);
    }
  };

  const handleResolve = (threadId: string) => {
    setThreads(prev => prev.map(t =>
      t.id === threadId
        ? { ...t, isResolved: !t.isResolved, unread: false }
        : t
    ));
  };

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-50 dark:bg-black select-none overflow-hidden overscroll-none">
      <header className="flex-none p-2 flex items-center justify-end">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="relative p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          title={isChatOpen ? "Close Chat" : "Open Chat"}
        >
          {unreadCount > 0 && !isChatOpen && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full border-2 border-zinc-50 dark:border-black" />
          )}
          {isChatOpen ? <PanelRightClose className="w-5 h-5 text-zinc-600 dark:text-zinc-400" /> : <PanelRightOpen className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />}
        </button>
      </header>

      <main className="flex-1 w-full min-h-0 flex flex-col md:flex-row gap-4 p-4 md:p-6 pt-0">
        {/* Whiteboard Container - Grows to fill space */}
        <div className="flex-1 relative min-h-0 rounded-xl overflow-hidden shadow-sm border border-border">
          <Whiteboard onCapture={handleCapture} onClear={() => setThreads([])} />
        </div>

        {/* Chat Sidebar - Collapsable */}
        <div
          className={cn(
            "flex-none rounded-xl overflow-hidden shadow-sm border border-border bg-white dark:bg-zinc-900 transition-all duration-300 ease-in-out",
            isChatOpen
              ? "w-full h-1/3 md:h-full md:w-80 opacity-100 translate-x-0"
              : "w-0 h-0 md:w-0 md:h-full opacity-0 translate-x-full md:translate-x-0 overflow-hidden border-0 m-0 p-0"
          )}
        >
          <div className="w-full h-full md:w-80">
            <Conversation
              threads={threads}
              onReply={handleReply}
              onResolve={handleResolve}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

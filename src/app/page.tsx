"use client";

import { useState } from "react";
import { MessageSquare, PanelRightClose, PanelRightOpen, PanelRight } from "lucide-react";
import { Whiteboard } from "@/components/Whiteboard";
import { Conversation, Message } from "@/components/Conversation";
import { cn } from "@/lib/utils";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(true);

  const handleCapture = async (imageData: string) => {
    // If chat is closed, open it so user sees the result
    if (!isChatOpen) setIsChatOpen(true);

    const newMessageId = Date.now().toString();
    const userMsg: Message = { role: 'user', content: imageData, id: newMessageId };

    // Optimistic update
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageData,
          history: [...messages, userMsg] // Send context
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");
      const data = await response.json();

      const aiMsg: Message = {
        role: 'model',
        content: data.text,
        id: (Date.now() + 1).toString()
      };
      setMessages(prev => [...prev, aiMsg]);

    } catch (error) {
      console.error(error);
      // Optionally handle error
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-50 dark:bg-black select-none overflow-hidden overscroll-none">
      <header className="flex-none p-4 md:p-6 pb-2 md:pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight select-none">Gemini Whiteboard</h1>
          <p className="text-muted-foreground text-sm">Draw a math problem and let AI solve it.</p>
        </div>
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          title={isChatOpen ? "Close Chat" : "Open Chat"}
        >
          {isChatOpen ? <PanelRightClose className="w-5 h-5 text-zinc-600 dark:text-zinc-400" /> : <PanelRightOpen className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />}
        </button>
      </header>

      <main className="flex-1 w-full min-h-0 flex flex-col md:flex-row gap-4 p-4 md:p-6 pt-0">
        {/* Whiteboard Container - Grows to fill space */}
        <div className="flex-1 relative min-h-0 rounded-xl overflow-hidden shadow-sm border border-border">
          <Whiteboard onCapture={handleCapture} />
        </div>

        {/* Chat Sidebar - Collapsable */}
        <div
          className={cn(
            "flex-none rounded-xl overflow-hidden shadow-sm border border-border bg-white dark:bg-zinc-900 transition-all duration-300 ease-in-out",
            isChatOpen
              ? "w-full h-1/3 md:h-full md:w-64 opacity-100 translate-x-0"
              : "w-0 h-0 md:w-0 md:h-full opacity-0 translate-x-full md:translate-x-0 overflow-hidden border-0 m-0 p-0"
          )}
        >
          <div className="w-full h-full md:w-64">
            {/* Inner wrapper to maintain width during collapse animation if desired, mostly helps prevent content squishing */}
            <Conversation messages={messages} />
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Whiteboard } from "@/components/Whiteboard";
import { Conversation, Thread, Message } from "@/components/Conversation";
import { cn } from "@/lib/utils";
import { PdfParser } from "@/components/PdfParser";
import { ProblemWorkspace } from "@/components/ProblemWorkspace";
import { ParsedProblem } from "@/types/problems";

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);

  const [parsedProblems, setParsedProblems] = useState<ParsedProblem[]>([]);

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
          isReply: false
        }),
      });

      if (!response.ok) {
        // Try to get the actual error message from the response
        let errorMessage = `Server error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          // If response isn't JSON, use status text
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("API response data:", data);

      // 2. If API returns a comment, create a new thread
      if (data.comment) {
        console.log("Creating thread with comment:", data.comment);
        const newThread: Thread = {
          id: Date.now().toString(),
          snapshot: imageData,
          messages: [
            // The model's comment is the start of the visible conversation
            { role: 'model', content: data.comment, id: Date.now().toString() }
          ],
          isResolved: false,
          createdAt: Date.now(),
          unread: true
        };

        setThreads(prev => [...prev, newThread]);


      } else {
        console.log("No comment returned from API (data.comment is null or undefined)");
      }

    } catch (error) {
      console.error("Error in handleCapture:", error);
      // Optionally show error to user via a thread or notification
      const errorMessage = error instanceof Error ? error.message : "Failed to process whiteboard snapshot";
      console.error("Capture error:", errorMessage);
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
    <div className="flex min-h-screen w-full flex-col bg-zinc-50 dark:bg-black select-none overflow-x-hidden overflow-y-auto">
      <div className="flex-none p-4 md:p-6 pb-2">
        <PdfParser onParsed={setParsedProblems} showPreview={false} />
      </div>

      {parsedProblems.length > 0 ? (
        <div className="flex-1 w-full px-4 md:px-6 pb-6">
          <ProblemWorkspace problems={parsedProblems} />
        </div>
      ) : (
        <>


          <main className="flex-1 w-full min-h-0 flex flex-col sm:flex-row gap-4 p-4 md:p-6 pt-0">
            {/* Whiteboard Container - Grows to fill space */}
            <div className="flex-1 relative min-h-0 rounded-xl overflow-hidden shadow-sm border border-border">
              <Whiteboard onCapture={handleCapture} />
            </div>

            {/* Chat Sidebar - Collapsable */}
            <div
              className="flex-none rounded-xl overflow-hidden shadow-sm border border-border bg-white dark:bg-zinc-900 w-full h-1/3 sm:h-full sm:w-80"
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
        </>
      )}
    </div>
  );
}

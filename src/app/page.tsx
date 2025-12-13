import { Whiteboard } from "@/components/Whiteboard";

export default function Home() {
  return (
    <div className="flex h-screen w-full flex-col bg-zinc-50 dark:bg-black p-4 md:p-8 select-none">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight select-none">Gemini Whiteboard</h1>
          <p className="text-muted-foreground text-sm">Draw a math problem and let AI solve it.</p>
        </div>
      </header>
      <main className="flex-1 w-full relative">
        <Whiteboard />
      </main>
    </div>
  );
}

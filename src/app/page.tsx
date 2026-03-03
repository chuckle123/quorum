import { listObservations } from "@/lib/db";
import { ThreadList } from "@/components/thread-list";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const threads = listObservations();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Threads</h2>
        <a
          href="/new"
          className="px-3 py-1.5 text-sm bg-white text-gray-950 font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          New Thread
        </a>
      </div>
      <ThreadList threads={threads} />
    </div>
  );
}

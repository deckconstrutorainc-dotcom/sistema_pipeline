import { BoardSkeleton } from "@/components/kanban/board-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function PipeKanbanLoading() {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <BoardSkeleton />
    </div>
  );
}

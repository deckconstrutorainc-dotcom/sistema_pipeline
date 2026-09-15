import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <Skeleton className="h-3 w-24" />
      <div className="divide-y rounded-lg border bg-card">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-start gap-2.5 px-3 py-2.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

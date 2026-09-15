import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() {
  return (
    <div className="space-y-3">
      <PageHeaderSkeleton />
      <TableSkeleton />
    </div>
  );
}

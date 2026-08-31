"use client";

import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Activity"
        description="Contract events streamed in real time from the event indexer."
      />
      <ActivityFeed />
    </div>
  );
}

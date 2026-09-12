import { SessionHistory } from "@/features/conductor";

export function Dashboard() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <SessionHistory />
    </div>
  );
}

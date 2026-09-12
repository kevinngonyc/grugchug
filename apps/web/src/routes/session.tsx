import Gaze from "../features/gaze/gaze";

export function Session() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Session</h1>
      <Gaze debug />
    </div>
  );
}

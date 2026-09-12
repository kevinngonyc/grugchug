// The one way material gets in: drop files on it, or click to pick them. It
// stays put after an upload so a learner can keep adding — a study session
// covers everything in the library, not one file at a time.
import { MAX_MATERIALS, type Material } from "@grugchug/shared";
import { Upload } from "lucide-react";
import { type DragEvent, useCallback, useState } from "react";
import { useMaterialLibrary } from "./material-library";

// materialSchema caps a PDF at 20M base64 characters, which is about 15 MB of
// bytes; refuse a little under that here so the learner hears it from the
// dropzone instead of as a 400 from the API.
const MAX_FILE_BYTES = 14 * 1024 * 1024;

const PDF_TYPE = "application/pdf";
const TEXT_EXTENSIONS = [".txt", ".md", ".markdown"];

export const DROPZONE_ACCEPT = `${PDF_TYPE},${TEXT_EXTENSIONS.join(",")}`;

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// data:<mime>;base64,<payload> — the API wants only the payload.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("could not read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

export async function materialFromFile(file: File): Promise<Material> {
  if (file.type === PDF_TYPE || file.name.toLowerCase().endsWith(".pdf")) {
    return { kind: "pdf", base64: await readFileAsBase64(file) };
  }
  if (isTextFile(file)) return { kind: "text", text: await file.text() };
  throw new Error(`${file.name} is not a PDF or a text file`);
}

export function MaterialDropzone() {
  const count = useMaterialLibrary((s) => s.items.length);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);

    const room = MAX_MATERIALS - useMaterialLibrary.getState().items.length;
    if (room <= 0) {
      setError(`That's the limit — ${MAX_MATERIALS} materials per route.`);
      return;
    }

    setReading(true);
    const rejected: string[] = [];
    for (const file of files.slice(0, room)) {
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} is too large`);
        continue;
      }
      try {
        useMaterialLibrary.getState().add(file.name, await materialFromFile(file));
      } catch {
        rejected.push(`${file.name} is not a PDF or text file`);
      }
    }
    setReading(false);

    if (files.length > room) rejected.push(`only the first ${room} were added`);
    if (rejected.length > 0) setError(`${rejected.join("; ")}.`);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragging(false);
      void addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="conductor-files"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 " +
          `border-dashed px-4 py-10 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border/70 hover:bg-accent/40"
          }`
        }
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          {reading ? "Reading your files…" : "Drop your materials here"}
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, .txt or .md — several at once, and you can keep adding
          {count > 0 ? ` (${count} so far)` : ""}
        </p>
        <input
          id="conductor-files"
          type="file"
          multiple
          accept={DROPZONE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

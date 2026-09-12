import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MaterialDropzone, materialFromFile } from "./material-dropzone";
import { useMaterialLibrary } from "./material-library";

beforeEach(() => {
  localStorage.removeItem("grugchug.conductor.library");
  useMaterialLibrary.setState({ items: [], planId: null });
});

describe("materialFromFile", () => {
  test("reads a text file as text material", async () => {
    const file = new File(["lecture notes"], "notes.md", { type: "text/markdown" });
    expect(await materialFromFile(file)).toEqual({ kind: "text", text: "lecture notes" });
  });

  test("refuses a file that is neither a PDF nor text", async () => {
    const file = new File(["binary"], "slides.key", { type: "application/x-iwork-keynote-sffkey" });
    expect(materialFromFile(file)).rejects.toThrow();
  });
});

describe("MaterialDropzone", () => {
  test("takes several files at once and stays available for more", async () => {
    render(<MaterialDropzone />);

    fireEvent.drop(screen.getByText("Drop your materials here"), {
      dataTransfer: {
        files: [
          new File(["one"], "one.md", { type: "text/markdown" }),
          new File(["two"], "two.md", { type: "text/markdown" }),
        ],
      },
    });

    await waitFor(() => {
      expect(useMaterialLibrary.getState().items.map((i) => i.name)).toEqual(["one.md", "two.md"]);
    });
    // Still on screen: uploading does not close the way in.
    expect(screen.getByText("Drop your materials here")).toBeTruthy();
  });

  test("names the files it could not read", async () => {
    render(<MaterialDropzone />);

    fireEvent.drop(screen.getByText("Drop your materials here"), {
      dataTransfer: {
        files: [new File(["binary"], "slides.key", { type: "application/octet-stream" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/slides\.key is not a PDF or text file/)).toBeTruthy();
    });
    expect(useMaterialLibrary.getState().items).toHaveLength(0);
  });
});

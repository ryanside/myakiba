import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SyncCsvForm from "./sync-csv-form";

afterEach(cleanup);

const CSV_HEADER =
  "ID,Title,Root,Category,Release Date,Price,Scale,Barcode,Status,Count,Score,Payment Date,Shipping Date,Collecting Date,Price,Shop,Shipping Method,Tracking Number,Wishibility,Note";
const csvLine = (id: number, status: string) =>
  `${id},"Figure ${id}",Figures,Prepainted,2024-01-01,"¥10,000",1/7,,${status},1,8/10,2024-02-01,,,"$80.00",AmiAmi,EMS,,,`;
const csvFile = (text: string, name = "mfc.csv", type = "text/csv") =>
  new File([text], name, { type });

function renderForm() {
  const submit = mock(async (_file: File | undefined) => "sent" as const);
  const { container } = render(<SyncCsvForm handleSyncCsvSubmit={submit} />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("The CSV dropzone has no file input");
  return { submit, input };
}

async function choose(input: HTMLInputElement, file: File) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

async function importCsv() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
  });
}

test("an MFC CSV with owned items is sent", async () => {
  const { submit, input } = renderForm();
  const file = csvFile(`${CSV_HEADER}\n${csvLine(1, "Owned")}`);

  await choose(input, file);
  await importCsv();

  await waitFor(() => expect(submit).toHaveBeenCalledWith(file));
});

test.each([
  ["no file", null, "No file selected"],
  [
    "a CSV that is not from MFC",
    csvFile("name,colour\nfigure,red", "other.csv"),
    "Please select a valid MyFigureCollection CSV file",
  ],
  [
    "an MFC CSV with only wished items",
    csvFile(`${CSV_HEADER}\n${csvLine(4, "Wished")}`),
    "This CSV has no supported Owned or Ordered items to import",
  ],
])("importing %s shows why under the dropzone and sends nothing", async (_case, file, reason) => {
  const { submit, input } = renderForm();

  if (file) await choose(input, file);
  await importCsv();

  expect(await screen.findByText(reason)).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});

test("a file the dropzone rejects is only logged to the console", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const { input } = renderForm();

  await choose(input, csvFile("figure", "notes.txt", "text/plain"));

  try {
    const dropzoneLogs = logged.mock.calls.filter(([label]) => label === "Dropzone error:");
    expect(dropzoneLogs).toHaveLength(1);
    expect(dropzoneLogs[0]?.[1]).toMatchObject({
      message: "File type must be one of text/csv, .csv",
    });
    expect(document.querySelector("em[role=alert]")).toBeNull();
  } finally {
    logged.mockRestore();
  }
});

import { Label } from "../ui/label";
import { Upload, BookImage, ShoppingCart } from "lucide-react";

export default function ChooseSyncOption({
  handleSyncOption,
}: {
  handleSyncOption: (option: "csv" | "order" | "collection") => void;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-4 w-full">
      <Label className="text-lg text-foreground">Choose a sync option</Label>
      <div className="flex flex-col gap-4 justify-center">
        <div
          className="rounded-md border p-4 shadow-sm space-y-2 hover:bg-muted"
          onClick={() => {
            handleSyncOption("csv");
          }}
        >
          <Label className="text-md text-foreground">
            <Upload className="w-4 h-4" /> Upload MyFigureCollection CSV
            <span className="text-xs text-bold text-primary">
              (Recommended for onboarding)
            </span>
          </Label>
          <div className="">
            <p className="text-sm text-pretty">
              {`This option allows you to import your items from a
                          MyFigureCollection CSV file.`}
            </p>
            <p className="text-sm text-pretty font-light italic tracking-tight">
              {`You can export your MyFigureCollection
                          CSV by going to https://myfigurecollection.net > User Menu > Manager > CSV Export.`}
            </p>
          </div>
        </div>
        <div
          className="rounded-md border p-4 shadow-sm space-y-2 hover:bg-muted"
          onClick={() => {
            handleSyncOption("order");
          }}
        >
          <Label className="text-md text-foreground">
            <ShoppingCart className="w-4 h-4" /> Add Order using
            MyFigureCollection Item IDs
          </Label>
          <div>
            <p className="text-sm text-pretty">
              {`This option allows you to create an order and add order items to it using MyFigureCollection Item IDs.`}
            </p>
          </div>
        </div>
        <div
          className="rounded-md border p-4 shadow-sm space-y-2 hover:bg-muted"
          onClick={() => {
            handleSyncOption("collection");
          }}
        >
          <Label className="text-md text-foreground">
            <BookImage className="w-4 h-4" /> Add Collection Items using
            MyFigureCollection Item IDs
          </Label>
          <div>
            <p className="text-sm text-pretty">
              {`This option allows you to add to your collection using MyFigureCollection Item IDs.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

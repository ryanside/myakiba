import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type GalleryLayout = "square" | "masonry";

interface GalleryLayoutToggleProps {
  readonly value: GalleryLayout;
  readonly onValueChange: (value: GalleryLayout) => void;
}

export function GalleryLayoutToggle({
  value,
  onValueChange,
}: GalleryLayoutToggleProps): React.JSX.Element {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(newValue) => {
        if (newValue.length > 0) {
          onValueChange(newValue[0] as GalleryLayout);
        }
      }}
      variant="outline"
      size="sm"
    >
      <ToggleGroupItem value="square" aria-label="Square grid layout">
        Square
      </ToggleGroupItem>
      <ToggleGroupItem value="masonry" aria-label="Masonry layout">
        Masonry
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export type { GalleryLayout };

import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getStatusVariant } from "@/lib/orders";

interface SelectCellProps {
  value: string;
  options: string[];
  onSubmit: (value: string) => Promise<void>;
}

export function SelectCell({ value, options, onSubmit }: SelectCellProps) {
  return (
    <Select value={value} onValueChange={(value) => onSubmit(value as string)}>
      <Badge asChild variant={getStatusVariant(value)} appearance="outline" className="py-4">
        <SelectTrigger className="!justify-between">
          <SelectValue />
        </SelectTrigger>
      </Badge>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

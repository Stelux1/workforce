import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ViewToggle({ view, onViewChange }) {
  return (
    <div className="flex items-center gap-0.5 border rounded-md p-0.5 bg-muted/50">
      <Button
        variant={view === "grid" ? "default" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onViewChange("grid")}
        title="Grid view"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant={view === "list" ? "default" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onViewChange("list")}
        title="List view"
      >
        <List className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
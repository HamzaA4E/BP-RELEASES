import type { Favorite } from "@/types";
import { formatPower } from "@/utils/calculations";

interface FavoriteCardProps {
  favorite: Favorite;
  onSelect: (favorite: Favorite) => void;
  onDelete?: (id: number) => void;
  compact?: boolean;
}

export function FavoriteCard({
  favorite,
  onSelect,
  onDelete,
  compact = false,
}: FavoriteCardProps) {
  const typeIcon =
    favorite.type === "eclairage"
      ? "💡"
      : favorite.type === "prise"
        ? "🔌"
        : "📦";

  return (
    <button
      type="button"
      onClick={() => onSelect(favorite)}
      className={`group relative flex items-start gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-600
        card-hover-readable transition-all text-left w-full ${compact ? "text-xs" : "text-sm"}`}
    >
      <span
        className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-white text-xs"
        style={{ backgroundColor: favorite.color }}
      >
        {typeIcon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white truncate">
          {favorite.designation}
        </p>
        <p className="text-accent text-xs font-semibold">
          {formatPower(favorite.power_w)}
        </p>
      </div>
      {onDelete && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(favorite.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onDelete(favorite.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 w-5 h-5
            flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50
            text-red-600 dark:text-red-400 text-xs hover:bg-red-200 transition-opacity"
        >
          ×
        </span>
      )}
    </button>
  );
}

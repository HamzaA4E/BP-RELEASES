import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Element } from '@/types';
import {
  totalInstalledPower,
  voltageDropPercent,
  voltageDropColorClass,
  formatNumber,
  panelInstalledPower,
} from '@/utils/calculations';

interface ElementTableProps {
  elements: Element[];
  onEdit: (element: Element) => void;
  onDelete: (id: number) => void;
  onReorder: (orderedIds: number[]) => void;
}

function SortableRow({
  element,
  index,
  onEdit,
  onDelete,
}: {
  element: Element;
  index: number;
  onEdit: (el: Element) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const totalPower = totalInstalledPower(element.power_w, element.quantity);
  const dropPercent = voltageDropPercent(
    element.distance_m,
    element.power_w,
    element.quantity
  );

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
    >
      <td className="px-2 py-2 text-center text-gray-400 cursor-grab" {...attributes} {...listeners}>
        ⋮⋮
      </td>
      <td className="px-3 py-2 text-sm text-gray-500">{index + 1}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            element.type === 'eclairage'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
          }`}
        >
          {element.type === 'eclairage' ? '💡' : '🔌'}
          {element.type === 'eclairage' ? 'Écl.' : 'Prise'}
        </span>
      </td>
      <td className="px-3 py-2 text-sm font-mono font-medium">{element.repere}</td>
      <td className="px-3 py-2 text-sm max-w-xs truncate" title={element.designation}>
        {element.designation}
      </td>
      <td className="px-3 py-2 text-sm text-right">{element.power_w}</td>
      <td className="px-3 py-2 text-sm text-center">{element.quantity}</td>
      <td className="px-3 py-2 text-sm text-right font-medium">{totalPower}</td>
      <td className="px-3 py-2 text-sm text-right">{element.distance_m}</td>
      <td className={`px-3 py-2 text-sm text-right ${voltageDropColorClass(dropPercent)}`}>
        {formatNumber(dropPercent)}
      </td>
      <td className="px-3 py-2 text-sm text-gray-500">{element.circuit ?? '—'}</td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onEdit(element)}
            className="p-1 text-accent hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
            title="Modifier"
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={() => onDelete(element.id)}
            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            title="Supprimer"
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
}

export function ElementTable({
  elements,
  onEdit,
  onDelete,
  onReorder,
}: ElementTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = elements.findIndex((e) => e.id === active.id);
    const newIndex = elements.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(elements, oldIndex, newIndex);
    onReorder(reordered.map((e) => e.id));
  };

  const totalPower = panelInstalledPower(elements);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className="w-full text-left">
          <thead>
            <tr className="bg-primary text-white text-xs uppercase tracking-wide">
              <th className="w-8 px-2 py-3" />
              <th className="px-3 py-3 w-8">#</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Repère</th>
              <th className="px-3 py-3 min-w-[180px]">Désignation</th>
              <th className="px-3 py-3 text-right">Puiss. (W)</th>
              <th className="px-3 py-3 text-center">Qté</th>
              <th className="px-3 py-3 text-right">P. Totale (W)</th>
              <th className="px-3 py-3 text-right">Distance (m)</th>
              <th className="px-3 py-3 text-right">Chute (%)</th>
              <th className="px-3 py-3">Circuit</th>
              <th className="px-3 py-3 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            <SortableContext
              items={elements.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              {elements.map((element, index) => (
                <SortableRow
                  key={element.id}
                  element={element}
                  index={index}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </SortableContext>
            {elements.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-gray-400 text-sm">
                  Aucun élément. Cliquez sur &quot;Ajouter un élément&quot; pour commencer.
                </td>
              </tr>
            )}
            {elements.length > 0 && (
              <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold">
                <td colSpan={7} className="px-3 py-3 text-sm text-right text-primary dark:text-accent-light">
                  TOTAL
                </td>
                <td className="px-3 py-3 text-sm text-right text-primary dark:text-white">
                  {totalPower} W
                </td>
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </DndContext>
    </div>
  );
}

import { useState } from 'react';
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
  panelInstalledPower,
} from '@/utils/calculations';
import {
  displayTypeLabel,
  displayEmplacement,
  isBarSetRow,
} from '@/utils/elementHelpers';

interface ElementTableProps {
  elements: Element[];
  onEdit: (element: Element) => void;
  onDelete: (id: number) => void;
  onReorder: (orderedIds: number[]) => void;
  onFieldUpdate: (
    id: number,
    field: 'ku' | 'ks' | 'fp' | 'emplacement' | 'type_label',
    value: number | string
  ) => Promise<void>;
}

function CoeffInput({
  value,
  onCommit,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(String(value));

  return (
    <input
      type="number"
      step={0.01}
      min={0}
      disabled={disabled}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const parsed = parseFloat(local);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          onCommit(parsed);
        } else {
          setLocal(String(value));
        }
      }}
      className="w-14 px-1 py-1 text-sm text-right border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 disabled:opacity-50"
    />
  );
}

function SortableRow({
  element,
  index,
  onEdit,
  onDelete,
  onFieldUpdate,
}: {
  element: Element;
  index: number;
  onEdit: (el: Element) => void;
  onDelete: (id: number) => void;
  onFieldUpdate: ElementTableProps['onFieldUpdate'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const barSet = isBarSetRow(element);
  const totalPower = barSet ? 0 : totalInstalledPower(element.power_w, element.quantity);
  const typeLabel = displayTypeLabel(element);
  const emplacement = displayEmplacement(element);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 ${
        barSet ? 'bg-slate-50 dark:bg-slate-800/50' : ''
      }`}
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
      <td
        className={`px-3 py-2 text-sm max-w-[200px] ${barSet ? 'font-semibold text-primary dark:text-accent-light' : ''}`}
        title={typeLabel}
      >
        {typeLabel}
      </td>
      <td className="px-3 py-2 text-sm max-w-[160px]">
        {barSet ? (
          <span className="text-gray-400">—</span>
        ) : (
          <input
            type="text"
            defaultValue={emplacement}
            onBlur={(e) => {
              if (e.target.value !== emplacement) {
                void onFieldUpdate(element.id, 'emplacement', e.target.value);
              }
            }}
            className="input-field py-1 text-sm"
            placeholder="Emplacement"
          />
        )}
      </td>
      <td className="px-3 py-2 text-sm text-right">{barSet ? '—' : element.power_w}</td>
      <td className="px-3 py-2 text-sm text-center">{barSet ? '—' : element.quantity}</td>
      <td className="px-3 py-2 text-sm text-right font-medium">
        {barSet ? '—' : totalPower}
      </td>
      <td className="px-3 py-2 text-sm text-right">
        {barSet ? (
          '—'
        ) : (
          <CoeffInput
            value={element.ku}
            onCommit={(v) => void onFieldUpdate(element.id, 'ku', v)}
          />
        )}
      </td>
      <td className="px-3 py-2 text-sm text-right">
        {barSet ? (
          '—'
        ) : (
          <CoeffInput
            value={element.ks}
            onCommit={(v) => void onFieldUpdate(element.id, 'ks', v)}
          />
        )}
      </td>
      <td className="px-3 py-2 text-sm text-right">
        {barSet ? (
          '—'
        ) : (
          <CoeffInput
            value={element.fp}
            onCommit={(v) => void onFieldUpdate(element.id, 'fp', v)}
          />
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          {!barSet && (
            <button
              type="button"
              onClick={() => onEdit(element)}
              className="p-1 text-accent hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
              title="Modifier"
            >
              ✏️
            </button>
          )}
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
  onFieldUpdate,
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
  const colCount = 13;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="bg-primary text-white text-xs uppercase tracking-wide">
              <th className="w-8 px-2 py-3" />
              <th className="px-3 py-3 w-8">#</th>
              <th className="px-3 py-3">Cat.</th>
              <th className="px-3 py-3">Repère</th>
              <th className="px-3 py-3 min-w-[140px]">Type</th>
              <th className="px-3 py-3 min-w-[120px]">Désignation</th>
              <th className="px-3 py-3 text-right">Puiss. (W)</th>
              <th className="px-3 py-3 text-center">Qté</th>
              <th className="px-3 py-3 text-right">P. totale (W)</th>
              <th className="px-3 py-3 text-right">ku</th>
              <th className="px-3 py-3 text-right">ks</th>
              <th className="px-3 py-3 text-right">fp</th>
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
                  onFieldUpdate={onFieldUpdate}
                />
              ))}
            </SortableContext>
            {elements.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-gray-400 text-sm">
                  Aucun élément. Ajoutez un élément ou un jeu de barre pour commencer.
                </td>
              </tr>
            )}
            {elements.length > 0 && (
              <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold">
                <td colSpan={8} className="px-3 py-3 text-sm text-right text-primary dark:text-accent-light">
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

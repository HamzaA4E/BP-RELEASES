import { Fragment, useState } from 'react';
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
  panelUsedPower,
  calcPuissanceUtilisee,
} from '@/utils/calculations';
import {
  displayTypeLabel,
  displayEmplacement,
  typeBadge,
  jeuDeBarresTitle,
  jdbCategoryLabel,
} from '@/utils/elementHelpers';

/** drag + Cat + Repère + Type + Désignation + Puiss + Qté + Ks + Ku + FP + P.totale + Puiss.utilisée + Actions */
const TOTAL_COLUMN_COUNT = 13;

type EditableField = 'emplacement' | 'power_w' | 'repere' | 'quantity' | 'type_label';

type CoefField = 'coef_ks' | 'coef_ku' | 'coef_fp';

interface ElementTableProps {
  elements: Element[];
  onEdit: (element: Element) => void;
  onDelete: (id: number) => void;
  onAddElementUnderJdb: (jdb: Element) => void;
  onReorder: (orderedIds: number[]) => void;
  onFieldUpdate: (
    id: number,
    field:
      | 'emplacement'
      | 'type_label'
      | 'power_w'
      | 'repere'
      | 'quantity'
      | CoefField,
    value: number | string
  ) => Promise<void>;
}

function InlineTextCell({
  elementId,
  field,
  value,
  editingField,
  setEditingField,
  onCommit,
  className = '',
  inputClassName = 'input-field py-1 text-sm w-full',
}: {
  elementId: number;
  field: EditableField;
  value: string;
  editingField: { id: number; field: EditableField | CoefField } | null;
  setEditingField: (v: { id: number; field: EditableField | CoefField } | null) => void;
  onCommit: (v: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const isEditing = editingField?.id === elementId && editingField?.field === field;

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          onCommit(e.target.value);
          setEditingField(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditingField(null);
        }}
        className={inputClassName}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditingField({ id: elementId, field })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditingField({ id: elementId, field });
      }}
      className={`cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors ${className}`}
      title="Cliquer pour modifier"
    >
      {value || '—'}
    </span>
  );
}

function InlineNumberCell({
  elementId,
  field,
  value,
  editingField,
  setEditingField,
  onCommit,
  min = 0,
  max,
  step = 1,
  format,
}: {
  elementId: number;
  field: EditableField | CoefField;
  value: number;
  editingField: { id: number; field: EditableField | CoefField } | null;
  setEditingField: (v: { id: number; field: EditableField | CoefField } | null) => void;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const isEditing = editingField?.id === elementId && editingField?.field === field;
  const display = format ? format(value) : String(value);

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onBlur={(e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isNaN(val)) onCommit(val);
          setEditingField(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditingField(null);
        }}
        className="input-field py-1 text-sm w-14 text-center font-mono"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditingField({ id: elementId, field })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditingField({ id: elementId, field });
      }}
      className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors font-mono text-sm"
      title="Cliquer pour modifier"
    >
      {display}
    </span>
  );
}

function InlineRepereCell({
  element,
  editingField,
  setEditingField,
  onCommit,
}: {
  element: Element;
  editingField: { id: number; field: EditableField | CoefField } | null;
  setEditingField: (v: { id: number; field: EditableField | CoefField } | null) => void;
  onCommit: (v: string) => void;
}) {
  const isEditing =
    editingField?.id === element.id && editingField?.field === 'repere';

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        defaultValue={element.repere}
        onBlur={(e) => {
          const val = e.target.value.trim().toUpperCase();
          if (val) onCommit(val);
          setEditingField(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditingField(null);
        }}
        className="input-field py-1 text-sm min-w-[4rem] max-w-[8rem] font-mono font-bold"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditingField({ id: element.id, field: 'repere' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditingField({ id: element.id, field: 'repere' });
      }}
      className="inline-block font-mono font-bold text-sm px-2 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:text-blue-700 text-slate-700 dark:text-slate-300 transition-colors"
      title="Cliquer pour modifier le repère"
    >
      {element.repere || '—'}
    </span>
  );
}

function InlinePowerCell({
  element,
  editingField,
  setEditingField,
  onCommit,
}: {
  element: Element;
  editingField: { id: number; field: EditableField | CoefField } | null;
  setEditingField: (v: { id: number; field: EditableField | CoefField } | null) => void;
  onCommit: (v: number) => void;
}) {
  const isEditing =
    editingField?.id === element.id && editingField?.field === 'power_w';

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        min={0}
        defaultValue={element.power_w}
        onBlur={(e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isNaN(val) && val >= 0) onCommit(val);
          setEditingField(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditingField(null);
        }}
        className="input-field py-1 text-sm w-24 text-right"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditingField({ id: element.id, field: 'power_w' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setEditingField({ id: element.id, field: 'power_w' });
      }}
      className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors"
      title="Cliquer pour modifier"
    >
      {element.power_w.toLocaleString('fr-FR')} W
    </span>
  );
}

function JeuDeBarresRow({
  element,
  onDelete,
  onAddElement,
  onFieldUpdate,
  editingField,
  setEditingField,
}: {
  element: Element;
  onDelete: (id: number) => void;
  onAddElement: (jdb: Element) => void;
  onFieldUpdate: ElementTableProps['onFieldUpdate'];
  editingField: { id: number; field: EditableField | CoefField } | null;
  setEditingField: (v: { id: number; field: EditableField | CoefField } | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const title = jeuDeBarresTitle(element);
  const categoryLabel = jdbCategoryLabel(element.jdb_category);

  return (
    <tr ref={setNodeRef} style={style} className="group">
      <td
        className="px-2 py-0 text-center text-white/40 cursor-grab w-8 align-middle"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </td>
      <td colSpan={TOTAL_COLUMN_COUNT - 1} className="p-0">
        <div className="flex items-center justify-between gap-4 px-5 py-3 bg-gradient-to-r from-[#1E3A5F] to-[#2a4f7a] border-y border-[#162d4a]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/15 text-base">
              ⚡
            </span>
            <div className="min-w-0 flex-1">
              <InlineTextCell
                elementId={element.id}
                field="type_label"
                value={title}
                editingField={editingField}
                setEditingField={setEditingField}
                onCommit={(v) =>
                  void onFieldUpdate(
                    element.id,
                    'type_label',
                    v.trim() || 'Jeu de barres'
                  )
                }
                className="block text-white font-semibold text-sm tracking-wide truncate hover:bg-white/15 hover:text-white px-2 py-0.5 rounded"
                inputClassName="w-full min-w-[12rem] bg-white/20 text-white border border-white/40 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-white/50"
              />
              <p className="text-white/60 text-xs mt-0.5 px-2">
                Jeu de barres · {categoryLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium uppercase tracking-wider text-white/80 bg-white/10 px-2.5 py-1 rounded hidden sm:inline">
              {categoryLabel}
            </span>
            <button
              type="button"
              onClick={() => onAddElement(element)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-lg transition-colors"
              title="Ajouter un élément dans cette section"
            >
              <span className="text-sm leading-none">+</span>
              Ajouter un élément
            </button>
            <button
              type="button"
              onClick={() => onDelete(element.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-white/50 hover:text-red-300 p-1 rounded"
              title="Supprimer ce jeu de barres"
            >
              ×
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function SortableDataRow({
  element,
  onEdit,
  onDelete,
  onFieldUpdate,
  editingField,
  setEditingField,
}: {
  element: Element;
  onEdit: (el: Element) => void;
  onDelete: (id: number) => void;
  onFieldUpdate: ElementTableProps['onFieldUpdate'];
  editingField: { id: number; field: EditableField | CoefField } | null;
  setEditingField: (v: { id: number; field: EditableField | CoefField } | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isAttente = element.type === 'attente';
  const totalPower = totalInstalledPower(element.power_w, element.quantity);
  const usedPower = calcPuissanceUtilisee(element);
  const badge = typeBadge(element);
  const typeLabel = displayTypeLabel(element);
  const emplacement = displayEmplacement(element);
  const showUsed = usedPower > 0;

  const coefFields: Array<{ key: CoefField; label: string }> = [
    { key: 'coef_ks', label: 'Ks' },
    { key: 'coef_ku', label: 'Ku' },
    { key: 'coef_fp', label: 'FP' },
  ];

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 ${
        isAttente ? 'opacity-60' : ''
      }`}
    >
      <td className="px-2 py-2 text-center text-gray-400 cursor-grab" {...attributes} {...listeners}>
        ⋮⋮
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </td>
      <td className="px-3 py-2">
        <InlineRepereCell
          element={element}
          editingField={editingField}
          setEditingField={setEditingField}
          onCommit={(v) => void onFieldUpdate(element.id, 'repere', v)}
        />
      </td>
      <td className="px-3 py-2 text-sm max-w-[140px]" title={typeLabel}>
        {typeLabel}
      </td>
      <td
        className={`px-3 py-2 text-sm max-w-[140px] ${isAttente ? 'italic text-gray-500' : ''}`}
      >
        <InlineTextCell
          elementId={element.id}
          field="emplacement"
          value={emplacement}
          editingField={editingField}
          setEditingField={setEditingField}
          onCommit={(v) => void onFieldUpdate(element.id, 'emplacement', v)}
        />
      </td>
      <td className="px-3 py-2 text-sm text-right">
        <InlinePowerCell
          element={element}
          editingField={editingField}
          setEditingField={setEditingField}
          onCommit={(v) => void onFieldUpdate(element.id, 'power_w', v)}
        />
      </td>
      <td className="px-3 py-2 text-sm text-center">
        <InlineNumberCell
          elementId={element.id}
          field="quantity"
          value={element.quantity}
          editingField={editingField}
          setEditingField={setEditingField}
          min={1}
          step={1}
          onCommit={(v) => {
            const q = Math.max(1, Math.round(v));
            void onFieldUpdate(element.id, 'quantity', q);
          }}
        />
      </td>
      {coefFields.map((c) => (
        <td key={c.key} className="px-2 py-2 text-sm text-center">
          <InlineNumberCell
            elementId={element.id}
            field={c.key}
            value={element[c.key]}
            editingField={editingField}
            setEditingField={setEditingField}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onCommit={(v) => {
              const clamped = Math.min(1, Math.max(0, v));
              void onFieldUpdate(element.id, c.key, clamped);
            }}
          />
        </td>
      ))}
      <td className="px-3 py-2 text-sm text-right font-medium">
        {totalPower.toLocaleString('fr-FR')}
      </td>
      <td className="px-3 py-2 text-sm text-right">
        {showUsed ? (
          <span
            className="font-bold text-slate-700 dark:text-slate-300"
            title={`Puiss. Utilisée = P.totale × Ks × Ku × FP`}
          >
            {usedPower.toLocaleString('fr-FR')} W
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
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
  onAddElementUnderJdb,
  onReorder,
  onFieldUpdate,
}: ElementTableProps) {
  const [editingField, setEditingField] = useState<{
    id: number;
    field: EditableField | CoefField;
  } | null>(null);

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

  const totalInstalled = panelInstalledPower(elements);
  const totalUsed = panelUsedPower(elements);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className="w-full text-left min-w-[1100px]">
          <thead>
            <tr className="bg-primary text-white text-xs uppercase tracking-wide">
              <th className="w-8 px-2 py-3" />
              <th className="px-3 py-3">Cat.</th>
              <th className="px-3 py-3">Repère</th>
              <th className="px-3 py-3 min-w-[100px]">Type</th>
              <th className="px-3 py-3 min-w-[100px]">Désignation</th>
              <th className="px-3 py-3 text-right">P. Uniitaire (W)</th>
              <th className="px-3 py-3 text-center">Qté</th>
              <th className="px-3 py-3 text-center w-14" title="Coefficient de simultanéité">
                Ks
              </th>
              <th className="px-3 py-3 text-center w-14" title="Coefficient d'utilisation">
                Ku
              </th>
              <th className="px-3 py-3 text-center w-14" title="Facteur de puissance">
                FP
              </th>
              <th className="px-3 py-3 text-right">P. totale (W)</th>
              <th className="px-3 py-3 text-right">
                <span
                  className="inline-flex items-center gap-1"
                  title="Puiss. Utilisée = P.totale × Ks × Ku × FP"
                >
                  P. Utile (W)
                  
                </span>
              </th>
              <th className="px-3 py-3 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            <SortableContext
              items={elements.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              {elements.map((element) => (
                <Fragment key={element.id}>
                  {element.type === 'jeu_de_barres' ? (
                    <JeuDeBarresRow
                      element={element}
                      onDelete={onDelete}
                      onAddElement={onAddElementUnderJdb}
                      onFieldUpdate={onFieldUpdate}
                      editingField={editingField}
                      setEditingField={setEditingField}
                    />
                  ) : (
                    <SortableDataRow
                      element={element}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onFieldUpdate={onFieldUpdate}
                      editingField={editingField}
                      setEditingField={setEditingField}
                    />
                  )}
                </Fragment>
              ))}
            </SortableContext>
            {elements.length === 0 && (
              <tr>
                <td
                  colSpan={TOTAL_COLUMN_COUNT}
                  className="px-4 py-12 text-center text-gray-400 text-sm"
                >
                  Aucun élément. Ajoutez un élément ou un jeu de barres pour commencer.
                </td>
              </tr>
            )}
            {elements.length > 0 && (
              <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold">
                <td
                  colSpan={10}
                  className="px-3 py-3 text-sm text-right text-primary dark:text-accent-light"
                >
                  TOTAL
                </td>
                <td className="px-3 py-3 text-sm text-right text-primary dark:text-white">
                  {totalInstalled.toLocaleString('fr-FR')} W
                </td>
                <td className="px-3 py-3 text-sm text-right text-primary dark:text-white">
                  {totalUsed.toLocaleString('fr-FR')} W
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </DndContext>
    </div>
  );
}

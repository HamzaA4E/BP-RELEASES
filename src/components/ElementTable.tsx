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
import type { Article, Element } from '@/types';
import {
  calcPuissanceTotale,
  calcArticlePower,
  panelTotalPower,
  formatCoefsLine,
  resolveElementCoefs,
  formatKuDisplay,
  wattsToKw,
  formatNumber,
} from '@/utils/calculations';
import {
  displayTypeLabel,
  displayEmplacement,
  typeBadge,
  jeuDeBarresTitle,
  jdbCategoryLabel,
  buildElementTableRows,
} from '@/utils/elementHelpers';
import {
  displayArticleTypeLabel,
  displayArticleDesignation,
} from '@/utils/multiDepartHelpers';

/** drag + + + Cat + Repère + Type + Désignation + Puiss + Qté + Ks + Ku + P.totale + Actions */
const TOTAL_COLUMN_COUNT = 12;

function AddTypeButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  if (disabled) return <span className="inline-block w-6" aria-hidden />;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-500 hover:text-blue-600 text-sm font-bold leading-none transition-colors"
      title="Ajouter un autre type sur ce départ"
    >
      +
    </button>
  );
}

type EditableField = 'emplacement' | 'power_w' | 'repere' | 'quantity' | 'type_label';

type ArticleEditableField =
  | 'designation'
  | 'type_label'
  | 'power_w'
  | 'quantity'
  | 'coef_ks'
  | 'coef_ku';

type CoefField = 'coef_ks' | 'coef_ku';

interface ElementTableProps {
  elements: Element[];
  articlesByElement: Record<number, Article[]>;
  onEdit: (element: Element) => void;
  onAddTypeToDepart: (element: Element) => void;
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
  onArticleUpdate: (
    articleId: number,
    field: 'designation' | 'type_label' | 'power_w' | 'quantity' | 'coef_ks' | 'coef_ku',
    value: string | number
  ) => Promise<void>;
  onArticleDelete: (articleId: number, elementId: number) => Promise<void>;
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
  title,
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
  title?: string;
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
      title={title ?? 'Cliquer pour modifier'}
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
        defaultValue={wattsToKw(element.power_w)}
        step={0.001}
        onBlur={(e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isNaN(val) && val >= 0) onCommit(Math.round(val * 1000));
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
      {formatNumber(wattsToKw(element.power_w), 3)} kW
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
      <td />
      <td colSpan={TOTAL_COLUMN_COUNT - 2} className="p-0">
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

function SubtotalRow({ label, totalPower }: { label: string; totalPower: number }) {
  return (
    <tr className="bg-blue-50/80 dark:bg-blue-900/15">
      <td />
      <td />
      <td colSpan={2} className="px-3 py-2 text-sm font-bold italic text-primary dark:text-blue-300">
        {label}
      </td>
      <td colSpan={6} />
      <td className="px-3 py-2 text-sm text-right font-bold italic text-primary dark:text-white">
        {formatNumber(wattsToKw(totalPower), 3)} kW
      </td>
      <td />
    </tr>
  );
}

type ArticleEditingState = { id: number; field: ArticleEditableField } | null;

function ArticleCoefCell({
  article,
  field,
  articleEditing,
  setArticleEditing,
  onCommit,
}: {
  article: Article;
  field: 'coef_ks' | 'coef_ku';
  articleEditing: ArticleEditingState;
  setArticleEditing: (v: ArticleEditingState) => void;
  onCommit: (value: number) => void;
}) {
  const value = article[field] ?? 1;
  const isEditing = articleEditing?.id === article.id && articleEditing.field === field;

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        min={0}
        max={1}
        step={0.05}
        defaultValue={value}
        onBlur={(e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isNaN(val)) onCommit(Math.min(1, Math.max(0, val)));
          setArticleEditing(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setArticleEditing(null);
        }}
        className="input-field py-1 text-sm w-14 text-center"
      />
    );
  }

  const display = field === 'coef_ku' ? formatKuDisplay(value) : value.toFixed(2);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setArticleEditing({ id: article.id, field })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setArticleEditing({ id: article.id, field });
      }}
      className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors font-mono text-sm"
      title="Cliquer pour modifier"
    >
      {display}
    </span>
  );
}

function ArticleTypeLabelCell({
  article,
  element,
  isFirstArticle,
  articleEditing,
  setArticleEditing,
  onCommit,
}: {
  article: Article;
  element: Element;
  isFirstArticle: boolean;
  articleEditing: ArticleEditingState;
  setArticleEditing: (v: ArticleEditingState) => void;
  onCommit: (v: string) => void;
}) {
  const isPrise = element.type === 'prise';
  const display = displayArticleTypeLabel(article, element, isFirstArticle);
  const isEditing =
    !isPrise &&
    articleEditing?.id === article.id &&
    articleEditing.field === 'type_label';

  if (isPrise) {
    return <span className="text-sm">{display}</span>;
  }

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        defaultValue={article.type_label || displayTypeLabel(element)}
        onBlur={(e) => {
          onCommit(e.target.value.trim());
          setArticleEditing(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setArticleEditing(null);
        }}
        className="input-field py-1 text-sm w-full"
        placeholder="Type"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setArticleEditing({ id: article.id, field: 'type_label' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setArticleEditing({ id: article.id, field: 'type_label' });
      }}
      className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors truncate block"
      title="Cliquer pour modifier"
    >
      {display}
    </span>
  );
}

function ArticleDesignationCell({
  article,
  articleEditing,
  setArticleEditing,
  onCommit,
  canDelete,
  onDelete,
}: {
  article: Article;
  articleEditing: ArticleEditingState;
  setArticleEditing: (v: ArticleEditingState) => void;
  onCommit: (v: string) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const isEditing =
    articleEditing?.id === article.id && articleEditing.field === 'designation';

  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        defaultValue={article.designation}
        onBlur={(e) => {
          onCommit(e.target.value.trim());
          setArticleEditing(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setArticleEditing(null);
        }}
        className="input-field py-1 text-sm w-full"
        placeholder="Désignation"
      />
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <span
        role="button"
        tabIndex={0}
        onClick={() => setArticleEditing({ id: article.id, field: 'designation' })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setArticleEditing({ id: article.id, field: 'designation' });
        }}
        className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors truncate flex-1"
        title="Cliquer pour modifier"
      >
        {displayArticleDesignation(article)}
      </span>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-red-400 hover:text-red-600 text-xs px-1"
          title="Retirer ce type"
        >
          ×
        </button>
      )}
    </div>
  );
}

function ArticlePowerCell({
  article,
  articleEditing,
  setArticleEditing,
  onCommit,
}: {
  article: Article;
  articleEditing: ArticleEditingState;
  setArticleEditing: (v: ArticleEditingState) => void;
  onCommit: (powerW: number) => void;
}) {
  const isEditing = articleEditing?.id === article.id && articleEditing.field === 'power_w';

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        min={0}
        step={0.001}
        defaultValue={wattsToKw(article.power_w)}
        onBlur={(e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isNaN(val) && val >= 0) onCommit(Math.round(val * 1000));
          setArticleEditing(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setArticleEditing(null);
        }}
        className="input-field py-1 text-sm w-24 text-right"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setArticleEditing({ id: article.id, field: 'power_w' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setArticleEditing({ id: article.id, field: 'power_w' });
      }}
      className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors"
      title="Cliquer pour modifier"
    >
      {formatNumber(wattsToKw(article.power_w), 3)} kW
    </span>
  );
}

function ArticleQuantityCell({
  article,
  articleEditing,
  setArticleEditing,
  onCommit,
}: {
  article: Article;
  articleEditing: ArticleEditingState;
  setArticleEditing: (v: ArticleEditingState) => void;
  onCommit: (qty: number) => void;
}) {
  const isEditing = articleEditing?.id === article.id && articleEditing.field === 'quantity';

  if (isEditing) {
    return (
      <input
        type="number"
        autoFocus
        min={1}
        step={1}
        defaultValue={article.quantity}
        onBlur={(e) => {
          const val = parseInt(e.target.value, 10);
          if (!Number.isNaN(val) && val >= 1) onCommit(val);
          setArticleEditing(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setArticleEditing(null);
        }}
        className="input-field py-1 text-sm w-14 text-center font-mono"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setArticleEditing({ id: article.id, field: 'quantity' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setArticleEditing({ id: article.id, field: 'quantity' });
      }}
      className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 px-2 py-0.5 rounded transition-colors font-mono text-sm"
      title="Cliquer pour modifier"
    >
      {article.quantity}
    </span>
  );
}

function SortableMultiDepartRow({
  element,
  articles,
  onAddTypeToDepart,
  onDelete,
  onFieldUpdate,
  onArticleUpdate,
  onArticleDelete,
  editingField,
  setEditingField,
  articleEditing,
  setArticleEditing,
}: {
  element: Element;
  articles: Article[];
  onAddTypeToDepart: (el: Element) => void;
  onDelete: (id: number) => void;
  onFieldUpdate: ElementTableProps['onFieldUpdate'];
  onArticleUpdate: ElementTableProps['onArticleUpdate'];
  onArticleDelete: (articleId: number, elementId: number) => Promise<void>;
  editingField: { id: number; field: EditableField | CoefField } | null;
  setEditingField: (v: { id: number; field: EditableField | CoefField } | null) => void;
  articleEditing: ArticleEditingState;
  setArticleEditing: (v: ArticleEditingState) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const badge = typeBadge(element);
  const rowCount = Math.max(articles.length, 1);
  const displayArticles: Article[] =
    articles.length > 0
      ? articles
      : [
          {
            id: -1,
            element_id: element.id,
            type_label: '',
            designation: '',
            power_w: 0,
            quantity: 1,
            coef_ks: 1,
            coef_ku: 1,
            order_index: 0,
          },
        ];

  const groupBorder = 'border-l-2 border-l-blue-200 dark:border-l-blue-800';

  return (
    <>
      {displayArticles.map((article, idx) => (
        <tr
          key={article.id}
          ref={idx === 0 ? setNodeRef : undefined}
          style={idx === 0 ? style : undefined}
          className={`hover:bg-gray-50 dark:hover:bg-gray-750 ${
            idx < rowCount - 1
              ? 'border-b border-dashed border-gray-200 dark:border-gray-600'
              : 'border-b border-gray-100 dark:border-gray-700'
          }`}
        >
          {idx === 0 && (
            <>
              <td
                rowSpan={rowCount}
                className={`px-2 py-2 text-center text-gray-400 cursor-grab align-middle ${groupBorder}`}
                {...attributes}
                {...listeners}
              >
                ⋮⋮
              </td>
              <td rowSpan={rowCount} className="px-1 py-2 text-center align-middle">
                <AddTypeButton onClick={() => onAddTypeToDepart(element)} />
              </td>
              <td rowSpan={rowCount} className="px-3 py-2 align-middle">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
              </td>
              <td rowSpan={rowCount} className="px-3 py-2 align-middle">
                <InlineRepereCell
                  element={element}
                  editingField={editingField}
                  setEditingField={setEditingField}
                  onCommit={(v) => void onFieldUpdate(element.id, 'repere', v)}
                />
              </td>
            </>
          )}
          <td className="px-3 py-2 text-sm max-w-[140px]" title={displayArticleTypeLabel(article, element, idx === 0)}>
            {article.id > 0 ? (
              <ArticleTypeLabelCell
                article={article}
                element={element}
                isFirstArticle={idx === 0}
                articleEditing={articleEditing}
                setArticleEditing={setArticleEditing}
                onCommit={(v) => void onArticleUpdate(article.id, 'type_label', v)}
              />
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2 text-sm max-w-[180px]">
            {article.id > 0 ? (
              <ArticleDesignationCell
                article={article}
                articleEditing={articleEditing}
                setArticleEditing={setArticleEditing}
                onCommit={(v) => void onArticleUpdate(article.id, 'designation', v)}
                canDelete={articles.length > 1}
                onDelete={() => void onArticleDelete(article.id, element.id)}
              />
            ) : (
              <span className="text-gray-400 italic text-sm">—</span>
            )}
          </td>
          <td className="px-3 py-2 text-sm text-right">
            {article.id > 0 ? (
              <ArticlePowerCell
                article={article}
                articleEditing={articleEditing}
                setArticleEditing={setArticleEditing}
                onCommit={(v) => void onArticleUpdate(article.id, 'power_w', v)}
              />
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2 text-sm text-center">
            {article.id > 0 ? (
              <ArticleQuantityCell
                article={article}
                articleEditing={articleEditing}
                setArticleEditing={setArticleEditing}
                onCommit={(v) => void onArticleUpdate(article.id, 'quantity', v)}
              />
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2 text-sm text-center">
            {article.id > 0 ? (
              <ArticleCoefCell
                article={article}
                field="coef_ks"
                articleEditing={articleEditing}
                setArticleEditing={setArticleEditing}
                onCommit={(v) => void onArticleUpdate(article.id, 'coef_ks', v)}
              />
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2 text-sm text-center">
            {article.id > 0 ? (
              <ArticleCoefCell
                article={article}
                field="coef_ku"
                articleEditing={articleEditing}
                setArticleEditing={setArticleEditing}
                onCommit={(v) => void onArticleUpdate(article.id, 'coef_ku', v)}
              />
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2 text-sm text-right font-medium">
            {article.id > 0 ? (
              formatNumber(wattsToKw(calcArticlePower(article)), 3)
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          {idx === 0 && (
            <td rowSpan={rowCount} className="px-3 py-2 align-middle">
              <button
                type="button"
                onClick={() => onDelete(element.id)}
                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                title="Supprimer le départ"
              >
                🗑️
              </button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function SortableDataRow({
  element,
  onEdit,
  onAddTypeToDepart,
  onDelete,
  onFieldUpdate,
  editingField,
  setEditingField,
}: {
  element: Element;
  onEdit: (el: Element) => void;
  onAddTypeToDepart: (el: Element) => void;
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
  const totalPower = calcPuissanceTotale(element);
  const badge = typeBadge(element);
  const typeLabel = displayTypeLabel(element);
  const emplacement = displayEmplacement(element);
  const { ks, ku } = resolveElementCoefs(element);
  const coefsLine = formatCoefsLine(ks, ku);

  const coefFields: Array<{ key: CoefField; label: string }> = [
    { key: 'coef_ks', label: 'Ks' },
    { key: 'coef_ku', label: 'Ku' },
  ];

  return (
    <>
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
        <td className="px-1 py-2 text-center">
          <AddTypeButton
            disabled={isAttente}
            onClick={() => onAddTypeToDepart(element)}
          />
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
              format={(v) =>
                c.key === 'coef_ku' ? formatKuDisplay(v) : v.toFixed(2)
              }
              title={coefsLine}
              onCommit={(v) => {
                const clamped = Math.min(1, Math.max(0, v));
                void onFieldUpdate(element.id, c.key, clamped);
              }}
            />
          </td>
        ))}
      <td className="px-3 py-2 text-sm text-right font-medium">
          {formatNumber(wattsToKw(totalPower), 3)}
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
      <tr className="border-b border-gray-50 dark:border-gray-800">
        <td />
        <td />
        <td colSpan={TOTAL_COLUMN_COUNT - 2} className="px-3 py-0.5 text-xs text-gray-400 italic">
          {coefsLine}
        </td>
      </tr>
    </>
  );
}

export function ElementTable({
  elements,
  articlesByElement,
  onEdit,
  onAddTypeToDepart,
  onDelete,
  onAddElementUnderJdb,
  onReorder,
  onFieldUpdate,
  onArticleUpdate,
  onArticleDelete,
}: ElementTableProps) {
  const [editingField, setEditingField] = useState<{
    id: number;
    field: EditableField | CoefField;
  } | null>(null);
  const [articleEditing, setArticleEditing] = useState<ArticleEditingState>(null);

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

  const totalPower = panelTotalPower(elements, articlesByElement);
  const tableRows = buildElementTableRows(elements, articlesByElement);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className="w-full text-left min-w-[1000px]">
          <thead>
            <tr className="bg-primary text-white text-xs uppercase tracking-wide">
              <th className="w-8 px-2 py-3" />
              <th className="w-8 px-1 py-3" title="Ajouter un type sur le départ" />
              <th className="px-3 py-3">Cat.</th>
              <th className="px-3 py-3">Repère</th>
              <th className="px-3 py-3 min-w-[100px]">Type</th>
              <th className="px-3 py-3 min-w-[100px]">Désignation</th>
              <th className="px-3 py-3 text-right">P. Unitaire (kW)</th>
              <th className="px-3 py-3 text-center">Qté</th>
              <th className="px-3 py-3 text-center w-14" title="Coefficient de simultanéité">
                Ks
              </th>
              <th className="px-3 py-3 text-center w-14" title="Coefficient d'utilisation">
                Ku
              </th>
              <th className="px-3 py-3 text-right">P. totale (kW)</th>
              <th className="px-3 py-3 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            <SortableContext
              items={elements.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              {tableRows.map((row, idx) => {
                if (row.kind === 'jdb') {
                  return (
                    <JeuDeBarresRow
                      key={`jdb-${row.element.id}`}
                      element={row.element}
                      onDelete={onDelete}
                      onAddElement={onAddElementUnderJdb}
                      onFieldUpdate={onFieldUpdate}
                      editingField={editingField}
                      setEditingField={setEditingField}
                    />
                  );
                }
                if (row.kind === 'subtotal') {
                  return (
                    <SubtotalRow
                      key={`subtotal-${idx}`}
                      label={row.label}
                      totalPower={row.totalPower}
                    />
                  );
                }
                if (row.element.is_multi) {
                  return (
                    <SortableMultiDepartRow
                      key={row.element.id}
                      element={row.element}
                      articles={articlesByElement[row.element.id] ?? []}
                      onAddTypeToDepart={onAddTypeToDepart}
                      onDelete={onDelete}
                      onFieldUpdate={onFieldUpdate}
                      onArticleUpdate={onArticleUpdate}
                      onArticleDelete={onArticleDelete}
                      editingField={editingField}
                      setEditingField={setEditingField}
                      articleEditing={articleEditing}
                      setArticleEditing={setArticleEditing}
                    />
                  );
                }
                return (
                  <SortableDataRow
                    key={row.element.id}
                    element={row.element}
                    onEdit={onEdit}
                    onAddTypeToDepart={onAddTypeToDepart}
                    onDelete={onDelete}
                    onFieldUpdate={onFieldUpdate}
                    editingField={editingField}
                    setEditingField={setEditingField}
                  />
                );
              })}
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
                  {formatNumber(wattsToKw(totalPower), 3)} kW
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

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Layers, Plus, GripVertical, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Element, ElementType, Favorite, PhaseType } from '@/types';
import {
  getNextRepere,
  defaultCoefsForType,
  formatNumber,
} from '@/utils/calculations';
import {
  multiDepartInstalledPower,
  multiDepartWithCoefs,
  multiDepartIntensity,
  newArticleTempId,
} from '@/utils/multiDepartHelpers';

type DepartType = Exclude<ElementType, 'jeu_de_barres'>;

interface ArticleFormItem {
  tempId: string;
  id?: number;
  designation: string;
  power_w: number;
  quantity: number;
  errors: { designation?: string; power_w?: string; quantity?: string };
}

interface DepartForm {
  type: DepartType;
  repere: string;
  phase_type: PhaseType;
  coef_ks: number;
  coef_ku: number;
  circuit: string;
  notes: string;
}

const MAX_ARTICLES = 20;
const VIOLET = '#7C3AED';

const TYPE_OPTIONS: Array<{ value: DepartType; label: string; icon: string }> = [
  { value: 'eclairage', label: 'Éclairage', icon: '💡' },
  { value: 'prise', label: 'Prise', icon: '🔌' },
  { value: 'divers', label: 'Divers', icon: '📦' },
];

function emptyArticle(): ArticleFormItem {
  return {
    tempId: newArticleTempId(),
    designation: '',
    power_w: 0,
    quantity: 1,
    errors: {},
  };
}

function buildDefaultDepart(type: DepartType, existingElements: Element[], contextJdb?: Element | null): DepartForm {
  const coefs = defaultCoefsForType(type, 'mono');
  return {
    type,
    repere: getNextRepere(existingElements, type, contextJdb),
    phase_type: 'mono',
    coef_ks: coefs.coef_ks,
    coef_ku: coefs.coef_ku,
    circuit: '',
    notes: '',
  };
}

function SortableArticleCard({
  article,
  index,
  canDelete,
  favorites,
  departType,
  onChange,
  onDelete,
  activeSuggestionId,
  setActiveSuggestionId,
}: {
  article: ArticleFormItem;
  index: number;
  canDelete: boolean;
  favorites: Favorite[];
  departType: DepartType;
  onChange: (tempId: string, patch: Partial<ArticleFormItem>) => void;
  onDelete: (tempId: string) => void;
  activeSuggestionId: string | null;
  setActiveSuggestionId: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: article.tempId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const linePower = article.power_w * article.quantity;
  const suggestions = favorites
    .filter(
      (f) =>
        f.type === departType &&
        f.designation.toLowerCase().includes(article.designation.toLowerCase())
    )
    .slice(0, 6);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-violet-200 bg-white dark:bg-gray-800 p-3 space-y-2"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-2 text-violet-400 cursor-grab touch-none"
          {...attributes}
          {...listeners}
          aria-label="Réordonner"
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1 space-y-2">
          <div className="relative">
            <label className="text-xs text-gray-500">Désignation</label>
            <input
              type="text"
              value={article.designation}
              onChange={(e) =>
                onChange(article.tempId, { designation: e.target.value, errors: {} })
              }
              onFocus={() => setActiveSuggestionId(article.tempId)}
              className={`input-field text-sm w-full ${
                article.errors.designation ? 'border-red-500' : ''
              }`}
              placeholder="Ex. Panneau LED 36W"
            />
            {activeSuggestionId === article.tempId && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-violet-200 bg-white dark:bg-gray-800 shadow-lg max-h-40 overflow-y-auto">
                {suggestions.map((fav) => (
                  <button
                    key={fav.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/20"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(article.tempId, {
                        designation: fav.designation,
                        power_w: fav.power_w,
                        errors: {},
                      });
                      setActiveSuggestionId(null);
                    }}
                  >
                    <span className="font-medium">{fav.designation}</span>
                    <span className="text-gray-400 ml-2">{fav.power_w} W</span>
                  </button>
                ))}
              </div>
            )}
            {article.errors.designation && (
              <p className="text-xs text-red-500 mt-0.5">{article.errors.designation}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500">P. unitaire (W)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={article.power_w || ''}
                onChange={(e) =>
                  onChange(article.tempId, {
                    power_w: parseFloat(e.target.value) || 0,
                    errors: {},
                  })
                }
                className={`input-field text-sm w-24 ${
                  article.errors.power_w ? 'border-red-500' : ''
                }`}
              />
              {article.errors.power_w && (
                <p className="text-xs text-red-500">{article.errors.power_w}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500">Qté</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onChange(article.tempId, {
                      quantity: Math.max(1, article.quantity - 1),
                      errors: {},
                    })
                  }
                  className="w-7 h-7 rounded border border-violet-200 text-violet-700 hover:bg-violet-50"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={article.quantity}
                  onChange={(e) =>
                    onChange(article.tempId, {
                      quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                      errors: {},
                    })
                  }
                  className={`input-field text-sm w-14 text-center ${
                    article.errors.quantity ? 'border-red-500' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange(article.tempId, { quantity: article.quantity + 1, errors: {} })
                  }
                  className="w-7 h-7 rounded border border-violet-200 text-violet-700 hover:bg-violet-50"
                >
                  +
                </button>
              </div>
              {article.errors.quantity && (
                <p className="text-xs text-red-500">{article.errors.quantity}</p>
              )}
            </div>
            <div className="text-sm font-semibold text-violet-700 pb-1">
              = {formatNumber(linePower, 0)} W
            </div>
          </div>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(article.tempId)}
            className="mt-1 text-red-400 hover:text-red-600"
            aria-label={`Supprimer l'article ${index + 1}`}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export interface MultiDepartModalProps {
  isOpen: boolean;
  panelId: number;
  existingElements: Element[];
  favorites: Favorite[];
  editElement?: Element | null;
  contextJdb?: Element | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function MultiDepartModal({
  isOpen,
  panelId,
  existingElements,
  favorites,
  editElement = null,
  contextJdb = null,
  onClose,
  onSuccess,
}: MultiDepartModalProps) {
  const isEdit = Boolean(editElement);
  const [depart, setDepart] = useState<DepartForm>(() =>
    buildDefaultDepart('eclairage', existingElements, contextJdb)
  );
  const [articles, setArticles] = useState<ArticleFormItem[]>([emptyArticle()]);
  const [repereError, setRepereError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!isOpen) return;
    if (editElement) {
      const type = editElement.type as DepartType;
      setDepart({
        type,
        repere: editElement.repere,
        phase_type: editElement.phase_type ?? 'mono',
        coef_ks: editElement.coef_ks,
        coef_ku: editElement.coef_ku,
        circuit: editElement.circuit ?? '',
        notes: editElement.notes ?? '',
      });
      void window.bilpow.elements.getArticles(editElement.id).then((loaded) => {
        if (loaded.length === 0) {
          setArticles([emptyArticle()]);
        } else {
          setArticles(
            loaded.map((a) => ({
              tempId: `existing-${a.id}`,
              id: a.id,
              designation: a.designation,
              power_w: a.power_w,
              quantity: a.quantity,
              errors: {},
            }))
          );
        }
      });
    } else {
      setDepart(buildDefaultDepart('eclairage', existingElements, contextJdb));
      setArticles([emptyArticle()]);
    }
    setRepereError('');
  }, [isOpen, editElement, existingElements, contextJdb]);

  useEffect(() => {
    if (!isEdit && isOpen) {
      setDepart((p) => ({
        ...p,
        repere: getNextRepere(existingElements, p.type, contextJdb),
      }));
    }
  }, [depart.type, isOpen, isEdit, existingElements, contextJdb]);

  const installedPower = useMemo(
    () => multiDepartInstalledPower(articles),
    [articles]
  );
  const totalWithCoefs = useMemo(
    () => multiDepartWithCoefs(articles, depart.coef_ks, depart.coef_ku),
    [articles, depart.coef_ks, depart.coef_ku]
  );
  const intensity = useMemo(
    () => multiDepartIntensity(articles, depart.coef_ks, depart.coef_ku),
    [articles, depart.coef_ks, depart.coef_ku]
  );

  const validateArticles = useCallback((): boolean => {
    let valid = true;
    const validated = articles.map((a) => {
      const errors: ArticleFormItem['errors'] = {};
      if (!a.designation.trim()) {
        errors.designation = 'Désignation requise';
        valid = false;
      }
      if (a.power_w < 0) {
        errors.power_w = 'Puissance invalide';
        valid = false;
      }
      if (a.quantity < 1) {
        errors.quantity = 'Qté min. 1';
        valid = false;
      }
      return { ...a, errors };
    });
    setArticles(validated);
    return valid;
  }, [articles]);

  const isFormValid = useMemo(() => {
    if (!depart.repere.trim()) return false;
    if (articles.length === 0) return false;
    return articles.every(
      (a) => a.designation.trim() && a.power_w >= 0 && a.quantity >= 1
    );
  }, [depart.repere, articles]);

  const handleTypeChange = (type: DepartType) => {
    const coefs = defaultCoefsForType(type, depart.phase_type);
    setDepart((p) => ({ ...p, type, ...coefs }));
  };

  const handleArticleChange = (tempId: string, patch: Partial<ArticleFormItem>) => {
    setArticles((prev) =>
      prev.map((a) => (a.tempId === tempId ? { ...a, ...patch } : a))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setArticles((prev) => {
      const oldIndex = prev.findIndex((a) => a.tempId === active.id);
      const newIndex = prev.findIndex((a) => a.tempId === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depart.repere.trim()) {
      setRepereError('Le repère est requis');
      return;
    }
    setRepereError('');
    if (!validateArticles()) return;

    setIsLoading(true);
    let createdElementId: number | null = null;

    try {
      const typeLabel =
        depart.type === 'prise'
          ? depart.phase_type === 'tri'
            ? 'Triphasé'
            : 'Monophasé'
          : 'Départ multi-articles';

      if (isEdit && editElement) {
        await window.bilpow.elements.update({
          id: editElement.id,
          type: depart.type,
          repere: depart.repere.trim(),
          type_label: typeLabel,
          phase_type: depart.phase_type,
          coef_ks: depart.coef_ks,
          coef_ku: depart.coef_ku,
          circuit: depart.circuit.trim() || undefined,
          notes: depart.notes.trim() || undefined,
          is_multi: true,
        });

        const existingIds = new Set(
          articles.filter((a) => a.id != null).map((a) => a.id as number)
        );
        const original = await window.bilpow.elements.getArticles(editElement.id);
        for (const orig of original) {
          if (!existingIds.has(orig.id)) {
            await window.bilpow.elements.deleteArticle(orig.id);
          }
        }

        for (let i = 0; i < articles.length; i++) {
          const a = articles[i]!;
          if (a.id != null) {
            await window.bilpow.elements.updateArticle({
              id: a.id,
              type_label: a.designation.trim(),
              designation: a.designation.trim(),
              power_w: a.power_w,
              quantity: a.quantity,
              order_index: i,
            });
          } else {
            await window.bilpow.elements.createArticle({
              element_id: editElement.id,
              type_label: a.designation.trim(),
              designation: a.designation.trim(),
              power_w: a.power_w,
              quantity: a.quantity,
              order_index: i,
            });
          }
        }

        toast.success('Départ mis à jour avec succès');
      } else {
        const created = await window.bilpow.elements.create({
          panel_id: panelId,
          type: depart.type,
          repere: depart.repere.trim(),
          type_label: typeLabel,
          phase_type: depart.phase_type,
          power_w: 0,
          quantity: 1,
          coef_ks: depart.coef_ks,
          coef_ku: depart.coef_ku,
          circuit: depart.circuit.trim() || undefined,
          notes: depart.notes.trim() || undefined,
          is_multi: true,
        });
        createdElementId = created.id;

        for (let i = 0; i < articles.length; i++) {
          const a = articles[i]!;
          await window.bilpow.elements.createArticle({
            element_id: created.id,
            type_label: a.designation.trim(),
            designation: a.designation.trim(),
            power_w: a.power_w,
            quantity: a.quantity,
            order_index: i,
          });
        }

        toast.success(`Départ créé avec ${articles.length} articles`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      if (createdElementId != null) {
        try {
          await window.bilpow.elements.delete(createdElementId);
        } catch {
          /* rollback best effort */
        }
      }
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 text-white" style={{ backgroundColor: VIOLET }}>
          <div className="flex items-center gap-3">
            <Layers size={22} />
            <div>
              <h2 className="text-lg font-semibold">
                {isEdit ? 'Modifier le départ multi-articles' : 'Nouveau départ multi-articles'}
              </h2>
              <p className="text-sm text-violet-100">
                Un circuit alimentant plusieurs types d&apos;appareils
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row gap-0 min-h-0">
            <div className="md:w-[40%] p-5 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleTypeChange(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        depart.type === opt.value
                          ? 'text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                      style={
                        depart.type === opt.value ? { backgroundColor: VIOLET } : undefined
                      }
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Repère</label>
                <input
                  type="text"
                  value={depart.repere}
                  onChange={(e) => {
                    setDepart((p) => ({ ...p, repere: e.target.value }));
                    setRepereError('');
                  }}
                  className={`input-field w-full font-mono ${repereError ? 'border-red-500' : ''}`}
                />
                {repereError && <p className="text-xs text-red-500 mt-0.5">{repereError}</p>}
              </div>

              {depart.type === 'prise' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Phase</label>
                  <div className="flex gap-2">
                    {(['mono', 'tri'] as PhaseType[]).map((ph) => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => {
                          const coefs = defaultCoefsForType('prise', ph);
                          setDepart((p) => ({ ...p, phase_type: ph, ...coefs }));
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${
                          depart.phase_type === ph
                            ? 'text-white'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}
                        style={
                          depart.phase_type === ph ? { backgroundColor: VIOLET } : undefined
                        }
                      >
                        {ph === 'mono' ? 'Mono' : 'Tri'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ks</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={depart.coef_ks}
                    onChange={(e) =>
                      setDepart((p) => ({
                        ...p,
                        coef_ks: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                      }))
                    }
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ku</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={depart.coef_ku}
                    onChange={(e) =>
                      setDepart((p) => ({
                        ...p,
                        coef_ku: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                      }))
                    }
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Circuit (optionnel)
                </label>
                <input
                  type="text"
                  value={depart.circuit}
                  onChange={(e) => setDepart((p) => ({ ...p, circuit: e.target.value }))}
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Notes (optionnel)
                </label>
                <textarea
                  value={depart.notes}
                  onChange={(e) => setDepart((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </div>
            </div>

            <div className="md:w-[60%] p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Articles de ce départ
                </h3>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: VIOLET }}
                >
                  {articles.length}
                </span>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={articles.map((a) => a.tempId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                    {articles.map((article, index) => (
                      <SortableArticleCard
                        key={article.tempId}
                        article={article}
                        index={index}
                        canDelete={articles.length > 1}
                        favorites={favorites}
                        departType={depart.type}
                        onChange={handleArticleChange}
                        onDelete={(tempId) =>
                          setArticles((prev) => prev.filter((a) => a.tempId !== tempId))
                        }
                        activeSuggestionId={activeSuggestionId}
                        setActiveSuggestionId={setActiveSuggestionId}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <button
                type="button"
                disabled={articles.length >= MAX_ARTICLES}
                onClick={() => setArticles((prev) => [...prev, emptyArticle()])}
                className="flex items-center justify-center gap-2 w-full py-2 border-2 border-dashed rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                style={{ borderColor: VIOLET, color: VIOLET }}
              >
                <Plus size={16} />
                Ajouter un article
              </button>

              <div
                className="rounded-lg border-2 p-4 text-sm space-y-1"
                style={{
                  backgroundColor: '#F5F3FF',
                  borderColor: VIOLET,
                  color: '#5B21B6',
                }}
              >
                <p className="font-bold uppercase text-xs tracking-wide">
                  Récapitulatif du départ
                </p>
                <p>
                  Articles : <strong>{articles.length}</strong>
                </p>
                <p>
                  Puissance installée : <strong>{formatNumber(installedPower, 0)} W</strong>
                </p>
                <p>
                  Avec Ks ({depart.coef_ks}) × Ku ({depart.coef_ku}) :{' '}
                  <strong>{formatNumber(totalWithCoefs, 1)} W</strong>
                </p>
                <p>
                  Intensité estimée : <strong>{formatNumber(intensity, 2)} A</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="btn-secondary">
              Annuler
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isLoading}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: VIOLET }}
            >
              {isLoading ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le départ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AddMultiDepartModal(
  props: Omit<MultiDepartModalProps, 'editElement'>
): JSX.Element {
  return <MultiDepartModal {...props} />;
}

export function EditMultiDepartModal(
  props: Omit<MultiDepartModalProps, 'editElement'> & { editElement: Element }
): JSX.Element {
  return <MultiDepartModal {...props} />;
}

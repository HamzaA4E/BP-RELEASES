import { useState, useEffect, useMemo } from 'react';
import type { Element, ElementType, ElementRowKind, Favorite, PhaseType } from '@/types';
import { FavoriteCard } from './FavoriteCard';
import {
  getNextRepere,
  generateReperePreview,
  defaultCoefsForType,
  calcPuissanceTotale,
  formatCoefsLine,
  wattsToKw,
  formatNumber,
} from '@/utils/calculations';
import {
  displayEmplacement,
  displayTypeLabel,
  jeuDeBarresTitle,
  jdbCategoryLabel,
  getActiveJeuDeBarres,
  getJeuDeBarresForElement,
  isTypeAllowedUnderJdb,
  defaultElementTypeForJdb,
  departCategoryOf,
  findElementByRepereAndCategory,
} from '@/utils/elementHelpers';


type ElementFormType = Exclude<ElementType, 'jeu_de_barres'>;

interface FormData {
  type: ElementFormType;
  repere: string;
  type_label: string;
  emplacement: string;
  power_w: number;
  quantity: number;
  phase_type: PhaseType;
  coef_ks: number;
  coef_ku: number;
  notes: string;
}

interface AddElementModalProps {
  isOpen: boolean;
  existingElements: Element[];
  favorites: Favorite[];
  editElement?: Element | null;
  /** When set, the new element is added under this jeu de barres section. */
  contextJdb?: Element | null;
  /** When set, adds a new type/article to this existing depart (same category). */
  addTypeToDepart?: Element | null;
  onClose: () => void;
  onSave: (data: {
    type: ElementFormType;
    repere: string;
    type_label: string;
    emplacement: string;
    power_w: number;
    quantity: number;
    phase_type: PhaseType;
    coef_ks: number;
    coef_ku: number;
    notes?: string;
  }) => Promise<void>;
  onSaveMultiple?: (
    items: Array<{
      type: ElementFormType;
      repere: string;
      type_label: string;
      emplacement: string;
      power_w: number;
      quantity: number;
      phase_type: PhaseType;
      coef_ks: number;
      coef_ku: number;
      notes?: string;
    }>
  ) => Promise<void>;
  onDeleteFavorite: (id: number) => void;
}

const TYPE_OPTIONS: Array<{
  value: ElementFormType;
  label: string;
  icon: string;
  color: string;
}> = [
  { value: 'eclairage', label: 'Éclairage', icon: '💡', color: 'bg-blue-600' },
  { value: 'prise', label: 'Prise', icon: '🔌', color: 'bg-emerald-600' },
  { value: 'attente', label: 'Attente', icon: '🔌', color: 'bg-slate-500' },
];

function buildDefaultForm(
  type: ElementFormType,
  existingElements: Element[]
): FormData {
  const phase_type: PhaseType = type === 'prise' ? 'mono' : 'mono';
  const coefs = defaultCoefsForType(type, phase_type);
  return {
    type,
    repere: getNextRepere(existingElements, type),
    type_label: '',
    emplacement: '',
    power_w: type === 'attente' ? 1000 : 0,
    quantity: 1,
    phase_type,
    ...coefs,
    notes: '',
  };
}

export function AddElementModal({
  isOpen,
  existingElements,
  favorites,
  editElement,
  contextJdb = null,
  addTypeToDepart = null,
  onClose,
  onSave,
  onSaveMultiple,
  onDeleteFavorite,
}: AddElementModalProps) {
  const [formData, setFormData] = useState<FormData>(() =>
    buildDefaultForm('eclairage', existingElements)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [showCoefs, setShowCoefs] = useState(false);
  const [powerInput, setPowerInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');

  const isEdit = Boolean(editElement);
  const isAddTypeMode = Boolean(addTypeToDepart);

  const insertIndex = addTypeToDepart
    ? Math.max(0, existingElements.findIndex((e) => e.id === addTypeToDepart.id) + 1)
    : existingElements.length;
    const activeJdb =
    contextJdb ??
    (editElement
      ? getJeuDeBarresForElement(existingElements, editElement.id)
      : addTypeToDepart
        ? getJeuDeBarresForElement(existingElements, addTypeToDepart.id)
        : getActiveJeuDeBarres(existingElements, insertIndex));
        const typeNotAllowed =
        activeJdb != null &&
        !isTypeAllowedUnderJdb(formData.type, activeJdb);

  const filteredFavorites = useMemo(
    () => favorites.filter((f) => f.type === formData.type),
    [favorites, formData.type]
  );

  const typeLabelSuggestions = useMemo(() => {
    const query = formData.type_label.toLowerCase();
    return favorites
      .filter(
        (f) =>
          f.type === formData.type &&
          f.designation.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [favorites, formData.type, formData.type_label]);

  const reperePreview = useMemo(
    () => generateReperePreview(formData.repere.trim(), duplicateCount),
    [formData.repere, duplicateCount]
  );

  const previewUsedPower = useMemo(() => {
    const previewElement = {
      id: 0,
      panel_id: 0,
      type: formData.type,
      repere: formData.repere,
      designation: formData.type_label,
      type_label: formData.type_label,
      emplacement: formData.emplacement,
      row_kind: 'element' as ElementRowKind,
      bar_set_index: 0,
      phase_type: formData.phase_type,
      jdb_category: null,
      power_w: formData.power_w,
      quantity: formData.quantity,
      distance_m: 0,
      ku: 1,
      ks: 1,
      coef_ks: formData.coef_ks,
      coef_ku: formData.coef_ku,
      circuit: null,
      notes: null,
      is_multi: false,
      order_index: 0,
    };
    return calcPuissanceTotale(previewElement);
  }, [formData]);

  useEffect(() => {
    if (!isOpen) return;

    if (editElement && editElement.type !== 'jeu_de_barres') {
      const phase_type = editElement.phase_type ?? 'mono';
      setFormData({
        type: editElement.type as ElementFormType,
        repere: editElement.repere,
        type_label: displayTypeLabel(editElement),
        emplacement: displayEmplacement(editElement),
        power_w: editElement.power_w,
        quantity: editElement.quantity,
        phase_type,
        coef_ks: editElement.coef_ks,
        coef_ku: editElement.coef_ku,
        notes: editElement.notes ?? '',
      });
      setPowerInput(String(wattsToKw(editElement.power_w)));
  setQuantityInput(String(editElement.quantity));
    } else if (addTypeToDepart) {
      const type = addTypeToDepart.type as ElementFormType;
      const phase_type = addTypeToDepart.phase_type ?? 'mono';
      setFormData({
        type,
        repere: addTypeToDepart.repere,
        type_label: '',
        emplacement: '',
        power_w: 0,
        quantity: 1,
        phase_type,
        coef_ks: addTypeToDepart.coef_ks,
        coef_ku: addTypeToDepart.coef_ku,
        notes: '',
      });
      setPowerInput('1');
  setQuantityInput('1');
    } else if (contextJdb) {
      const defaultType = defaultElementTypeForJdb(contextJdb);
      setFormData(buildDefaultForm(defaultType, existingElements));
      setPowerInput('1');
setQuantityInput('1');
    } else {
      setFormData(buildDefaultForm('eclairage', existingElements));
      setPowerInput('1');
setQuantityInput('1');
    }
    setErrors({});
    setDuplicateCount(1);
    setShowCoefs(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialiser uniquement à l'ouverture
  }, [isOpen, editElement?.id, contextJdb?.id, addTypeToDepart?.id]);

  useEffect(() => {
    if (!editElement && !addTypeToDepart && isOpen) {
      setFormData((p) => ({
        ...p,
        repere: getNextRepere(existingElements, p.type),
      }));
    }
  }, [formData.type, isOpen, editElement, addTypeToDepart, existingElements]);

  const handleTypeChange = (type: ElementFormType) => {
    if (isAddTypeMode && activeJdb && !isTypeAllowedUnderJdb(type, activeJdb)) return;
    setDuplicateCount(1);
    const phase_type: PhaseType = type === 'prise' ? formData.phase_type : 'mono';
    const coefs = defaultCoefsForType(type, phase_type);
    setFormData((p) => ({
      ...p,
      type,
      phase_type,
      type_label: type === 'prise' ? '' : p.type_label,
      power_w: type === 'attente' ? (p.power_w > 0 ? p.power_w : 1000) : p.power_w,
      ...coefs,
    }));
  };

  const handlePrisePhaseChange = (phase_type: PhaseType) => {
    const coefs = defaultCoefsForType('prise', phase_type);
    setFormData((p) => ({
      ...p,
      phase_type,
      ...coefs,
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!isAddTypeMode && !formData.repere.trim()) newErrors.repere = 'Le repère est requis';
    if (!formData.type_label.trim()) newErrors.type_label = 'Le type est requis';
    if (formData.power_w < 0) newErrors.power_w = 'La puissance ne peut pas être négative';
    if (formData.type !== 'attente' && formData.power_w === 0) {
      newErrors.power_w = 'La puissance doit être supérieure à 0';
    }
    if (formData.quantity < 1) newErrors.quantity = 'La quantité doit être au moins 1';

    if (formData.repere.trim()) {
      const formCategory = departCategoryOf({
        type: formData.type,
        phase_type: formData.phase_type,
      });
      const excludeId = isEdit
        ? editElement?.id
        : isAddTypeMode
          ? addTypeToDepart?.id
          : undefined;
      const existing = findElementByRepereAndCategory(
        existingElements,
        formData.repere,
        formCategory,
        excludeId
      );
      if (existing) {
        newErrors.repere =
          'Ce repère existe déjà pour cette catégorie — utilisez + sur la ligne pour ajouter un autre type';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildPayload = (repere: string) => ({
    type: formData.type,
    repere: repere.trim(),
    type_label: formData.type_label.trim(),
    emplacement: formData.emplacement.trim(),
    power_w: formData.power_w,
    quantity: formData.quantity,
    phase_type: formData.phase_type,
    coef_ks: formData.coef_ks,
    coef_ku: formData.coef_ku,
    notes: formData.notes.trim() || undefined,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeNotAllowed) return;
    if (!validate()) return;

    setSaving(true);
    try {
      if (isEdit || duplicateCount === 1) {
        await onSave(buildPayload(formData.repere));
      } else if (onSaveMultiple) {
        const items = reperePreview.map((repere) => buildPayload(repere));
        await onSaveMultiple(items);
      } else {
        for (const repere of reperePreview) {
          await onSave(buildPayload(repere));
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleFavoriteSelect = (fav: Favorite) => {
    if (fav.type === 'jeu_de_barres') return;
    if (isAddTypeMode && activeJdb && !isTypeAllowedUnderJdb(fav.type, activeJdb)) return;
    const coefs = defaultCoefsForType(fav.type, formData.phase_type);
    setPowerInput(String(wattsToKw(fav.power_w)));
    setFormData((p) => ({
      ...p,
      type_label: fav.designation,
      power_w: fav.power_w,
      type: fav.type,
      ...coefs,
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative ml-auto w-full max-w-2xl bg-white dark:bg-gray-800 shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-primary dark:text-white">
            {editElement ? "Modifier l'élément" : 'Ajouter un élément'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {contextJdb && !editElement && (
              <div className="rounded-lg border border-[#1E3A5F]/30 bg-[#1E3A5F]/5 dark:bg-[#1E3A5F]/20 px-4 py-3 text-sm">
                <span className="text-slate-500 dark:text-slate-400">Section : </span>
                <span className="font-semibold text-[#1E3A5F] dark:text-blue-300">
                  {jeuDeBarresTitle(contextJdb)}
                </span>
              </div>
            )}
            {isAddTypeMode && addTypeToDepart && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm">
                <span className="text-slate-500 dark:text-slate-400">Ajout au repère </span>
                <span className="font-mono font-bold text-primary dark:text-blue-300">
                  {addTypeToDepart.repere}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {' '}
                  — même type de ligne ou autre catégorie (mono, tri, attente)
                </span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
              <div className="grid grid-cols-3 gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const locked =
                    isAddTypeMode &&
                    activeJdb != null &&
                    !isTypeAllowedUnderJdb(opt.value, activeJdb);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={locked}
                      onClick={() => handleTypeChange(opt.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                        locked
                          ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-slate-400 border-slate-200'
                          : formData.type === opt.value
                            ? `${opt.color} text-white border-transparent shadow-sm`
                            : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {false && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 hidden">Phase</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                  <button
                    type="button"
                    onClick={() => handlePrisePhaseChange('mono')}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      formData.phase_type === 'mono'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🔵 Monophasé — 230V
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrisePhaseChange('tri')}
                    className={`flex-1 px-4 py-2 text-sm font-medium border-l border-slate-200 dark:border-slate-600 transition-colors ${
                      formData.phase_type === 'tri'
                        ? 'bg-orange-500 text-white'
                        : 'bg-white dark:bg-gray-800 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🔴 Triphasé — 400V
                  </button>
                </div>
              </div>
            )}

            {typeNotAllowed && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                ⚠ Ce type d&apos;élément n&apos;est pas autorisé sous un jeu de barres &quot;
                {activeJdb ? displayTypeLabel(activeJdb) : ''}&quot; de catégorie &quot;
                {activeJdb ? jdbCategoryLabel(activeJdb.jdb_category) : ''}&quot;. Choisissez un
                autre type d&apos;élément.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Repère {isAddTypeMode ? '' : '*'}
                </label>
                <input
                  type="text"
                  value={formData.repere}
                  readOnly={isAddTypeMode}
                  onChange={(e) => setFormData((p) => ({ ...p, repere: e.target.value }))}
                  className={`input-field font-mono ${errors.repere ? 'border-red-500' : ''} ${
                    isAddTypeMode ? 'bg-gray-50 dark:bg-gray-700/50 cursor-default' : ''
                  }`}
                  placeholder={
                    formData.type === 'eclairage'
                      ? 'E1'
                      : formData.type === 'attente'
                        ? 'A1'
                        : 'P1'
                  }
                />
                {errors.repere && (
                  <p className="text-red-500 text-xs mt-1">{errors.repere}</p>
                )}
              </div>
              <div className="relative">
                {formData.type === 'prise' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Catégorie *
                    </label>
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                      <button
                        type="button"
                        onClick={() => handlePrisePhaseChange('mono')}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                          formData.phase_type === 'mono'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Monophasé
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrisePhaseChange('tri')}
                        className={`flex-1 px-3 py-2 text-sm font-medium border-l border-slate-200 dark:border-slate-600 transition-colors ${
                          formData.phase_type === 'tri'
                            ? 'bg-orange-500 text-white'
                            : 'bg-white dark:bg-gray-800 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Triphasé
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                    <input
                      type="text"
                      value={formData.type_label}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, type_label: e.target.value }))
                      }
                      className={`input-field ${errors.type_label ? 'border-red-500' : ''}`}
                      placeholder="Ex: Panneau LED 36W"
                      list="type-label-suggestions"
                    />
                    <datalist id="type-label-suggestions">
                      {typeLabelSuggestions.map((f) => (
                        <option key={f.id} value={f.designation} />
                      ))}
                    </datalist>
                    {errors.type_label && (
                      <p className="text-red-500 text-xs mt-1">{errors.type_label}</p>
                    )}
                  </>
                )}
              </div>
              {formData.type === 'prise' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                  <input
                    type="text"
                    value={formData.type_label}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, type_label: e.target.value }))
                    }
                    className={`input-field ${errors.type_label ? 'border-red-500' : ''}`}
                    placeholder="Ex: Prise normale, RJ45, Prise étanche..."
                    list="prise-type-label-suggestions"
                  />
                  <datalist id="prise-type-label-suggestions">
                    {typeLabelSuggestions.map((f) => (
                      <option key={f.id} value={f.designation} />
                    ))}
                  </datalist>
                  {errors.type_label && (
                    <p className="text-red-500 text-xs mt-1">{errors.type_label}</p>
                  )}
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Désignation
                </label>
                <input
                  type="text"
                  value={formData.emplacement}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, emplacement: e.target.value }))
                  }
                  className="input-field"
                  placeholder="Emplacement ou repère de pose"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Puissance (kW) {formData.type !== 'attente' ? '*' : ''}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  value={powerInput}
                  onChange={(e) => {
                    const value = e.target.value;
                  
                    setPowerInput(value);
                  
                    setFormData((p) => ({
                      ...p,
                      power_w: value === '' ? 0 : Math.round(Number(value) * 1000),
                    }));
                  }}
                  className={`input-field ${errors.power_w ? 'border-red-500' : ''}`}
                />
                {errors.power_w && (
                  <p className="text-red-500 text-xs mt-1">{errors.power_w}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Quantité *
                </label>
                <input
                  type="number"
                  min={1}
                  value={quantityInput}
                  onChange={(e) => {
                    const value = e.target.value;
                  
                    setQuantityInput(value);
                  
                    setFormData((p) => ({
                      ...p,
                      quantity: value === '' ? 0 : Number(value),
                    }));
                  }}
                  className={`input-field ${errors.quantity ? 'border-red-500' : ''}`}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCoefs(!showCoefs)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-slate-400 transition-transform ${showCoefs ? 'rotate-90' : ''}`}
                  >
                    ▶
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Coefficients de calcul
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatCoefsLine(formData.coef_ks, formData.coef_ku)}
                  </span>
                </div>
              </button>
              {showCoefs && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-600 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        {
                          key: 'coef_ks' as const,
                          label: 'Ks',
                          desc: 'Simultanéité',
                          min: 0,
                          max: 1,
                          step: 0.05,
                        },
                        {
                          key: 'coef_ku' as const,
                          label: 'Ku',
                          desc: 'Utilisation',
                          min: 0,
                          max: 1,
                          step: 0.05,
                        },
                      ] as const
                    ).map((coef) => (
                      <label key={coef.key} className="block">
                        <span className="text-xs text-slate-500">
                          {coef.label} — {coef.desc}
                        </span>
                        <input
                          type="number"
                          step={coef.step}
                          min={coef.min}
                          max={coef.max}
                          value={formData[coef.key]}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              [coef.key]: Math.min(
                                coef.max,
                                Math.max(coef.min, parseFloat(e.target.value) || 0)
                              ),
                            }))
                          }
                          className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-center font-mono bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </label>
                    ))}
                  </div>
                  {/* <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                    Puissance totale = P. unitaire × Qté × Ks × Ku ={' '}
                    <strong className="text-primary dark:text-accent-light">
                      {formatNumber(wattsToKw(previewUsedPower), 3)} kW
                    </strong>
                    {' · '}
                    {formatCoefsLine(formData.coef_ks, formData.coef_ku)}
                  </p> */}
                </div>
              )}
            </div>

            {/* <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                className="input-field resize-none"
                rows={2}
                placeholder="Notes optionnelles"
              />
            </div> */}

            {!isEdit && !isAddTypeMode && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Dupliquer cet élément
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDuplicateCount(Math.max(1, duplicateCount - 1))}
                      className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors font-bold"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">
                      {duplicateCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDuplicateCount(Math.min(50, duplicateCount + 1))}
                      className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                {duplicateCount > 1 && (
                  <div className="text-xs text-slate-500 space-y-1">
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      Aperçu des repères générés :
                    </p>
                    <p className="font-mono text-sm text-primary dark:text-accent-light">
                      {reperePreview.join('  ·  ')}
                    </p>
                    <p>→ {duplicateCount} lignes seront ajoutées au tableau</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Favoris (
                {formData.type === 'eclairage'
                  ? 'Éclairage'
                  : formData.type === 'prise'
                    ? 'Prise'
                    : '—'}
                )
              </label>
              <div className="grid grid-cols-2 gap-2">
                {filteredFavorites.map((fav) => (
                  <FavoriteCard
                    key={fav.id}
                    favorite={fav}
                    onSelect={handleFavoriteSelect}
                    onDelete={onDeleteFavorite}
                    compact
                  />
                ))}
                {filteredFavorites.length === 0 && (
                  <p className="col-span-2 text-xs text-gray-400 text-center py-4">
                    Aucun favori pour ce type
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || typeNotAllowed}
              className="btn-primary disabled:opacity-50"
            >
              {saving
                ? 'Enregistrement...'
                : editElement
                  ? 'Mettre à jour'
                  : duplicateCount > 1
                    ? `Ajouter ${duplicateCount} éléments`
                    : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

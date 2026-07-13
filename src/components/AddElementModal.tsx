import { useState, useEffect, useMemo } from "react";
import type { Element, ElementType, Favorite, PhaseType } from "@/types";
import { FavoriteCard } from "./FavoriteCard";
import {
  getNextRepere,
  generateReperePreview,
  defaultCoefsForType,
  formatCoefsLine,
  wattsToKw,
} from "@/utils/calculations";
import {
  displayEmplacement,
  displayTypeLabel,
  jeuDeBarresTitle,
  jdbCategoryLabel,
  getActiveJeuDeBarres,
  getInsertIndexOutsideJdbSections,
  getJeuDeBarresForElement,
  isTypeAllowedUnderJdb,
  defaultElementTypeForJdb,
  departCategoryOf,
  findElementByRepereAndCategory,
} from "@/utils/elementHelpers";

type ElementFormType = Exclude<ElementType, "jeu_de_barres">;

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
  use_coefs: boolean;
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
  /** Optional prefix prepended to auto-generated repere numbers (e.g. "TD N3/"). */
  reperePrefix?: string | null;
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
    use_coefs: boolean;
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
      use_coefs: boolean;
      notes?: string;
    }>,
  ) => Promise<void>;
  onDeleteFavorite: (id: number) => void;
}

const TYPE_OPTIONS: Array<{
  value: ElementFormType;
  label: string;
  icon: string;
  color: string;
}> = [
  { value: "eclairage", label: "Éclairage", icon: "💡", color: "bg-blue-600" },
  { value: "prise", label: "Prise", icon: "🔌", color: "bg-emerald-600" },
  { value: "divers", label: "Divers", icon: "📦", color: "bg-slate-500" },
];

function buildDefaultForm(
  type: ElementFormType,
  existingElements: Element[],
  contextJdb?: Element | null,
  reperePrefix?: string | null,
  addTypeToDepart?: Element | null,
): FormData {
  const phase_type: PhaseType = type === "prise" ? "mono" : "mono";
  const coefs = defaultCoefsForType(type, phase_type);

  // For divers, if adding to an existing depart, use the parent's repere
  if (type === "divers" && addTypeToDepart) {
    return {
      type,
      repere: addTypeToDepart.repere,
      type_label: "",
      emplacement: "",
      power_w: 1000,
      quantity: 1,
      phase_type,
      ...coefs,
      use_coefs: false,
      notes: "",
    };
  }

  return {
    type,
    repere: getNextRepere(existingElements, type, contextJdb, reperePrefix),
    type_label: "",
    emplacement: "",
    power_w: type === "divers" ? 1000 : 0,
    quantity: 1,
    phase_type,
    ...coefs,
    use_coefs: false,
    notes: "",
  };
}

export function AddElementModal({
  isOpen,
  existingElements,
  favorites,
  editElement,
  contextJdb = null,
  addTypeToDepart = null,
  reperePrefix = null,
  onClose,
  onSave,
  onSaveMultiple,
  onDeleteFavorite,
}: AddElementModalProps) {
  const [formData, setFormData] = useState<FormData>(() =>
    buildDefaultForm("eclairage", existingElements, null, null, addTypeToDepart),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [showCoefs, setShowCoefs] = useState(false);
  const [powerInput, setPowerInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [coefKsInput, setCoefKsInput] = useState("");
  const [coefKuInput, setCoefKuInput] = useState("");

  const isEdit = Boolean(editElement);
  const isAddTypeMode = Boolean(addTypeToDepart);

  const insertIndex = addTypeToDepart
    ? Math.max(
        0,
        existingElements.findIndex((e) => e.id === addTypeToDepart.id) + 1,
      )
    : contextJdb || editElement
    ? existingElements.length
    : getInsertIndexOutsideJdbSections(existingElements);
  const activeJdb =
    contextJdb ??
    (editElement
      ? getJeuDeBarresForElement(existingElements, editElement.id)
      : addTypeToDepart
        ? getJeuDeBarresForElement(existingElements, addTypeToDepart.id)
        : null); // Don't auto-detect JDB when adding outside sections
  const typeNotAllowed =
    activeJdb != null && !isTypeAllowedUnderJdb(formData.type, activeJdb);

  const filteredFavorites = useMemo(
    () => favorites.filter((f) => f.type === formData.type),
    [favorites, formData.type],
  );

  const typeLabelSuggestions = useMemo(() => {
    const query = formData.type_label.toLowerCase();
    return favorites
      .filter(
        (f) =>
          f.type === formData.type &&
          f.designation.toLowerCase().includes(query),
      )
      .slice(0, 5);
  }, [favorites, formData.type, formData.type_label]);

  const reperePreview = useMemo(
    () => generateReperePreview(formData.repere.trim(), duplicateCount),
    [formData.repere, duplicateCount],
  );

  useEffect(() => {
    if (!isOpen) return;

    if (editElement && editElement.type !== "jeu_de_barres") {
      const phase_type = editElement.phase_type ?? "mono";
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
        use_coefs: editElement.use_coefs ?? false,
        notes: editElement.notes ?? "",
      });
      setPowerInput(String(wattsToKw(editElement.power_w)));
      setQuantityInput(String(editElement.quantity));
      setCoefKsInput(String(editElement.coef_ks));
      setCoefKuInput(String(editElement.coef_ku));
    } else if (addTypeToDepart) {
      const type = addTypeToDepart.type as ElementFormType;
      const phase_type = addTypeToDepart.phase_type ?? "mono";
      setFormData({
        type,
        repere: addTypeToDepart.repere,
        type_label: "",
        emplacement: "",
        power_w: 0,
        quantity: 1,
        phase_type,
        coef_ks: addTypeToDepart.coef_ks,
        coef_ku: addTypeToDepart.coef_ku,
        use_coefs: addTypeToDepart.use_coefs ?? false,
        notes: "",
      });
      setPowerInput("1");
      setQuantityInput("1");
      setCoefKsInput(String(addTypeToDepart.coef_ks));
      setCoefKuInput(String(addTypeToDepart.coef_ku));
    } else if (contextJdb) {
      const defaultType = defaultElementTypeForJdb(contextJdb);
      const defaultForm = buildDefaultForm(defaultType, existingElements, contextJdb, reperePrefix, addTypeToDepart);
      setFormData(defaultForm);
      setPowerInput("1");
      setQuantityInput("1");
      setCoefKsInput(String(defaultForm.coef_ks));
      setCoefKuInput(String(defaultForm.coef_ku));
    } else {
      const defaultForm = buildDefaultForm("eclairage", existingElements, null, reperePrefix, addTypeToDepart);
      setFormData(defaultForm);
      setPowerInput("1");
      setQuantityInput("1");
      setCoefKsInput(String(defaultForm.coef_ks));
      setCoefKuInput(String(defaultForm.coef_ku));
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
        repere: getNextRepere(existingElements, p.type, activeJdb, reperePrefix),
      }));
    }
    // When adding divers to a depart, ensure it keeps the parent's repere
    if (!editElement && addTypeToDepart && isOpen && formData.type === "divers") {
      setFormData((p) => ({
        ...p,
        repere: addTypeToDepart.repere,
      }));
    }
  }, [formData.type, isOpen, editElement, addTypeToDepart, existingElements, activeJdb, reperePrefix]);

  const handleTypeChange = (type: ElementFormType) => {
    if (isAddTypeMode && activeJdb && !isTypeAllowedUnderJdb(type, activeJdb))
      return;
    setDuplicateCount(1);
    const phase_type: PhaseType =
      type === "prise" ? formData.phase_type : "mono";
    const coefs = defaultCoefsForType(type, phase_type);

    // When adding divers to a depart, keep the parent's repere
    const newRepere = (type === "divers" && addTypeToDepart)
      ? addTypeToDepart.repere
      : (isAddTypeMode ? formData.repere : getNextRepere(existingElements, type, activeJdb, reperePrefix));

    setFormData((p) => ({
      ...p,
      type,
      phase_type,
      repere: newRepere,
      type_label: type === "prise" ? "" : p.type_label,
      power_w:
        type === "divers" ? (p.power_w > 0 ? p.power_w : 1000) : p.power_w,
      ...coefs,
    }));
  };

  const handlePrisePhaseChange = (phase_type: PhaseType) => {
    const coefs = defaultCoefsForType("prise", phase_type);
    setFormData((p) => ({
      ...p,
      phase_type,
      ...coefs,
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!isAddTypeMode && !formData.repere.trim())
      newErrors.repere = "Le repère est requis";
    if (!formData.type_label.trim())
      newErrors.type_label = "Le type est requis";
    if (formData.power_w < 0)
      newErrors.power_w = "La puissance ne peut pas être négative";
    if (formData.type !== "divers" && formData.power_w === 0) {
      newErrors.power_w = "La puissance doit être supérieure à 0";
    }
    if (formData.quantity < 1)
      newErrors.quantity = "La quantité doit être au moins 1";
    
    // Validate coefficients when use_coefs is enabled
    if (formData.use_coefs) {
      if (coefKsInput === "" || coefKuInput === "") {
        newErrors.coefs = "Les coefficients de calcul doivent être remplis";
      }
    }

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
        excludeId,
        activeJdb,
      );
      if (existing) {
        newErrors.repere =
          "Ce repère existe déjà pour cette catégorie — utilisez + sur la ligne pour ajouter un autre type";
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
    use_coefs: formData.use_coefs,
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

  const applyFavorite = (fav: Favorite) => {
    const phase_type: PhaseType =
      fav.type === "prise" ? formData.phase_type : "mono";
    const coefs = defaultCoefsForType(fav.type, phase_type);
    setPowerInput(String(wattsToKw(fav.power_w)));
    setFormData((p) => ({
      ...p,
      type_label: fav.designation,
      power_w: fav.power_w,
      type: fav.type,
      phase_type,
      ...coefs,
    }));
  };

  const handleTypeLabelChange = (value: string) => {
    const normalizedValue = value.trim().toLowerCase();
    const matchedFavorite = favorites.find(
      (fav) =>
        fav.type === formData.type &&
        fav.designation.trim().toLowerCase() === normalizedValue,
    );

    setFormData((p) => ({ ...p, type_label: value }));

    if (matchedFavorite) {
      applyFavorite(matchedFavorite);
    }
  };

  const handleFavoriteSelect = (fav: Favorite) => {
    if (
      isAddTypeMode &&
      activeJdb &&
      !isTypeAllowedUnderJdb(fav.type, activeJdb)
    )
      return;
    applyFavorite(fav);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative ml-auto w-full max-w-2xl bg-white dark:bg-gray-800 shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-primary dark:text-white">
            {editElement ? "Modifier l'élément" : "Ajouter un élément"}
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
                <span className="text-slate-500 dark:text-slate-400">
                  Section :{" "}
                </span>
                <span className="font-semibold text-[#1E3A5F] dark:text-blue-300">
                  {jeuDeBarresTitle(contextJdb)}
                </span>
              </div>
            )}
            {isAddTypeMode && addTypeToDepart && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm">
                <span className="text-slate-500 dark:text-slate-400">
                  Ajout au repère{" "}
                </span>
                <span className="font-mono font-bold text-primary dark:text-blue-300">
                  {addTypeToDepart.repere}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {" "}
                  — même type de ligne ou autre catégorie (mono, tri, divers)
                </span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Type
              </label>
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
                          ? "opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-slate-400 border-slate-200"
                          : formData.type === opt.value
                            ? `${opt.color} text-white border-transparent shadow-sm`
                            : "bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {typeNotAllowed && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                ⚠ Ce type d&apos;élément n&apos;est pas autorisé sous un jeu de
                barres &quot;
                {activeJdb ? displayTypeLabel(activeJdb) : ""}&quot; de
                catégorie &quot;
                {activeJdb ? jdbCategoryLabel(activeJdb.jdb_category) : ""}
                &quot;. Choisissez un autre type d&apos;élément.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Repère {isAddTypeMode ? "" : "*"}
                </label>
                {reperePrefix && !isEdit && formData.repere.startsWith(reperePrefix) ? (
                  <div className="flex items-stretch">
                    <div className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 px-3 py-2.5 border border-r-0 border-slate-300 dark:border-slate-600 rounded-l-md flex items-center shadow-sm">
                      <span className="text-sm font-mono font-semibold text-slate-600 dark:text-slate-300 select-none">
                        {reperePrefix}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={formData.repere.slice(reperePrefix.length)}
                      readOnly={isAddTypeMode}
                      onChange={(e) => {
                        const departurePart = e.target.value;
                        setFormData((p) => ({ ...p, repere: `${reperePrefix}${departurePart}` }));
                      }}
                      className={`flex-1 min-w-[4rem] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-r-md text-sm font-mono font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm ${errors.repere ? "border-red-500 focus:ring-red-500" : ""} ${
                        isAddTypeMode
                          ? "bg-gray-50 dark:bg-gray-700/50 cursor-not-allowed opacity-60"
                          : ""
                      }`}
                      placeholder={
                        formData.type === "eclairage"
                          ? "E1"
                          : formData.type === "divers"
                            ? "D1"
                            : "P1"
                      }
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={formData.repere}
                    readOnly={isAddTypeMode}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, repere: e.target.value }))
                    }
                    className={`input-field font-mono ${errors.repere ? "border-red-500" : ""} ${
                      isAddTypeMode
                        ? "bg-gray-50 dark:bg-gray-700/50 cursor-default"
                        : ""
                    }`}
                    placeholder={
                      formData.type === "eclairage"
                        ? "E1"
                        : formData.type === "divers"
                          ? "D1"
                          : "P1"
                    }
                  />
                )}
                {errors.repere && (
                  <p className="text-red-500 text-xs mt-1">{errors.repere}</p>
                )}
              </div>
              <div className="relative">
                {formData.type === "prise" ? (
                  <>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Catégorie *
                    </label>
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                      <button
                        type="button"
                        onClick={() => handlePrisePhaseChange("mono")}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                          formData.phase_type === "mono"
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-gray-800 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Monophasé
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrisePhaseChange("tri")}
                        className={`flex-1 px-3 py-2 text-sm font-medium border-l border-slate-200 dark:border-slate-600 transition-colors ${
                          formData.phase_type === "tri"
                            ? "bg-orange-500 text-white"
                            : "bg-white dark:bg-gray-800 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Triphasé
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Type *
                    </label>
                    <input
                      type="text"
                      value={formData.type_label}
                      onChange={(e) => handleTypeLabelChange(e.target.value)}
                      className={`input-field ${errors.type_label ? "border-red-500" : ""}`}
                      placeholder="Ex: Panneau LED 36W"
                      list="type-label-suggestions"
                    />
                    <datalist id="type-label-suggestions">
                      {typeLabelSuggestions.map((f) => (
                        <option key={f.id} value={f.designation} />
                      ))}
                    </datalist>
                    {errors.type_label && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.type_label}
                      </p>
                    )}
                  </>
                )}
              </div>
              {formData.type === "prise" && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Type *
                  </label>
                  <input
                    type="text"
                    value={formData.type_label}
                    onChange={(e) => handleTypeLabelChange(e.target.value)}
                    className={`input-field ${errors.type_label ? "border-red-500" : ""}`}
                    placeholder="Ex: Prise normale, RJ45, Prise étanche..."
                    list="prise-type-label-suggestions"
                  />
                  <datalist id="prise-type-label-suggestions">
                    {typeLabelSuggestions.map((f) => (
                      <option key={f.id} value={f.designation} />
                    ))}
                  </datalist>
                  {errors.type_label && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.type_label}
                    </p>
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
                  Puissance (kW) {formData.type !== "divers" ? "*" : ""}
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
                      power_w:
                        value === "" ? 0 : Math.round(Number(value) * 1000),
                    }));
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={`input-field ${errors.power_w ? "border-red-500" : ""}`}
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
                      quantity: value === "" ? 0 : Number(value),
                    }));
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={`input-field ${errors.quantity ? "border-red-500" : ""}`}
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
                    className={`text-slate-400 transition-transform ${showCoefs ? "rotate-90" : ""}`}
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
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.use_coefs}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, use_coefs: e.target.checked }))
                        }
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Appliquer les coefficients
                      </span>
                    </label>
                    <span className="text-xs text-slate-500">
                      {formData.use_coefs ? "Activé" : "Désactivé"}
                    </span>
                  </div>
                  {errors.coefs && (
                    <p className="text-red-500 text-xs mb-3">{errors.coefs}</p>
                  )}
                  <div className={`grid grid-cols-2 gap-3 transition-opacity ${!formData.use_coefs ? "opacity-50 pointer-events-none" : ""}`}>
                    {(
                      [
                        {
                          key: "coef_ks" as const,
                          label: "Ks",
                          desc: "Simultanéité",
                          min: 0,
                          max: 1,
                          step: 0.05,
                        },
                        {
                          key: "coef_ku" as const,
                          label: "Ku",
                          desc: "Utilisation",
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
                          value={coef.key === "coef_ks" ? coefKsInput : coefKuInput}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (coef.key === "coef_ks") {
                              setCoefKsInput(value);
                            } else {
                              setCoefKuInput(value);
                            }
                            // Only update formData if value is not empty
                            if (value !== "") {
                              setFormData((p) => ({
                                ...p,
                                [coef.key]: Math.min(
                                  coef.max,
                                  Math.max(
                                    coef.min,
                                    parseFloat(value) || 0,
                                  ),
                                ),
                              }));
                            }
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-center font-mono bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isEdit && !isAddTypeMode && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Dupliquer cet élément
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDuplicateCount(Math.max(1, duplicateCount - 1))
                      }
                      className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors font-bold"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">
                      {duplicateCount}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDuplicateCount(Math.min(50, duplicateCount + 1))
                      }
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
                      {reperePreview.join("  ·  ")}
                    </p>
                    <p>→ {duplicateCount} lignes seront ajoutées au tableau</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Favoris (
                {formData.type === "eclairage"
                  ? "Éclairage"
                  : formData.type === "prise"
                    ? "Prise"
                    : "Divers"}
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
                ? "Enregistrement..."
                : editElement
                  ? "Mettre à jour"
                  : duplicateCount > 1
                    ? `Ajouter ${duplicateCount} éléments`
                    : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

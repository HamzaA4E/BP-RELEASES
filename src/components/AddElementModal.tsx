import { useState, useEffect, useMemo } from 'react';
import type { Element, ElementType, Favorite } from '@/types';
import { FavoriteCard } from './FavoriteCard';
import { suggestRepere } from '@/utils/calculations';
import { displayEmplacement, displayTypeLabel, isBarSetRow } from '@/utils/elementHelpers';

interface AddElementModalProps {
  isOpen: boolean;
  existingElements: Element[];
  favorites: Favorite[];
  editElement?: Element | null;
  onClose: () => void;
  onSave: (data: {
    type: ElementType;
    repere: string;
    type_label: string;
    emplacement: string;
    power_w: number;
    quantity: number;
    ku: number;
    ks: number;
    fp: number;
    notes?: string;
  }) => Promise<void>;
  onDeleteFavorite: (id: number) => void;
}

export function AddElementModal({
  isOpen,
  existingElements,
  favorites,
  editElement,
  onClose,
  onSave,
  onDeleteFavorite,
}: AddElementModalProps) {
  const [type, setType] = useState<ElementType>('eclairage');
  const [repere, setRepere] = useState('');
  const [typeLabel, setTypeLabel] = useState('');
  const [emplacement, setEmplacement] = useState('');
  const [powerW, setPowerW] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [ku, setKu] = useState(1);
  const [ks, setKs] = useState(1);
  const [fp, setFp] = useState(1);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filteredFavorites = useMemo(
    () => favorites.filter((f) => f.type === type),
    [favorites, type]
  );

  const typeLabelSuggestions = useMemo(() => {
    const query = typeLabel.toLowerCase();
    return favorites
      .filter((f) => f.type === type && f.designation.toLowerCase().includes(query))
      .slice(0, 5);
  }, [favorites, type, typeLabel]);

  useEffect(() => {
    if (!isOpen) return;

    if (editElement && !isBarSetRow(editElement)) {
      setType(editElement.type);
      setRepere(editElement.repere);
      setTypeLabel(displayTypeLabel(editElement));
      setEmplacement(displayEmplacement(editElement));
      setPowerW(editElement.power_w);
      setQuantity(editElement.quantity);
      setKu(editElement.ku ?? 1);
      setKs(editElement.ks ?? 1);
      setFp(editElement.fp ?? 1);
      setNotes(editElement.notes ?? '');
    } else {
      setType('eclairage');
      const reperes = existingElements.map((e) => e.repere);
      setRepere(suggestRepere('eclairage', reperes));
      setTypeLabel('');
      setEmplacement('');
      setPowerW(0);
      setQuantity(1);
      setKu(1);
      setKs(1);
      setFp(1);
      setNotes('');
    }
    setErrors({});
  }, [isOpen, editElement, existingElements]);

  useEffect(() => {
    if (!editElement && isOpen) {
      const reperes = existingElements
        .filter((e) => e.type === type)
        .map((e) => e.repere);
      setRepere(suggestRepere(type, reperes));
    }
  }, [type, isOpen, editElement, existingElements]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!repere.trim()) newErrors.repere = 'Le repère est requis';
    if (!typeLabel.trim()) newErrors.type_label = 'Le type est requis';
    if (powerW < 0) newErrors.power_w = 'La puissance ne peut pas être négative';
    if (powerW === 0) newErrors.power_w = 'La puissance doit être supérieure à 0';
    if (quantity < 1) newErrors.quantity = 'La quantité doit être au moins 1';
    if (ku < 0) newErrors.ku = 'ku ne peut pas être négatif';
    if (ks < 0) newErrors.ks = 'ks ne peut pas être négatif';
    if (fp < 0) newErrors.fp = 'fp ne peut pas être négatif';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        type,
        repere: repere.trim(),
        type_label: typeLabel.trim(),
        emplacement: emplacement.trim(),
        power_w: powerW,
        quantity,
        ku,
        ks,
        fp,
        notes: notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleFavoriteSelect = (fav: Favorite) => {
    setTypeLabel(fav.designation);
    setPowerW(fav.power_w);
    setType(fav.type);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
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
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Catégorie</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                {(['eclairage', 'prise'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      type === t
                        ? 'bg-primary text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'eclairage' ? '💡 Éclairage' : '🔌 Prise'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Repère *</label>
                <input
                  type="text"
                  value={repere}
                  onChange={(e) => setRepere(e.target.value)}
                  className={`input-field ${errors.repere ? 'border-red-500' : ''}`}
                  placeholder={type === 'eclairage' ? 'E1' : 'P1'}
                />
                {errors.repere && <p className="text-red-500 text-xs mt-1">{errors.repere}</p>}
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                <input
                  type="text"
                  value={typeLabel}
                  onChange={(e) => setTypeLabel(e.target.value)}
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
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Désignation
                </label>
                <input
                  type="text"
                  value={emplacement}
                  onChange={(e) => setEmplacement(e.target.value)}
                  className="input-field"
                  placeholder="Emplacement ou repère de pose"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Puissance (W) *
                </label>
                <input
                  type="number"
                  min={0}
                  value={powerW}
                  onChange={(e) => setPowerW(Number(e.target.value))}
                  className={`input-field ${errors.power_w ? 'border-red-500' : ''}`}
                />
                {errors.power_w && (
                  <p className="text-red-500 text-xs mt-1">{errors.power_w}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Quantité *</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className={`input-field ${errors.quantity ? 'border-red-500' : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ku</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={ku}
                  onChange={(e) => setKu(Number(e.target.value))}
                  className={`input-field ${errors.ku ? 'border-red-500' : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ks</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={ks}
                  onChange={(e) => setKs(Number(e.target.value))}
                  className={`input-field ${errors.ks ? 'border-red-500' : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">fp</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={fp}
                  onChange={(e) => setFp(Number(e.target.value))}
                  className={`input-field ${errors.fp ? 'border-red-500' : ''}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field resize-none"
                rows={2}
                placeholder="Notes optionnelles"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Favoris ({type === 'eclairage' ? 'Éclairage' : 'Prise'})
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
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Enregistrement...' : editElement ? 'Mettre à jour' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

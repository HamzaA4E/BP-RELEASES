import { useState, useEffect, useMemo } from 'react';
import type { Element, ElementType, Favorite } from '@/types';
import { FavoriteCard } from './FavoriteCard';
import { suggestRepere } from '@/utils/calculations';

interface AddElementModalProps {
  isOpen: boolean;
  panelId: number;
  existingElements: Element[];
  favorites: Favorite[];
  editElement?: Element | null;
  onClose: () => void;
  onSave: (data: {
    type: ElementType;
    repere: string;
    designation: string;
    power_w: number;
    quantity: number;
    distance_m: number;
    circuit?: string;
    notes?: string;
  }) => Promise<void>;
  onDeleteFavorite: (id: number) => void;
}

export function AddElementModal({
  isOpen,
  panelId: _panelId,
  existingElements,
  favorites,
  editElement,
  onClose,
  onSave,
  onDeleteFavorite,
}: AddElementModalProps) {
  const [type, setType] = useState<ElementType>('eclairage');
  const [repere, setRepere] = useState('');
  const [designation, setDesignation] = useState('');
  const [powerW, setPowerW] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [distanceM, setDistanceM] = useState(0);
  const [circuit, setCircuit] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filteredFavorites = useMemo(
    () => favorites.filter((f) => f.type === type),
    [favorites, type]
  );

  const designationSuggestions = useMemo(() => {
    const query = designation.toLowerCase();
    return favorites
      .filter((f) => f.type === type && f.designation.toLowerCase().includes(query))
      .slice(0, 5);
  }, [favorites, type, designation]);

  useEffect(() => {
    if (!isOpen) return;

    if (editElement) {
      setType(editElement.type);
      setRepere(editElement.repere);
      setDesignation(editElement.designation);
      setPowerW(editElement.power_w);
      setQuantity(editElement.quantity);
      setDistanceM(editElement.distance_m);
      setCircuit(editElement.circuit ?? '');
      setNotes(editElement.notes ?? '');
    } else {
      setType('eclairage');
      const reperes = existingElements.map((e) => e.repere);
      setRepere(suggestRepere('eclairage', reperes));
      setDesignation('');
      setPowerW(0);
      setQuantity(1);
      setDistanceM(0);
      setCircuit('');
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
    if (!designation.trim()) newErrors.designation = 'La désignation est requise';
    if (powerW < 0) newErrors.power_w = 'La puissance ne peut pas être négative';
    if (powerW === 0) newErrors.power_w = 'La puissance doit être supérieure à 0';
    if (quantity < 1) newErrors.quantity = 'La quantité doit être au moins 1';
    if (distanceM < 0) newErrors.distance_m = 'La distance ne peut pas être négative';
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
        designation: designation.trim(),
        power_w: powerW,
        quantity,
        distance_m: distanceM,
        circuit: circuit.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleFavoriteSelect = (fav: Favorite) => {
    setDesignation(fav.designation);
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
            {editElement ? 'Modifier l\'élément' : 'Ajouter un élément'}
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
              <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">Désignation *</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className={`input-field ${errors.designation ? 'border-red-500' : ''}`}
                  placeholder="Description de l'élément"
                  list="designation-suggestions"
                />
                <datalist id="designation-suggestions">
                  {designationSuggestions.map((f) => (
                    <option key={f.id} value={f.designation} />
                  ))}
                </datalist>
                {errors.designation && (
                  <p className="text-red-500 text-xs mt-1">{errors.designation}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Puissance (W) *</label>
                <input
                  type="number"
                  min={0}
                  value={powerW}
                  onChange={(e) => setPowerW(Number(e.target.value))}
                  className={`input-field ${errors.power_w ? 'border-red-500' : ''}`}
                />
                {errors.power_w && <p className="text-red-500 text-xs mt-1">{errors.power_w}</p>}
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
                <label className="block text-xs font-medium text-gray-500 mb-1">Distance (m)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={distanceM}
                  onChange={(e) => setDistanceM(Number(e.target.value))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Circuit</label>
                <input
                  type="text"
                  value={circuit}
                  onChange={(e) => setCircuit(e.target.value)}
                  className="input-field"
                  placeholder="Optionnel"
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

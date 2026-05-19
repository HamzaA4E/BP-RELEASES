import { useState } from 'react';
import toast from 'react-hot-toast';
import type { JdbCategory } from '@/types';

interface AddJdbModalProps {
  panelId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddJdbModal({ panelId, onClose, onSuccess }: AddJdbModalProps) {
  const [designation, setDesignation] = useState('');
  const [category, setCategory] = useState<JdbCategory>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!designation.trim()) {
      setError('La désignation est obligatoire.');
      return;
    }
    setIsLoading(true);
    try {
      await window.bilpow.elements.create({
        panel_id: panelId,
        type: 'jeu_de_barres',
        repere: '',
        type_label: designation.trim(),
        emplacement: '',
        power_w: 0,
        quantity: 1,
        distance_m: 0,
        phase_type: 'mono',
        jdb_category: category ?? undefined,
        coef_ks: 1,
        coef_ku: 1,
        coef_fp: 1,
      });
      toast.success('Jeu de barres ajouté');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-[#1E3A5F] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl">
                ⚡
              </div>
              <div>
                <h2 className="text-white font-semibold text-lg">Nouveau jeu de barres</h2>
                <p className="text-white/70 text-sm">
                  Séparateur de groupes dans le tableau
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/60 hover:text-white text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Désignation *
            </label>
            <input
              type="text"
              value={designation}
              onChange={(e) => {
                setDesignation(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
              placeholder="ex: Jeu de barres 1, Arrivée TGBT, Départs éclairage..."
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent transition-all"
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Catégorie (optionnel)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Restreint les éléments pouvant être ajoutés sous ce jeu de barres
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: null as JdbCategory, label: 'Mixte', icon: '⚡', desc: 'Tous types' },
                  {
                    value: 'eclairage' as JdbCategory,
                    label: 'Éclairage',
                    icon: '💡',
                    desc: 'Éclairage uniquement',
                  },
                  {
                    value: 'prise' as JdbCategory,
                    label: 'Prise',
                    icon: '🔌',
                    desc: 'Prise + Attente',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-sm transition-all ${
                    category === opt.value
                      ? 'bg-[#1E3A5F] text-white border-[#1E3A5F] shadow-sm'
                      : 'bg-white dark:bg-gray-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span className="font-medium">{opt.label}</span>
                  <span
                    className={`text-[10px] ${category === opt.value ? 'text-white/70' : 'text-slate-400'}`}
                  >
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Aperçu dans le tableau</p>
            <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-[#1E3A5F] to-[#2a4f7a]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">⚡</span>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">
                      {designation || 'Désignation du jeu de barres'}
                    </p>
                    <p className="text-white/60 text-xs">
                      Jeu de barres ·{' '}
                      {category === 'eclairage'
                        ? 'Éclairage'
                        : category === 'prise'
                          ? 'Prise de courant'
                          : 'Mixte'}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-white/80 bg-white/10 px-2 py-0.5 rounded">
                  {category === 'eclairage'
                    ? 'Éclairage'
                    : category === 'prise'
                      ? 'Prise'
                      : 'Mixte'}
                </span>
              </div>
              <div className="px-4 py-2 bg-slate-50 dark:bg-gray-900/50 text-xs text-slate-400 italic">
                ↳ Les éléments seront listés ici...
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            {isLoading ? 'Ajout...' : 'Ajouter le jeu de barres'}
          </button>
        </div>
      </div>
    </div>
  );
}

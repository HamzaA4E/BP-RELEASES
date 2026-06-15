import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/useAppStore';
import { FavoriteCard } from '@/components/FavoriteCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ElementType } from '@/types';

export function Favorites() {
  const { favorites, setFavorites } = useAppStore();
  const [type, setType] = useState<ElementType>('eclairage');
  const [designation, setDesignation] = useState('');
  const [powerW, setPowerW] = useState(0);
  const [color, setColor] = useState('#3B82F6');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadFavorites = async () => {
    try {
      const data = await window.bilpow.favorites.getAll();
      setFavorites(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!designation.trim()) {
      toast.error('La désignation est requise');
      return;
    }
    if (powerW <= 0) {
      toast.error('La puissance doit être supérieure à 0');
      return;
    }
    try {
      await window.bilpow.favorites.create({
        type,
        designation: designation.trim(),
        power_w: powerW,
        color,
      });
      setDesignation('');
      setPowerW(0);
      await loadFavorites();
      toast.success('Favori ajouté');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.bilpow.favorites.delete(deleteId);
      await loadFavorites();
      toast.success('Favori supprimé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
    setDeleteId(null);
  };

  const eclairageFavs = favorites.filter((f) => f.type === 'eclairage');
  const priseFavs = favorites.filter((f) => f.type === 'prise');

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-primary dark:text-white mb-6">
          Gestion des favoris
        </h1>

        <form onSubmit={handleAdd} className="card p-5 mb-8">
          <h2 className="font-semibold mb-4 text-gray-800 dark:text-white">
            Ajouter un favori
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 max-w-xs">
                {(['eclairage', 'prise'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 text-sm font-medium ${
                      type === t ? 'bg-primary text-white' : 'bg-white dark:bg-gray-800'
                    }`}
                  >
                    {t === 'eclairage' ? '💡 Éclairage' : '🔌 Prise'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Désignation *
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="input-field"
                  placeholder="Ex: Panneau LED 60x60"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Puissance (W) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={powerW}
                  onChange={(e) => setPowerW(Number(e.target.value))}
                  className="input-field"
                />
              </div>
              {/* <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Couleur</label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div> */}
            </div>
            <button type="submit" className="btn-primary">
              Ajouter
            </button>
          </div>
        </form>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            💡 Éclairage
            <span className="text-sm font-normal text-gray-400">({eclairageFavs.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {eclairageFavs.map((fav) => (
              <FavoriteCard
                key={fav.id}
                favorite={fav}
                onSelect={() => {}}
                onDelete={setDeleteId}
              />
            ))}
            {eclairageFavs.length === 0 && (
              <p className="text-gray-400 text-sm col-span-2">Aucun favori éclairage</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            🔌 Prises
            <span className="text-sm font-normal text-gray-400">({priseFavs.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {priseFavs.map((fav) => (
              <FavoriteCard
                key={fav.id}
                favorite={fav}
                onSelect={() => {}}
                onDelete={setDeleteId}
              />
            ))}
            {priseFavs.length === 0 && (
              <p className="text-gray-400 text-sm col-span-2">Aucun favori prise</p>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Supprimer le favori"
        message="Êtes-vous sûr de vouloir supprimer ce favori ?"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

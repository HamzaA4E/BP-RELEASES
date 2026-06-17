import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAppStore } from "@/store/useAppStore";
import { FavoriteCard } from "@/components/FavoriteCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { FavoriteType } from "@/types";

const FAVORITE_TYPES: { id: FavoriteType; label: string; icon: string }[] = [
  { id: "eclairage", label: "Éclairage", icon: "💡" },
  { id: "prise", label: "Prise", icon: "🔌" },
  { id: "divers", label: "Divers", icon: "📦" },
];

function favoriteTypeMeta(type: FavoriteType) {
  return FAVORITE_TYPES.find((t) => t.id === type) ?? FAVORITE_TYPES[0];
}

export function Favorites() {
  const { favorites, setFavorites } = useAppStore();
  const [addType, setAddType] = useState<FavoriteType>("eclairage");
  const [listFilter, setListFilter] = useState<FavoriteType>("eclairage");
  const [designation, setDesignation] = useState("");
  const [powerW, setPowerW] = useState<number | "">("");
  const [color] = useState("#3B82F6");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadFavorites = async () => {
    try {
      const data = await window.bilpow.favorites.getAll();
      setFavorites(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!designation.trim()) {
      toast.error("La désignation est requise");
      return;
    }
    if (powerW === "" || powerW <= 0) {
      toast.error("La puissance doit être supérieure à 0");
      return;
    }
    try {
      await window.bilpow.favorites.create({
        type: addType,
        designation: designation.trim(),
        power_w: powerW,
        color,
      });
      setDesignation("");
      setPowerW("");
      setListFilter(addType);
      await loadFavorites();
      toast.success("Favori ajouté");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.bilpow.favorites.delete(deleteId);
      await loadFavorites();
      toast.success("Favori supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setDeleteId(null);
  };

  const filteredFavorites = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    return favorites.filter((favorite) => {
      if (favorite.type !== listFilter) return false;
      if (!normalizedQuery) return true;

      return favorite.designation.toLowerCase().includes(normalizedQuery);
    });
  }, [favorites, listFilter, searchTerm]);

  const activeFilter = favoriteTypeMeta(listFilter);
  const activeFilterLabel = activeFilter?.label ?? "Favori";

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
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Type
              </label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 max-w-md">
                {FAVORITE_TYPES.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAddType(id)}
                    className={`flex-1 py-2 text-sm font-medium ${
                      addType === id
                        ? "bg-primary text-white"
                        : "bg-white dark:bg-gray-800"
                    }`}
                  >
                    {icon} {label}
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
                  placeholder="0"
                  value={powerW}
                  onChange={(e) =>
                    setPowerW(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  className="input-field"
                />
              </div>
            </div>
            <button type="submit" className="btn-primary">
              Ajouter
            </button>
          </div>
        </form>

        <section>
          <div className="mb-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              {activeFilter?.icon} {activeFilter?.label}
              <span className="text-sm font-normal text-gray-400">
                ({filteredFavorites.length})
              </span>
            </h2>
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 max-w-md">
              {FAVORITE_TYPES.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setListFilter(id)}
                  className={`flex-1 py-2 px-2 text-sm font-medium ${
                    listFilter === id
                      ? "bg-primary text-white"
                      : "bg-white dark:bg-gray-800"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <div className="max-w-md">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Rechercher un favori
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
                placeholder="Ex: LED, RJ45, pompe..."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredFavorites.map((fav) => (
              <FavoriteCard
                key={fav.id}
                favorite={fav}
                onSelect={() => {}}
                onDelete={setDeleteId}
              />
            ))}
            {filteredFavorites.length === 0 && (
              <p className="text-gray-400 text-sm col-span-2">
                {searchTerm.trim()
                  ? `Aucun favori ${activeFilterLabel.toLowerCase()} ne correspond à la recherche`
                  : `Aucun favori ${activeFilterLabel.toLowerCase()}`}
              </p>
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

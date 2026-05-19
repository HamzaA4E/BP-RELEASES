import type { ElementType } from '@/types';

interface AddBarSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (type: ElementType) => void;
}

export function AddBarSetModal({ isOpen, onClose, onConfirm }: AddBarSetModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-sm mx-4">
        <h3 className="font-semibold text-primary dark:text-white mb-2">
          Ajouter un jeu de barre
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Choisissez le type de jeu de barre à insérer dans le tableau.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onConfirm('eclairage')}
            className="btn-primary w-full"
          >
            💡 Jeu de barre Éclairage
          </button>
          <button
            type="button"
            onClick={() => onConfirm('prise')}
            className="btn-secondary w-full"
          >
            🔌 Jeu de barre Prise
          </button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 mt-2">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

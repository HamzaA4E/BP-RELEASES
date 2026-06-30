interface FolderDeleteDialogProps {
  isOpen: boolean;
  onConfirm: (option: 'move' | 'delete') => void;
  onCancel: () => void;
}

export function FolderDeleteDialog({
  isOpen,
  onConfirm,
  onCancel,
}: FolderDeleteDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="card p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Supprimer le dossier
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Que souhaitez-vous faire des projets qu'il contient ?
        </p>
        <div className="space-y-3 mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="deleteOption"
              value="move"
              defaultChecked
              className="mt-1"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Déplacer les projets vers la racine
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 block">
                (recommandé)
              </span>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="deleteOption"
              value="delete"
              className="mt-1"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Supprimer également tous les projets
              </span>
            </div>
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              const selected = document.querySelector('input[name="deleteOption"]:checked') as HTMLInputElement;
              onConfirm(selected?.value === 'delete' ? 'delete' : 'move');
            }}
            className="btn-danger"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

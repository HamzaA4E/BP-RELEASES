import { useEffect, useState } from "react";

interface AddPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}

export function AddPanelModal({ isOpen, onClose, onAdd }: AddPanelModalProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    console.log("AddPanelModal isOpen changed:", isOpen);
    if (isOpen) {
      setName("");
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAdd(name.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <h3 className="font-semibold mb-3">Nouveau tableau</h3>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => {
              console.log("Input value changed:", e.target.value);
              setName(e.target.value);
            }}
            onFocus={() => console.log("Input focused")}
            onBlur={() => console.log("Input blurred")}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-sm mb-4"
            placeholder="Ex: TGBT, TD01..."
            autoComplete="off"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors font-medium text-sm"
            >
              Ajouter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

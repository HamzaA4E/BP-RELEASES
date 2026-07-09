import { useEffect, useRef, useState } from "react";

interface AddLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}

export function AddLocationModal({ isOpen, onClose, onAdd }: AddLocationModalProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setKey(prev => prev + 1);
      setName("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && key > 0) {
      // Focus after the component has remounted
      requestAnimationFrame(() => {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      });
    }
  }, [isOpen, key]);

  const handleSubmit = () => {
    if (name.trim()) {
      onAdd(name.trim());
      onClose();
    }
  };

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 ${isOpen ? '' : 'hidden'}`} onClick={(e) => {
      e.stopPropagation();
      inputRef.current?.focus();
    }}>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.focus();
      }}>
        <h3 className="font-semibold mb-3">Nouvel emplacement</h3>
        <input
          key={key}
          ref={inputRef}
          autoFocus={isOpen}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-sm mb-4"
          placeholder="Ex: RDC, Étage 1..."
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
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors font-medium text-sm"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

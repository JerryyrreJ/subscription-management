import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCategoryDisplayName } from '../../utils/categories';

interface CategoryChipsProps {
 categories: string[];
 value: string;
 onChange: (value: string) => void;
 onCreateCategory: (name: string) => Promise<boolean>;
 error?: string;
 notice?: string;
}

export function CategoryChips({
 categories,
 value,
 onChange,
 onCreateCategory,
 error,
 notice,
}: CategoryChipsProps) {
 const { t } = useTranslation(['addSubscription', 'app', 'categoryLabels']);
 const [isAdding, setIsAdding] = useState(false);
 const [draft, setDraft] = useState('');

 const handleCreate = async () => {
  const created = await onCreateCategory(draft);
  if (created) {
   setIsAdding(false);
   setDraft('');
  }
 };

 return (
  <div>
   <p className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
    {t('addSubscription:categoryLabel')}
   </p>
   <div className="flex flex-wrap gap-2">
    {categories.map(category => {
     const selected = value === category;
     return (
      <button
       key={category}
       type="button"
       onClick={() => onChange(category)}
       aria-pressed={selected}
       className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
        selected
         ? 'border-emerald-600 bg-emerald-600 text-white'
         : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-emerald-400 dark:hover:border-emerald-500'
       }`}
      >
       {getCategoryDisplayName(category, t)}
      </button>
     );
    })}
    <button
     type="button"
     onClick={() => {
      setIsAdding(true);
      setDraft('');
     }}
     aria-label={t('addSubscription:addNewCategory')}
     className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
    >
     <Plus className="w-4 h-4" />
    </button>
   </div>

   {isAdding && (
    <div className="mt-3 flex gap-2">
     <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
       if (e.key === 'Enter') {
        e.preventDefault();
        void handleCreate();
       }
       if (e.key === 'Escape') {
        setIsAdding(false);
        setDraft('');
       }
      }}
      autoFocus={window.matchMedia('(hover: hover) and (pointer: fine)').matches}
      placeholder={t('addSubscription:newCategoryPlaceholder')}
      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#1a1c1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
     />
     <button
      type="button"
      onClick={() => void handleCreate()}
      className="px-3 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-xl hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors text-sm"
     >
      {t('addSubscription:addCategory')}
     </button>
     <button
      type="button"
      onClick={() => {
       setIsAdding(false);
       setDraft('');
      }}
      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
     >
      {t('app:cancel')}
     </button>
    </div>
   )}

   {error && (
    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
   )}
   {notice && !error && (
    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">{notice}</p>
   )}
  </div>
 );
}

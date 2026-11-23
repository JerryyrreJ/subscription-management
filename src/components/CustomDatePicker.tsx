import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../hooks/useAppLanguage';
import { formatDateByLocale, formatDateOnly, formatWeekdayLabels, getTodayDateOnly, parseDateOnly } from '../utils/dates';

interface CustomDatePickerProps {
 value: string; // YYYY-MM-DD format
 onChange: (value: string) => void;
 minDate?: string; // YYYY-MM-DD format
 maxDate?: string; // YYYY-MM-DD format
 required?: boolean;
 className?: string;
 invalid?: boolean;
}

const parseLocalDate = (dateStr: string) => {
 const [year, month, day] = dateStr.split('-').map(Number);
 return new Date(year, month - 1, day);
};

const formatLocalDate = (date: Date) => {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
};

export function CustomDatePicker({
 value,
 onChange,
 minDate,
 maxDate,
 required,
 className = '',
 invalid = false,
}: CustomDatePickerProps) {
 const { t } = useTranslation(['common']);
 const { language } = useAppLanguage();

 const [isOpen, setIsOpen] = useState(false);
 const [pickerView, setPickerView] = useState<'days' | 'months'>('days');
 const [currentMonth, setCurrentMonth] = useState<Date>(() => {
 return value ? parseLocalDate(value) : new Date();
 });
 const dropdownRef = useRef<HTMLDivElement>(null);
 const calendarRef = useRef<HTMLDivElement>(null);

 // Parse the value to get selected date
 const selectedDate = value ? parseLocalDate(value) : null;

 const minDateObj = minDate ? parseLocalDate(minDate) : null;
 const maxDateObj = maxDate ? parseLocalDate(maxDate) : null;

 const todayStr = formatDateOnly(getTodayDateOnly());

 // Sync calendar view with the current value whenever the picker opens.
 useEffect(() => {
  if (isOpen) {
   setCurrentMonth(value ? parseLocalDate(value) : new Date());
   setPickerView('days');
  }
 }, [isOpen, value]);

 // Close dropdown when clicking outside or pressing Escape (without closing parent modal).
 useEffect(() => {
  if (!isOpen) return undefined;

  function handleClickOutside(event: MouseEvent) {
   if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
    setIsOpen(false);
   }
  }

  function handleKeyDown(event: KeyboardEvent) {
   if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (pickerView === 'months') {
     setPickerView('days');
    } else {
     setIsOpen(false);
    }
   }
  }

  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleKeyDown, true);
  return () => {
   document.removeEventListener('mousedown', handleClickOutside);
   document.removeEventListener('keydown', handleKeyDown, true);
  };
 }, [isOpen, pickerView]);

 // Auto-scroll to keep calendar in view when opened
 useEffect(() => {
 if (isOpen && calendarRef.current) {
 // Small delay to ensure dropdown is rendered
 setTimeout(() => {
 if (calendarRef.current) {
 calendarRef.current.scrollIntoView({
 behavior: 'smooth',
 block: 'nearest',
 });
 }
 }, 100);
 }
 }, [isOpen]);

 // Format date for display
 const formatLocalDateValue = (date: Date | null) => {
 if (!date) return '';
 return formatLocalDate(date);
 };

 // Format date for display in input (more readable)
 const formatDisplayDate = (dateStr: string) => {
 if (!dateStr) return t('common:selectDate');
 return formatDateByLocale(parseDateOnly(dateStr), language);
 };

 // Get days in month
 const getDaysInMonth = (date: Date) => {
 const year = date.getFullYear();
 const month = date.getMonth();
 return new Date(year, month + 1, 0).getDate();
 };

 // Get first day of month (0 = Sunday, 1 = Monday, etc.)
 const getFirstDayOfMonth = (date: Date) => {
 const year = date.getFullYear();
 const month = date.getMonth();
 return new Date(year, month, 1).getDay();
 };

 // Navigate month
 const previousMonth = () => {
 if (isPreviousMonthDisabled()) {
 return;
 }

 setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
 };

 const nextMonth = () => {
 if (isNextMonthDisabled()) {
 return;
 }

 setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
 };

 // Select a date
 const selectDate = (day: number) => {
 if (isDateDisabled(day)) {
 return;
 }

 const year = currentMonth.getFullYear();
 const month = currentMonth.getMonth();
 const selectedDateValue = new Date(year, month, day);
 const formattedDate = formatLocalDateValue(selectedDateValue);
 onChange(formattedDate);
 setIsOpen(false);
 };

 const toDateOnlyString = (date: Date) => formatLocalDate(date);

 // Check if a date is disabled
 const isDateDisabled = (day: number) => {
 const year = currentMonth.getFullYear();
 const month = currentMonth.getMonth();
 const dateStr = toDateOnlyString(new Date(year, month, day));

 if (minDate && dateStr < minDate) {
 return true;
 }

 if (maxDate && dateStr > maxDate) {
 return true;
 }

 return false;
 };

 // Check if a date is selected
 const isDateSelected = (day: number) => {
 if (!selectedDate) return false;
 const year = currentMonth.getFullYear();
 const month = currentMonth.getMonth();
 return (
 selectedDate.getDate() === day &&
 selectedDate.getMonth() === month &&
 selectedDate.getFullYear() === year
 );
 };

 // Check if a date is today
 const isToday = (day: number) => {
 const year = currentMonth.getFullYear();
 const month = currentMonth.getMonth();
 return toDateOnlyString(new Date(year, month, day)) === todayStr;
 };

 // Generate calendar grid
 const generateCalendar = () => {
 const daysInMonth = getDaysInMonth(currentMonth);
 const firstDay = getFirstDayOfMonth(currentMonth);
 const days: (number | null)[] = [];

 // Add empty cells for days before the first day of month
 for (let i = 0; i < firstDay; i++) {
 days.push(null);
 }

 // Add days of the month
 for (let day = 1; day <= daysInMonth; day++) {
 days.push(day);
 }

 return days;
 };

 const calendar = generateCalendar();
 const monthYear = formatDateByLocale(currentMonth, language, { month: 'long', year: 'numeric' });
 const weekdayLabels = formatWeekdayLabels(language);
 const monthLabels = useMemo(
  () => Array.from({ length: 12 }, (_, monthIndex) =>
   formatDateByLocale(new Date(Date.UTC(2024, monthIndex, 1)), language, { month: 'short', timeZone: 'UTC' })
  ),
  [language]
 );

 const isPreviousMonthDisabled = () => {
 if (!minDateObj) return false;
 const previousMonthLastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);
 return previousMonthLastDay < minDateObj;
 };

 const isNextMonthDisabled = () => {
 if (!maxDateObj) return false;
 const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
 return next > maxDateObj;
 };

 const isPreviousYearDisabled = () => {
  if (!minDateObj) return false;
  return currentMonth.getFullYear() - 1 < minDateObj.getFullYear();
 };

 const isNextYearDisabled = () => {
  if (!maxDateObj) return false;
  return currentMonth.getFullYear() + 1 > maxDateObj.getFullYear();
 };

 const isMonthDisabled = (year: number, monthIndex: number) => {
  if (minDateObj) {
   const monthLastDay = new Date(year, monthIndex + 1, 0);
   if (monthLastDay < minDateObj) return true;
  }
  if (maxDateObj) {
   const monthFirstDay = new Date(year, monthIndex, 1);
   if (monthFirstDay > maxDateObj) return true;
  }
  return false;
 };

 const previousYear = () => {
  if (isPreviousYearDisabled()) return;
  setCurrentMonth(new Date(currentMonth.getFullYear() - 1, currentMonth.getMonth(), 1));
 };

 const nextYear = () => {
  if (isNextYearDisabled()) return;
  setCurrentMonth(new Date(currentMonth.getFullYear() + 1, currentMonth.getMonth(), 1));
 };

 const isTodayDisabled = minDate ? todayStr < minDate : false;

 return (
 <div ref={dropdownRef} className="relative">
 {/* Input Display */}
 <button
 type="button"
 aria-required={required}
 onClick={() => setIsOpen(!isOpen)}
 className={`w-full px-4 py-2.5 border bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/80 ${
 invalid
  ? 'border-red-400 dark:border-red-500'
  : 'border-gray-300 dark:border-gray-600'
 } ${className}`}
 >
 <span className={value ? '' : 'text-gray-400 dark:text-gray-500'}>
 {formatDisplayDate(value)}
 </span>
 <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500"/>
 </button>

 {/* Calendar Dropdown */}
 {isOpen && (
 <div
 ref={calendarRef}
 className="absolute z-[60] mt-2 w-full min-w-[280px] bg-white dark:bg-[#1a1c1e] border border-gray-200 dark:border-gray-700 rounded-xl shadow-apple-lg p-4"
 >
 {/* Month/Year Header */}
 <div className="flex items-center justify-between mb-4">
 <button
 type="button"
 onClick={pickerView === 'months' ? previousYear : previousMonth}
 disabled={pickerView === 'months' ? isPreviousYearDisabled() : isPreviousMonthDisabled()}
 aria-label={pickerView === 'months' ? t('common:previousYear') : t('common:previousMonth')}
 className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
 >
 <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400"/>
 </button>
 <button
 type="button"
 onClick={() => setPickerView(prev => (prev === 'days' ? 'months' : 'days'))}
 aria-expanded={pickerView === 'months'}
 aria-label={t('common:selectMonthYear')}
 className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-gray-900 dark:text-white text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
 >
 <span>{pickerView === 'months' ? currentMonth.getFullYear() : monthYear}</span>
 <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${pickerView === 'months' ? 'rotate-180' : ''}`} />
 </button>
 <button
 type="button"
 onClick={pickerView === 'months' ? nextYear : nextMonth}
 disabled={pickerView === 'months' ? isNextYearDisabled() : isNextMonthDisabled()}
 aria-label={pickerView === 'months' ? t('common:nextYear') : t('common:nextMonth')}
 className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
 >
 <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400"/>
 </button>
 </div>

 {pickerView === 'months' ? (
  <div className="grid grid-cols-3 gap-2 py-1">
   {monthLabels.map((label, monthIndex) => {
    const disabled = isMonthDisabled(currentMonth.getFullYear(), monthIndex);
    const isCurrent = currentMonth.getMonth() === monthIndex;
    return (
     <button
      key={monthIndex}
      type="button"
      disabled={disabled}
      onClick={() => {
       setCurrentMonth(new Date(currentMonth.getFullYear(), monthIndex, 1));
       setPickerView('days');
      }}
      className={`py-2.5 px-2 rounded-xl text-sm font-medium transition-colors ${
       isCurrent
        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
        : disabled
         ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
         : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
     >
      {label}
     </button>
    );
   })}
  </div>
 ) : (
  <>
   {/* Day Labels */}
   <div className="grid grid-cols-7 gap-1 mb-2">
   {weekdayLabels.map((day) => (
   <div
   key={day}
   className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1"
   >
   {day}
   </div>
   ))}
   </div>

   {/* Calendar Grid */}
   <div className="grid grid-cols-7 gap-1">
   {calendar.map((day, index) => (
   <div key={index} className="aspect-square">
   {day ? (
   <button
   type="button"
   onClick={() => selectDate(day)}
   disabled={isDateDisabled(day)}
   className={`w-full h-full rounded-xl text-sm font-medium transition-all ${
   isDateSelected(day)
   ? 'bg-emerald-600 text-white hover:bg-emerald-700'
   : isToday(day)
   ? 'bg-gray-100 dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 hover:bg-gray-200 dark:hover:bg-gray-600'
   : isDateDisabled(day)
   ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
   : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
   }`}
   >
   {day}
   </button>
   ) : (
   <div />
   )}
   </div>
   ))}
   </div>
  </>
 )}

 {/* Today Button */}
 <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
 <button
 type="button"
 onClick={() => {
 if (isTodayDisabled || (maxDate && todayStr > maxDate)) {
 return;
 }
 onChange(todayStr);
 setCurrentMonth(parseLocalDate(todayStr));
 setPickerView('days');
 setIsOpen(false);
 }}
 disabled={isTodayDisabled || (maxDate ? todayStr > maxDate : false)}
 className="w-full py-2 px-4 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
 >
 {t('common:today')}
 </button>
 </div>
 </div>
 )}
 </div>
 );
}

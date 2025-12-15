import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  maxDate?: string; // YYYY-MM-DD format
  required?: boolean;
}

export function CustomDatePicker({ value, onChange, maxDate, required }: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    return value ? new Date(value) : new Date();
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Parse the value to get selected date
  const selectedDate = value ? new Date(value) : null;

  // Parse maxDate
  const maxDateObj = maxDate ? new Date(maxDate) : new Date();

  // Get today's date string for comparison (YYYY-MM-DD format)
  const todayStr = (() => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

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
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date for display in input (more readable)
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'Select date';
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
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
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    // Don't allow navigating to future months if maxDate is set
    if (maxDate) {
      if (next <= maxDateObj) {
        setCurrentMonth(next);
      }
    } else {
      setCurrentMonth(next);
    }
  };

  // Select a date
  const selectDate = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const selectedDate = new Date(year, month, day);

    // Check if date is in the future
    if (maxDate && selectedDate > maxDateObj) {
      return;
    }

    const formattedDate = formatDate(selectedDate);
    onChange(formattedDate);
    setIsOpen(false);
  };

  // Check if a date is disabled
  const isDateDisabled = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const date = new Date(year, month, day);
    return maxDate ? date > maxDateObj : false;
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
    const today = new Date();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return (
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year
    );
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
  const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Check if next month button should be disabled
  const isNextMonthDisabled = () => {
    if (!maxDate) return false;
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    return next > maxDateObj;
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Input Display */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/80"
      >
        <span className={value ? '' : 'text-gray-400 dark:text-gray-500'}>
          {formatDisplayDate(value)}
        </span>
        <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      </button>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div
          ref={calendarRef}
          className="absolute z-[60] mt-2 w-full min-w-[280px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4"
        >
          {/* Month/Year Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={previousMonth}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="font-semibold text-gray-900 dark:text-white text-sm">
              {monthYear}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              disabled={isNextMonthDisabled()}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Day Labels */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
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
                    className={`w-full h-full rounded-lg text-sm font-medium transition-all ${
                      isDateSelected(day)
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : isToday(day)
                        ? 'bg-gray-100 dark:bg-gray-700 text-teal-600 dark:text-teal-400 hover:bg-gray-200 dark:hover:bg-gray-600'
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

          {/* Today Button */}
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                onChange(todayStr);
                setIsOpen(false);
              }}
              disabled={maxDate ? todayStr > maxDate : false}
              className="w-full py-2 px-4 text-sm font-medium text-teal-600 dark:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

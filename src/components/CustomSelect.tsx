import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
 value: string;
 label: string;
}

interface CustomSelectProps {
 value: string;
 onChange: (value: string) => void;
 options: Option[];
 placeholder?: string;
 className?: string;
 required?: boolean;
 disabled?: boolean;
}

export function CustomSelect({
 value,
 onChange,
 options,
 placeholder = 'Select an option',
 className = '',
 required = false,
 disabled = false
}: CustomSelectProps) {
 const [isOpen, setIsOpen] = useState(false);
 const selectRef = useRef<HTMLDivElement>(null);

 // 获取当前选中的选项
 const selectedOption = options.find(option => option.value === value);

 // 点击外部关闭下拉框
 useEffect(() => {
 function handleClickOutside(event: MouseEvent) {
 if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
 setIsOpen(false);
 }
 }

 document.addEventListener('mousedown', handleClickOutside);
 return () => {
 document.removeEventListener('mousedown', handleClickOutside);
 };
 }, []);

 // 键盘导航支持
 const handleKeyDown = (event: React.KeyboardEvent) => {
 if (disabled) return;

 if (event.key === 'Enter' || event.key === ' ') {
 event.preventDefault();
 setIsOpen(!isOpen);
 } else if (event.key === 'Escape') {
 setIsOpen(false);
 } else if (event.key === 'ArrowDown') {
 event.preventDefault();
 if (!isOpen) {
 setIsOpen(true);
 } else {
 // 选择下一个选项
 const currentIndex = options.findIndex(option => option.value === value);
 const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
 onChange(options[nextIndex].value);
 }
 } else if (event.key === 'ArrowUp') {
 event.preventDefault();
 if (isOpen) {
 // 选择上一个选项
 const currentIndex = options.findIndex(option => option.value === value);
 const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
 onChange(options[prevIndex].value);
 }
 }
 };

 const handleOptionClick = (optionValue: string) => {
 onChange(optionValue);
 setIsOpen(false);
 };

 return (
 <div className={`relative ${className}`} ref={selectRef}>
 {/* 隐藏的原生select用于表单验证 */}
 <select
 value={value}
 onChange={() => {}} // 由自定义组件处理
 required={required}
 className="absolute inset-0 opacity-0 pointer-events-none"
 tabIndex={-1}
 aria-hidden="true"
 >
 {!value && <option value="">Select</option>}
 {options.map(option => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>

 {/* 自定义下拉按钮 */}
 <button
 type="button"
 onClick={() => !disabled && setIsOpen(!isOpen)}
 onKeyDown={handleKeyDown}
 disabled={disabled}
 className={`
 w-full flex items-center justify-between px-4 py-2 text-left
 border border-gray-300 dark:border-gray-600 rounded-2xl
 bg-white dark:bg-gray-700
 text-gray-900 dark:text-white
 focus:ring-2 focus:ring-emerald-500 focus:border-transparent
 disabled:opacity-50 disabled:cursor-not-allowed
 transition-colors duration-200
 ${isOpen ? 'ring-2 ring-zinc-900 dark:ring-zinc-100 border-transparent' : ''}
 ${className}
 `}
 aria-haspopup="listbox"
 aria-expanded={isOpen}
 aria-label={selectedOption ? selectedOption.label : placeholder}
 >
 <span
 className={`min-w-0 flex-1 truncate whitespace-nowrap pr-3 ${
 selectedOption ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
 }`}
 >
 {selectedOption ? selectedOption.label : placeholder}
 </span>
 <ChevronDown
 className={`w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
 isOpen ? 'transform rotate-180' : ''
 }`}
 />
 </button>

 {/* 下拉选项列表 */}
 {isOpen && (
 <div className="absolute left-0 z-50 mt-1 min-w-full w-max max-w-[min(18rem,calc(100vw-2rem))] bg-white dark:bg-[#1a1c1e] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-apple-lg max-h-60 overflow-y-auto">
 <div className="p-1.5 flex flex-col gap-0.5">
 {options.length === 0 ? (
 <div className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm">
 No options available
 </div>
 ) : (
 options.map((option) => (
 <button
 key={option.value}
 type="button"
 onClick={() => handleOptionClick(option.value)}
 className={`
 w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm rounded-xl transition-colors
 hover:bg-gray-100 dark:hover:bg-gray-800
 focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none
 ${value === option.value ? 'bg-[#f4f5f7] dark:bg-zinc-800/50 text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}
 transition-colors duration-150
 `}
 role="option"
 aria-selected={value === option.value}
 >
 <span className="min-w-0 flex-1 whitespace-nowrap">{option.label}</span>
 {value === option.value && (
 <Check className="w-4 h-4 flex-shrink-0 text-emerald-700 dark:text-emerald-400"/>
 )}
 </button>
 ))
 )}
 </div>
 </div>
 )}
 </div>
 );
}

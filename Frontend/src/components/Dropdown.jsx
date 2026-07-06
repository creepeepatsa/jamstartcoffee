import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function Dropdown({ value, onChange, options, icon: Icon, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-sm text-emerald-950 shadow-sm shadow-emerald-950/5 transition hover:border-emerald-900/20"
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-emerald-900/45" />}
        <span className="min-w-[6rem] flex-1 text-left">{selected?.label ?? 'Select'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-emerald-900/45 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 max-h-72 min-w-full overflow-auto rounded-2xl border border-emerald-900/10 bg-white p-1.5 shadow-lg shadow-emerald-950/10">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? 'bg-lime-100 font-medium text-lime-900'
                    : 'text-emerald-900/75 hover:bg-emerald-50 hover:text-emerald-950'
                }`}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                {isSelected && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
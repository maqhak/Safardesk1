import React, { useState, useEffect, useRef } from 'react';
import { Search, Compass, X, ChevronDown, Check } from 'lucide-react';
import { AirlineDoc } from '../../types/master';
import { fetchAirlines } from '../../services/masterService';
import { cn } from '../../utils/formatters';

interface AirlineSelectProps {
  value: AirlineDoc | null;
  onChange: (airline: AirlineDoc | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

const RECENT_AIRLINES_KEY = 'safardesk_recent_airlines';

export const AirlineSelect: React.FC<AirlineSelectProps> = ({
  value,
  onChange,
  label = 'Airline',
  placeholder = 'Search airline by IATA code or name...',
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [airlines, setAirlines] = useState<AirlineDoc[]>([]);
  const [recent, setRecent] = useState<AirlineDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const list = await fetchAirlines();
        setAirlines(list.filter((a) => a.isActive));
      } catch (err) {
        console.error('Failed to load airlines', err);
      } finally {
        setLoading(false);
      }

      const storedRecent = localStorage.getItem(RECENT_AIRLINES_KEY);
      if (storedRecent) {
        try {
          setRecent(JSON.parse(storedRecent));
        } catch {
          // ignore
        }
      }
    }
    load();
  }, []);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (airline: AirlineDoc) => {
    onChange(airline);
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(0);

    const updated = [airline, ...recent.filter((a) => a.id !== airline.id)].slice(0, 5);
    setRecent(updated);
    localStorage.setItem(RECENT_AIRLINES_KEY, JSON.stringify(updated));
  };

  const filtered = airlines.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.iataCode.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q)
    );
  });

  const displayed = filtered.slice(0, 50);

  // Keyboard navigation (mirrors AirportSelect)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, displayed.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayed[highlightedIndex]) {
        handleSelect(displayed[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef} onKeyDown={handleKeyDown}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-lg text-sm cursor-pointer transition-all',
          isOpen ? 'border-[#0e2c4c] ring-2 ring-[#0e2c4c]/10' : 'border-slate-300 hover:border-slate-400',
          'shadow-xs'
        )}
      >
        <div className="flex items-center gap-2.5 truncate text-slate-800">
          <Compass className="w-4 h-4 text-[var(--theme-primary)] shrink-0" />
          {value ? (
            <span className="font-medium truncate">
              <span className="font-bold text-[var(--theme-primary)]">{value.iataCode}</span> — {value.name} ({value.country})
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-1 hover:text-slate-600 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
        </div>
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in duration-150">
          <div className="p-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder="Type to refine (e.g. SV, Emirates, PIA)... [Use \u2191\u2193 & Enter]"
              className="w-full bg-transparent border-none text-sm text-slate-800 focus:outline-none placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {!search && recent.length > 0 && (
              <div className="bg-amber-50/50 py-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-amber-800 uppercase tracking-wider">
                  Recent Selections
                </div>
                {recent.map((rec) => (
                  <div
                    key={`recent-airline-${rec.id}`}
                    onClick={() => handleSelect(rec)}
                    className="px-3 py-2 hover:bg-amber-100/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <span className="font-bold text-[var(--theme-primary)]">{rec.iataCode}</span>
                      <span className="font-medium text-slate-700 ml-1.5">{rec.name}</span>
                      <span className="text-slate-500 ml-1">({rec.country})</span>
                    </div>
                    {value?.id === rec.id && <Check className="w-3.5 h-3.5 text-[var(--theme-primary)]" />}
                  </div>
                ))}
              </div>
            )}

            {loading ? (
              <div className="p-6 text-center text-sm text-slate-500">Loading airlines master...</div>
            ) : displayed.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No airlines found matching "{search}".</div>
            ) : (
              displayed.map((airline, index) => {
                const isSelected = value?.id === airline.id;
                const isHighlighted = index === highlightedIndex;
                return (
                  <div
                    key={airline.id}
                    onClick={() => handleSelect(airline)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'px-3.5 py-2.5 cursor-pointer flex items-center justify-between text-sm transition-colors',
                      isHighlighted ? 'bg-navy-50 text-[var(--theme-primary)]' : 'hover:bg-slate-50 text-slate-700',
                      isSelected && 'font-semibold'
                    )}
                  >
                    <div>
                      <span className="font-bold text-[var(--theme-primary)] tracking-wide">{airline.iataCode}</span>
                      <span className="font-semibold text-slate-800 ml-2">{airline.name}</span>
                      <span className="text-slate-500 text-xs ml-1.5">({airline.country})</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[var(--theme-primary)] shrink-0" />}
                  </div>
                );
              })
            )}
          </div>

          {filtered.length > 50 && (
            <div className="p-2 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500 font-medium">
              Showing top 50 matches out of {filtered.length}. Type to refine results.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Inbox } from 'lucide-react';
import { cn } from '../../utils/formatters';

export type ColumnAlign = 'left' | 'center' | 'right';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  align?: ColumnAlign;
  sortable?: boolean;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  maxHeight?: string;
  striped?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no entries available to display.',
  onRowClick,
  className = '',
  maxHeight = '650px',
  striped = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleHeaderClick = (col: Column<T>) => {
    if (!col.sortable) return;

    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDirection('asc');
    } else {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA).localeCompare(String(valB));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  const alignStyles: Record<ColumnAlign, { th: string; td: string }> = {
    left: { th: 'text-left', td: 'text-left' },
    center: { th: 'text-center', td: 'text-center' },
    right: { th: 'text-right justify-end', td: 'text-right tabular-nums' },
  };

  return (
    <div className={cn('w-full bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col', className)}>
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse text-left text-sm">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-2xs">
            <tr>
              {columns.map((col) => {
                const align = col.align || 'left';
                const isSorted = sortKey === col.key;

                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    onClick={() => handleHeaderClick(col)}
                    className={cn(
                      'py-3.5 px-4 text-xs font-semibold text-slate-700 uppercase tracking-wider select-none',
                      col.sortable && 'cursor-pointer hover:bg-slate-100 transition-colors',
                      alignStyles[align].th
                    )}
                  >
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5',
                        align === 'right' && 'justify-end w-full',
                        align === 'center' && 'justify-center w-full'
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-slate-400">
                          {isSorted && sortDirection === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                          ) : isSorted && sortDirection === 'desc' ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="py-4 px-4">
                      <div className="h-4 bg-slate-200/70 rounded w-4/5" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                      <Inbox className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{emptyDescription}</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((row, index) => {
                const rowKey = keyExtractor(row, index);
                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick && onRowClick(row)}
                    style={striped && index % 2 === 1 ? { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 8%, #ffffff)' } : undefined}
                    className={cn(
                      'transition-colors duration-150',
                      onRowClick ? 'cursor-pointer hover:bg-slate-50/90' : 'hover:bg-slate-50/50'
                    )}
                  >
                    {columns.map((col) => {
                      const align = col.align || 'left';
                      const cellContent = col.render
                        ? col.render(row, index)
                        : (row[col.key] ?? '—');

                      return (
                        <td
                          key={col.key}
                          className={cn(
                            'py-3.5 px-4 text-slate-700 align-middle',
                            alignStyles[align].td
                          )}
                        >
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      {!loading && sortedData.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
          <span>Showing {sortedData.length} total entries</span>
          {sortKey && (
            <span className="text-slate-400">
              Sorted by <span className="font-semibold text-slate-700">{sortKey}</span> ({sortDirection})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  setPage: (p: number) => void;
}

export function TablePagination({ page, totalPages, total, perPage, setPage }: TablePaginationProps) {
  if (total <= perPage) return null;

  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between px-1 py-2 text-sm text-muted-foreground">
      <span className="text-xs">
        {from}–{to} sur {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs font-medium">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={page === totalPages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

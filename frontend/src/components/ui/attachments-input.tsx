'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, Check, FileText, Image, File, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface PieceJointe {
  id: string;
  intitule: string;
  nom: string;
  type: string;
  taille: number;
  data: string;
}

interface Pending {
  file: File;
  data: string;
  intitule: string;
}

interface Props {
  value: PieceJointe[];
  onChange: (pieces: PieceJointe[]) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function FileIcon({ type, className }: { type: string; className?: string }) {
  if (type.startsWith('image/')) return <Image className={className ?? 'h-4 w-4 text-blue-500'} />;
  if (type === 'application/pdf') return <FileText className={className ?? 'h-4 w-4 text-red-500'} />;
  return <File className={className ?? 'h-4 w-4 text-slate-500'} />;
}

export function AttachmentsInput({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPending({
        file,
        data: reader.result as string,
        intitule: file.name.replace(/\.[^/.]+$/, ''),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirm = () => {
    if (!pending) return;
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        intitule: pending.intitule.trim() || pending.file.name,
        nom: pending.file.name,
        type: pending.file.type,
        taille: pending.file.size,
        data: pending.data,
      },
    ]);
    setPending(null);
  };

  const remove = (id: string) => onChange(value.filter((p) => p.id !== id));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="divide-y divide-border rounded-lg border overflow-hidden">
          {value.map((pj) => (
            <div key={pj.id} className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-muted/20 transition-colors">
              <FileIcon type={pj.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{pj.intitule}</p>
                <p className="text-[11px] text-muted-foreground truncate">{pj.nom} &mdash; {formatSize(pj.taille)}</p>
              </div>
              <a
                href={pj.data}
                download={pj.nom}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-3 w-3" /> Télécharger
              </a>
              <button
                type="button"
                onClick={() => remove(pj.id)}
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2.5">
          <FileIcon type={pending.file.type} className="h-4 w-4 mt-1.5 shrink-0 text-brand-500" />
          <div className="flex-1 min-w-0 space-y-1">
            <Input
              value={pending.intitule}
              onChange={(e) => setPending({ ...pending, intitule: e.target.value })}
              placeholder="Intitulé de la pièce jointe…"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirm(); }
                if (e.key === 'Escape') setPending(null);
              }}
            />
            <p className="text-[11px] text-muted-foreground">{pending.file.name} &mdash; {formatSize(pending.file.size)}</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 shrink-0"
            onClick={confirm}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-red-400 hover:bg-red-50 shrink-0"
            onClick={() => setPending(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={!!pending}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Ajouter une pièce jointe
        </Button>
        {value.length === 0 && !pending && (
          <p className="text-xs text-muted-foreground">
            Images, PDF, Word, Excel, CSV…
          </p>
        )}
        {value.length > 0 && (
          <p className="text-xs text-muted-foreground">{value.length} fichier{value.length > 1 ? 's' : ''} joint{value.length > 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Nombre d'options à partir duquel le champ de recherche apparaît de lui-même. */
const SEARCH_AUTO_THRESHOLD = 8;

/** Touches qu'on laisse remonter à Radix (navigation, validation, fermeture). */
const NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'];

/** Props communes aux nœuds manipulés dans le contenu du menu. */
type NodeProps = {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  /** Texte de repli pour la recherche quand le libellé affiché ne suffit pas. */
  searchValue?: string;
};

/** Comparaison insensible à la casse ET aux accents : « Doumé » se trouve en tapant « doume ». */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Aplatit le texte d'un nœud React : `{u.prenom} {u.nom}` arrive sous forme de tableau. */
function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (React.isValidElement<NodeProps>(node)) return nodeText(node.props.children);
  return '';
}

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    /** Texte pris en compte par la recherche à la place du libellé affiché. */
    searchValue?: string;
  }
>(({ className, children, searchValue, ...props }, ref) => {
  void searchValue; // lu par SelectContent, ne doit pas atterrir dans le DOM
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>

      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

function isItem(node: React.ReactNode): node is React.ReactElement<NodeProps> {
  return React.isValidElement(node) && node.type === SelectItem;
}

/** Compte les options réellement présentes, quelle que soit la profondeur des groupes. */
function countItems(children: React.ReactNode): number {
  let total = 0;
  React.Children.forEach(children, (child) => {
    if (isItem(child)) total += 1;
    else if (React.isValidElement<NodeProps>(child)) total += countItems(child.props.children);
  });
  return total;
}

/**
 * Masque les options qui ne correspondent pas à la saisie.
 *
 * On masque (`hidden` + `disabled`) au lieu de démonter : Radix téléporte le libellé
 * de l'option sélectionnée dans le déclencheur, la démonter le ferait disparaître tant
 * que le menu est ouvert. `disabled` la sort au passage de la navigation clavier.
 */
function applyFilter(
  children: React.ReactNode,
  query: string
): { nodes: React.ReactNode; matches: number } {
  let matches = 0;

  const nodes = React.Children.map(children, (child) => {
    if (isItem(child)) {
      const haystack = child.props.searchValue ?? nodeText(child.props.children);
      if (normalize(haystack).includes(query)) {
        matches += 1;
        return child;
      }
      return React.cloneElement(child, {
        className: cn(child.props.className, 'hidden'),
        disabled: true,
      });
    }

    if (React.isValidElement<NodeProps>(child)) {
      const inner = child.props.children;
      if (inner === undefined) return child;

      const result = applyFilter(inner, query);
      matches += result.matches;

      // Un groupe dont plus aucune option ne ressort disparaît avec son intitulé.
      const emptied = countItems(inner) > 0 && result.matches === 0;
      return React.cloneElement(
        child,
        { className: emptied ? cn(child.props.className, 'hidden') : child.props.className },
        result.nodes
      );
    }

    return child;
  });

  return { nodes, matches };
}

type SelectContentProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  /** `'auto'` (défaut) : champ affiché au-delà de 8 options. `true` / `false` pour forcer. */
  searchable?: boolean | 'auto';
  searchPlaceholder?: string;
  emptyMessage?: string;
};

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>((
  {
    className,
    children,
    position = 'popper',
    searchable = 'auto',
    searchPlaceholder = 'Rechercher…',
    emptyMessage = 'Aucun résultat.',
    ...props
  },
  ref
) => {
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const total = React.useMemo(() => countItems(children), [children]);
  const showSearch = searchable === 'auto' ? total >= SEARCH_AUTO_THRESHOLD : searchable;

  const normalized = normalize(query);
  const { nodes, matches } = React.useMemo(
    () =>
      showSearch && normalized
        ? applyFilter(children, normalized)
        : { nodes: children, matches: total },
    [showSearch, normalized, children, total]
  );

  // Radix donne le focus à l'option sélectionnée à l'ouverture ; on le reprend juste après.
  // Le contenu est démonté à la fermeture, donc l'effet rejoue à chaque ouverture.
  React.useEffect(() => {
    if (!showSearch) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showSearch]);

  // Sans cela, le « typeahead » natif de Radix intercepte les lettres et déplace le focus
  // sur une option au lieu de laisser la saisie arriver dans le champ.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!NAVIGATION_KEYS.includes(event.key)) event.stopPropagation();
  };

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-white text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        position={position}
        {...props}
      >
        {showSearch && (
          <div className="flex items-center gap-2 border-b px-3" onKeyDown={handleKeyDown}>
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              aria-label={searchPlaceholder}
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}

        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' &&
              'max-h-[var(--radix-select-content-available-height)] w-full min-w-[var(--radix-select-trigger-width)]'
          )}
        >
          {nodes}
          {showSearch && matches === 0 && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          )}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};

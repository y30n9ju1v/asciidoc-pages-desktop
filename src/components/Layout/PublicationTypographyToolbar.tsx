import { X, RotateCcw } from 'lucide-react';
import type { PublicationTypography } from '../../services/publicationTypographyService';
import { PUBLICATION_TYPOGRAPHY_RANGES } from '../../services/publicationTypographyService';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

interface PublicationTypographyToolbarProps {
  children?: ReactNode;
  previewStatus?: string;
  saving?: boolean;
  defaults: PublicationTypography;
  styleName: string;
  typography: PublicationTypography;
  hasOverride: boolean;
  hasUnsavedChanges: boolean;
  canSave: boolean;
  onChange: (typography: PublicationTypography) => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}

interface TypographyNumberControlProps {
  defaultValue: number;
  label: string;
  value: number;
  displayValue: string;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
}

function TypographyNumberControl({
  defaultValue,
  label,
  value,
  displayValue,
  minimum,
  maximum,
  step,
  onChange,
}: TypographyNumberControlProps) {
  return (
    <div className="group flex shrink-0 items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex h-8 w-32 items-center rounded-md border border-transparent bg-muted/50 px-2 focus-within:border-ring">
        <input
          type="number"
          aria-label={`${label} value`}
          title={displayValue}
          className="min-w-0 w-full bg-transparent py-1 text-sm tabular-nums outline-none"
          defaultValue={value}
          key={value}
          min={minimum}
          max={maximum}
          step={step}
          onBlur={(event) => {
            const next = event.target.valueAsNumber;
            const bounded = Number.isFinite(next) ? Math.min(maximum, Math.max(minimum, next)) : value;
            event.target.value = String(bounded);
            if (Number.isFinite(next)) onChange(bounded);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{displayValue.replace(/[\d.-]/g, '')}</span>
        <button
          type="button"
          aria-label={`Reset ${label}`}
          title={`Default: ${defaultValue}`}
          disabled={value === defaultValue}
          onClick={() => onChange(defaultValue)}
          className="ml-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none"
        >
          <RotateCcw className="size-3" />
        </button>
      </span>
    </div>
  );
}

/** Compact proofing strip; detailed typography belongs to the style editor. */
export function PublicationTypographyToolbar({
  children,
  previewStatus = 'Preview pending',
  saving = false,
  defaults,
  styleName,
  typography,
  hasOverride,
  hasUnsavedChanges,
  canSave,
  onChange,
  onSave,
  onReset,
  onClose,
}: PublicationTypographyToolbarProps) {
  const change = <Field extends keyof PublicationTypography>(field: Field, value: PublicationTypography[Field]) =>
    onChange({ ...typography, [field]: value });
  const ranges = PUBLICATION_TYPOGRAPHY_RANGES;
  return (
    <section
      id="page-layout-panel"
      aria-label="Page layout settings"
      title={previewStatus}
      className="flex min-h-11 items-center gap-2 border-t bg-background px-3 py-1"
    >
      <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto py-1">
        {children}
        <TypographyNumberControl
          label="Body size"
          defaultValue={defaults.baseFontSizePt}
          value={typography.baseFontSizePt}
          displayValue={typography.baseFontSizePt + 'pt'}
          {...ranges.baseFontSizePt}
          onChange={(value) => change('baseFontSizePt', value)}
        />
        <TypographyNumberControl
          label="Line height"
          defaultValue={defaults.lineHeight}
          value={typography.lineHeight}
          displayValue={String(typography.lineHeight)}
          {...ranges.lineHeight}
          onChange={(value) => change('lineHeight', value)}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canSave && hasUnsavedChanges && (
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={saving}
            title={'Save layout to ' + styleName}
            onClick={onSave}
          >
            Save layout
          </Button>
        )}
        {hasOverride && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Reset typography to style defaults"
            title="Reset typography to style defaults"
            onClick={onReset}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label="Hide PDF typesetting"
          title="Hide layout controls"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <span className="sr-only" role="status">
        {styleName} · {previewStatus} ·{' '}
        {saving ? 'Saving settings…' : hasUnsavedChanges ? 'Settings not saved' : 'Settings unchanged'}
      </span>
    </section>
  );
}

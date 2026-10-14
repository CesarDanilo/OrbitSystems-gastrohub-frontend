import { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { Button, Spinner } from '../../../components/ui';

/** Uploads an image (converted to WebP by the API) and returns its URL. */
export function ImageUpload({
  value,
  onChange,
  label,
  aspect = 'square',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  aspect?: 'square' | 'wide';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return setError('A imagem pode ter no máximo 5 MB.');
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.upload<{ url: string }>('/admin/uploads', form);
      onChange(result.url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p id={`${id}-label`} className="mb-1.5 text-sm font-medium">
        {label}
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? `${id}-error` : undefined}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-border-strong bg-surface-muted text-muted-foreground hover:border-primary',
            aspect === 'square' ? 'size-28' : 'h-28 w-56',
          )}
        >
          {value ? (
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus aria-hidden className="size-7" />
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/80">
              <Spinner label="Enviando imagem" />
            </span>
          )}
        </button>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <span>JPG, PNG ou WebP até 5 MB. Otimizamos para carregar rápido.</span>
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-destructive"
              leftIcon={<Trash2 aria-hidden className="size-4" />}
              onClick={() => onChange(null)}
            >
              Remover imagem
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

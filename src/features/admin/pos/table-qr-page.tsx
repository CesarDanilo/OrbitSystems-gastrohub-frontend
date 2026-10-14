import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import QRCode from 'qrcode';
import { Button, ErrorState, Skeleton } from '../../../components/ui';
import { useSession } from '../../auth/session';
import { posApi, posQueries } from './pos-api';

/** Printable QR codes: one table (?mesa=id) or every active table. */
export function TableQrPage() {
  const session = useSession();
  const { mesa } = useSearch({ strict: false }) as { mesa?: string };
  const tables = useQuery(posQueries.tables(session.restaurant.id));
  if (tables.isPending) return <Skeleton className="h-64" />;
  if (tables.isError) return <ErrorState message={tables.error.message} />;
  const list = tables.data.filter((t) => t.active && (!mesa || t.id === mesa));
  return (
    <div>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">QR Codes das mesas</h1>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <ul className="grid grid-cols-2 gap-6 md:grid-cols-3 print:grid-cols-3">
        {list.map((t) => (
          <li
            key={t.id}
            className="flex flex-col items-center rounded-lg border border-border p-4 text-center break-inside-avoid"
          >
            <QrImage tableId={t.id} />
            <p className="mt-2 text-xl font-bold">{t.label}</p>
            <p className="text-sm text-muted-foreground">Aponte a câmera para pedir</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QrImage({ tableId }: { tableId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const qr = useQuery({ queryKey: ['table-qr', tableId], queryFn: () => posApi.tableQr(tableId) });
  useEffect(() => {
    if (!qr.data) return;
    void QRCode.toDataURL(qr.data.url, { width: 320, margin: 1, errorCorrectionLevel: 'M' }).then(
      setSrc,
    );
  }, [qr.data]);
  if (!src) return <Skeleton className="size-48" />;
  return (
    <img
      src={src}
      alt={`QR Code da ${qr.data?.label ?? 'mesa'}`}
      width={192}
      height={192}
      className="size-48"
    />
  );
}

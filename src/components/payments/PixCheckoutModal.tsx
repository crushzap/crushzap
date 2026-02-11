import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, QrCode } from "lucide-react";
import { createPixCheckout, PixCheckoutRequest, PixCheckoutResponse } from "@/services/payments";

type PixCheckoutModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  request: PixCheckoutRequest;
};

export function PixCheckoutModal({ open, onOpenChange, title = "Checkout PIX", request }: PixCheckoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PixCheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setData(null);
    createPixCheckout(request)
      .then(setData)
      .catch(() => setError("Não foi possível iniciar o checkout PIX"))
      .finally(() => setLoading(false));
  }, [open, request]);

  const handleCopy = async () => {
    if (!data?.copiaECola) return;
    try {
      await navigator.clipboard.writeText(data.copiaECola);
    } catch (error) {
      setError("Não foi possível copiar o código PIX");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="p-6 text-center">Gerando seu PIX...</div>
        )}
        {!loading && error && (
          <div className="p-6 text-center text-destructive">{error}</div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            <Card className="p-4 flex items-center justify-center">
              {data.qrCodeBase64 ? (
                <img src={`data:image/png;base64,${data.qrCodeBase64}`} alt="QR Code PIX" className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 bg-secondary rounded-lg flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
            </Card>

            <div className="space-y-2">
              <Label>PIX copia e cola</Label>
              <div className="flex gap-2">
                <Input readOnly value={data.copiaECola} className="flex-1" />
                <Button variant="outline" onClick={handleCopy} className="gap-2">
                  <Copy className="w-4 h-4" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Expira em {new Date(data.expiresAt).toLocaleString()}</p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

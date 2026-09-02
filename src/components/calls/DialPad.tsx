import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Phone, PhoneOff, Mic, MicOff, Delete, Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { SipStatus, CallStatus } from '@/features/inbox';

interface DialPadProps {
  sipStatus: SipStatus;
  callStatus: CallStatus;
  callDuration: number;
  isMuted: boolean;
  currentNumber: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onCall: (number: string) => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onDTMF: (digit: string) => void;
}

const dialButtons = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

const subLabels: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '+',
};

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** Dial Pad component for the calls section. */
export function DialPad({
  sipStatus,
  callStatus,
  callDuration,
  isMuted,
  currentNumber,
  onConnect,
  onDisconnect,
  onCall,
  onHangUp,
  onToggleMute,
  onDTMF,
}: DialPadProps) {
  const [number, setNumber] = useState('');
  const isInCall = callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'active';
  const isConnected = sipStatus === 'registered';

  const handleDigit = useCallback(
    (digit: string) => {
      if (isInCall) {
        onDTMF(digit);
      } else {
        setNumber((prev) => prev + digit);
      }
    },
    [isInCall, onDTMF]
  );

  const handleDelete = useCallback(() => {
    setNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(() => {
    if (number.trim()) {
      onCall(number.trim());
    }
  }, [number, onCall]);

  const statusColor = {
    disconnected: 'bg-muted text-muted-foreground',
    connecting: 'bg-warning/20 text-warning',
    registered: 'bg-success/20 text-success',
    error: 'bg-destructive/20 text-destructive',
  };

  const statusLabel = {
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    registered: 'Conectado',
    error: 'Erro',
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Connection Status */}
      <div className="flex w-full items-center justify-between gap-2">
        <Badge className={`${statusColor[sipStatus]} text-xs`}>
          {sipStatus === 'registered' ? (
            <Wifi className="mr-1 h-3 w-3" />
          ) : (
            <WifiOff className="mr-1 h-3 w-3" />
          )}
          {statusLabel[sipStatus]}
        </Badge>
        <Button
          variant={isConnected ? 'destructive' : 'default'}
          size="sm"
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={sipStatus === 'connecting'}
        >
          {sipStatus === 'connecting' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {isConnected ? 'Desconectar' : 'Conectar SIP'}
        </Button>
      </div>

      {/* Active Call Display */}
      <AnimatePresence>
        {isInCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full"
          >
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 text-center">
                <p className="text-lg font-bold text-foreground">{currentNumber || number}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {callStatus === 'calling' && 'Chamando...'}
                  {callStatus === 'ringing' && 'Tocando...'}
                  {callStatus === 'active' && formatTime(callDuration)}
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <Button
                    aria-label={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={onToggleMute}
                    disabled={callStatus !== 'active'}
                  >
                    {isMuted ? (
                      <MicOff className="h-5 w-5 text-destructive" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    aria-label="Encerrar chamada"
                    variant="destructive"
                    size="icon"
                    className="h-14 w-14 rounded-full"
                    onClick={onHangUp}
                  >
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </div>
                <p className="mt-3 text-[10px] text-muted-foreground/60">
                  Legendas em tempo real não disponíveis nesta chamada.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Number Display */}
      {!isInCall && (
        <div className="relative w-full">
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^0-9+*#]/g, ''))}
            placeholder="Digite o número"
            className="h-14 border-border bg-muted/50 pr-10 text-center text-xl tracking-widest"
          />
          {number && (
            <Button
              aria-label="Apagar último dígito"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={handleDelete}
            >
              <Delete className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}

      {/* Dial Grid */}
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-2">
        {dialButtons.map((row) =>
          row.map((digit) => (
            <motion.button
              key={digit}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleDigit(digit)}
              className="flex h-16 w-full flex-col items-center justify-center rounded-xl border border-border/50 bg-muted/50 transition-colors hover:bg-muted"
            >
              <span className="text-xl font-semibold text-foreground">{digit}</span>
              {subLabels[digit] && (
                <span className="text-[9px] tracking-widest text-muted-foreground">
                  {subLabels[digit]}
                </span>
              )}
            </motion.button>
          ))
        )}
      </div>

      {/* Call Button */}
      {!isInCall && (
        <Button
          aria-label="Fazer chamada"
          size="lg"
          className="h-16 w-16 rounded-full bg-success hover:bg-success/90"
          onClick={handleCall}
          disabled={!number.trim() || !isConnected}
        >
          <Phone className="h-7 w-7 text-success-foreground" />
        </Button>
      )}

      {!isConnected && !isInCall && (
        <p className="text-center text-xs text-muted-foreground">
          Conecte-se ao servidor SIP para fazer chamadas
        </p>
      )}
    </div>
  );
}

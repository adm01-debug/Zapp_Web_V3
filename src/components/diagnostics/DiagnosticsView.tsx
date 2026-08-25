import { useState } from 'react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { ConnectionHealthPanel } from '@/components/diagnostics/ConnectionHealthPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from '@/components/ui/motion';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  ArrowUpDown,
  Activity,
  Server,
  Database,
  HardDrive,
  Zap,
  Bug,
  FileWarning,
  Loader2,
  Shield,
  HeartPulse,
  Send,
  Mail,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useDiagnosticsData, type SystemHealth } from '@/features/admin';
import { EmailStatusPanel } from '@/components/gmail/GmailStatusPanel';

// ─── Helpers ───
function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected'
      ? 'bg-success'
      : status === 'connecting'
        ? 'bg-warning'
        : 'bg-destructive';
  return (
    <span className="relative flex h-3 w-3">
      {status === 'connected' && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            color
          )}
        />
      )}
      <span className={cn('relative inline-flex h-3 w-3 rounded-full', color)} />
    </span>
  );
}

function HealthBadge({ status }: { status: 'healthy' | 'degraded' | 'down' }) {
  const config = {
    healthy: {
      label: 'Saudável',
      icon: CheckCircle2,
      className: 'bg-success/10 text-success border-success/20',
    },
    degraded: {
      label: 'Degradado',
      icon: AlertTriangle,
      className: 'bg-warning/10 text-warning border-warning/20',
    },
    down: {
      label: 'Fora do ar',
      icon: XCircle,
      className: 'bg-destructive/10 text-destructive border-destructive/20',
    },
  };
  const c = config[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', c.className)}>
      <c.icon className="h-3.5 w-3.5" />
      {c.label}
    </Badge>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('space-y-2 rounded-xl border border-border/50 bg-card p-4', className)}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

const SEVERITY_CONFIG = {
  info: { icon: Activity, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
  warning: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/20',
  },
  error: {
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/20',
  },
  critical: {
    icon: Bug,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/20',
  },
};

const HEALTH_ITEMS: Array<{
  key: keyof Pick<SystemHealth, 'database' | 'storage' | 'realtime' | 'edgeFunctions'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  getDetail: (h: SystemHealth) => string;
}> = [
  {
    key: 'database',
    label: 'Banco de Dados',
    icon: Database,
    getDetail: (h) =>
      `Latência: ${h.dbLatency}ms · ${h.contactsCount} contatos · ${h.messagesCount} mensagens`,
  },
  {
    key: 'storage',
    label: 'Armazenamento',
    icon: HardDrive,
    getDetail: (h) => `Latência: ${h.storageLatency}ms`,
  },
  { key: 'realtime', label: 'Realtime', icon: Zap, getDetail: () => 'Canal de tempo real ativo' },
  {
    key: 'edgeFunctions',
    label: 'Backend Functions',
    icon: Server,
    getDetail: (h) => `${h.connectionsCount} conexão(ões) configurada(s)`,
  },
];

// ─── Main ───
/** Diagnostics View component for the diagnostics section. */
export function DiagnosticsView() {
  const [activeTab, setActiveTab] = useState('connections');
  const {
    loading,
    refreshing,
    lastRefresh,
    connections,
    messageDiag,
    health,
    errorLogs,
    handleRefresh,
    errorCount,
    warningCount,
    connectedCount,
  } = useDiagnosticsData();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando diagnósticos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-2xl font-bold text-foreground">
            <div className="rounded-xl bg-primary/10 p-2">
              <Bug className="h-6 w-6 text-primary" />
            </div>
            Diagnóstico do Sistema
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitoramento em tempo real · Última atualização:{' '}
            {format(lastRefresh, 'HH:mm:ss', { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {errorCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3.5 w-3.5" />
              {errorCount} erro(s)
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="outline" className="gap-1 border-warning/20 bg-warning/10 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {warningCount} aviso(s)
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 gap-3 border-b border-border/30 px-6 py-4 md:grid-cols-4">
        <MetricCard
          icon={Wifi}
          label="Conexões ativas"
          value={`${connectedCount}/${connections.length}`}
          sub={connectedCount === connections.length ? 'Todas conectadas' : 'Atenção necessária'}
        />
        <MetricCard
          icon={Send}
          label="Taxa de entrega (24h)"
          value={`${messageDiag?.deliveryRate || 0}%`}
          sub={`${messageDiag?.failed || 0} falhas`}
        />
        <MetricCard
          icon={Database}
          label="Latência do banco"
          value={`${health?.dbLatency || 0}ms`}
          sub={health?.database === 'healthy' ? 'Normal' : 'Lento'}
        />
        <MetricCard
          icon={Bug}
          label="Problemas detectados"
          value={errorLogs.length}
          sub={errorCount > 0 ? `${errorCount} críticos` : 'Nenhum crítico'}
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-6 mt-4 bg-muted/50 p-1">
          <TabsTrigger value="connections" className="gap-2">
            <Wifi className="h-4 w-4" />
            Conexões
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <Server className="h-4 w-4" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="email-status" className="gap-2">
            <Mail className="h-4 w-4" />
            Email Status
          </TabsTrigger>
          <TabsTrigger value="connection-health" className="gap-2">
            <HeartPulse className="h-4 w-4" />
            Connection Health
          </TabsTrigger>
          <TabsTrigger value="logs" className="relative gap-2">
            <FileWarning className="h-4 w-4" />
            Logs de Erros
            {errorLogs.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {errorLogs.length > 9 ? '9+' : errorLogs.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Conexões */}
          <TabsContent value="connections" className="space-y-4 px-6 py-4">
            {connections.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-0">
                  <GenericEmptyState
                    icon={WifiOff}
                    title="Nenhuma conexão encontrada"
                    description="Configure uma conexão WhatsApp para começar."
                    className="py-8"
                  />
                </CardContent>
              </Card>
            ) : (
              connections.map((conn, i) => (
                <motion.div
                  key={conn.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card>
                    <CardContent className="flex items-center justify-between p-5">
                      <div className="flex items-center gap-4">
                        <StatusDot status={conn.status} />
                        <div>
                          <p className="font-semibold text-foreground">{conn.instance_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {conn.phone_number || 'Sem número vinculado'} · Criada{' '}
                            {formatDistanceToNow(new Date(conn.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            conn.status === 'connected'
                              ? 'border-success/20 bg-success/10 text-success'
                              : conn.status === 'connecting'
                                ? 'border-warning/20 bg-warning/10 text-warning'
                                : 'border-destructive/20 bg-destructive/10 text-destructive'
                          )}
                        >
                          {conn.status === 'connected'
                            ? 'Conectado'
                            : conn.status === 'connecting'
                              ? 'Conectando'
                              : conn.status || 'Desconectado'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Atualizado{' '}
                          {formatDistanceToNow(new Date(conn.updated_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </TabsContent>

          {/* Mensagens */}
          <TabsContent value="messages" className="space-y-6 px-6 py-4">
            {messageDiag && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <MetricCard
                    icon={Send}
                    label="Total enviadas"
                    value={messageDiag.total}
                    sub="Últimas 24h"
                  />
                  <MetricCard icon={CheckCircle2} label="Enviadas" value={messageDiag.sent} />
                  <MetricCard icon={ArrowUpDown} label="Entregues" value={messageDiag.delivered} />
                  <MetricCard icon={CheckCircle2} label="Lidas" value={messageDiag.read} />
                  <MetricCard
                    icon={XCircle}
                    label="Falharam"
                    value={messageDiag.failed}
                    className={messageDiag.failed > 0 ? 'border-destructive/30' : ''}
                  />
                  <MetricCard
                    icon={Clock}
                    label="Pendentes"
                    value={messageDiag.pending}
                    className={messageDiag.pending > 0 ? 'border-warning/30' : ''}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Taxa de entrega</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${messageDiag.deliveryRate}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className={cn(
                            'h-full rounded-full',
                            messageDiag.deliveryRate >= 90
                              ? 'bg-success'
                              : messageDiag.deliveryRate >= 70
                                ? 'bg-warning'
                                : 'bg-destructive'
                          )}
                        />
                      </div>
                      <span className="text-lg font-bold text-foreground">
                        {messageDiag.deliveryRate}%
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>🟢 Entregues + Lidas: {messageDiag.delivered + messageDiag.read}</span>
                      <span>🔴 Falhas: {messageDiag.failed}</span>
                      <span>🟡 Taxa de falha: {messageDiag.failureRate}%</span>
                    </div>
                  </CardContent>
                </Card>

                {messageDiag.recentFailures.length > 0 && (
                  <Card className="border-destructive/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base text-destructive">
                        <XCircle className="h-5 w-5" />
                        Falhas recentes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {messageDiag.recentFailures.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between rounded-lg border border-destructive/10 bg-destructive/5 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {f.contact_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {f.content.slice(0, 60)}
                            </p>
                          </div>
                          <span className="ml-3 whitespace-nowrap text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(f.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Health */}
          <TabsContent value="health" className="space-y-4 px-6 py-4">
            {health && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {HEALTH_ITEMS.map(({ key, label, icon: Icon, getDetail }, i) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card>
                        <CardContent className="flex items-center justify-between p-5">
                          <div className="flex items-center gap-4">
                            <div
                              className={cn(
                                'rounded-xl p-2.5',
                                health[key] === 'healthy'
                                  ? 'bg-success/10'
                                  : health[key] === 'degraded'
                                    ? 'bg-warning/10'
                                    : 'bg-destructive/10'
                              )}
                            >
                              <Icon
                                className={cn(
                                  'h-5 w-5',
                                  health[key] === 'healthy'
                                    ? 'text-success'
                                    : health[key] === 'degraded'
                                      ? 'text-warning'
                                      : 'text-destructive'
                                )}
                              />
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{label}</p>
                              <p className="text-xs text-muted-foreground">{getDetail(health)}</p>
                            </div>
                          </div>
                          <HealthBadge status={health[key]} />
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <Card className="bg-card/50">
                  <CardContent className="flex items-center gap-4 p-5">
                    <Shield
                      className={cn(
                        'h-8 w-8',
                        Object.values({
                          db: health.database,
                          st: health.storage,
                          rt: health.realtime,
                          ef: health.edgeFunctions,
                        }).every((s) => s === 'healthy')
                          ? 'text-success'
                          : 'text-warning'
                      )}
                    />
                    <div>
                      <p className="font-semibold text-foreground">
                        {Object.values({
                          db: health.database,
                          st: health.storage,
                          rt: health.realtime,
                          ef: health.edgeFunctions,
                        }).every((s) => s === 'healthy')
                          ? '✅ Todos os sistemas operacionais'
                          : '⚠️ Alguns sistemas precisam de atenção'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Auto-refresh a cada 30 segundos
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Connection Health */}
          <TabsContent value="connection-health" className="px-6 py-4">
            <ConnectionHealthPanel />
          </TabsContent>

          {/* Email Status */}
          <TabsContent value="email-status" className="px-6 py-4">
            <EmailStatusPanel />
          </TabsContent>

          {/* Logs */}
          <TabsContent value="logs" className="space-y-3 px-6 py-4">
            {errorLogs.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="mb-4 h-12 w-12 text-success" />
                  <p className="text-lg font-medium text-foreground">Nenhum problema detectado</p>
                  <p className="text-sm text-muted-foreground">
                    Todos os sistemas estão funcionando normalmente.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <AnimatePresence>
                {errorLogs.map((logItem, i) => {
                  const sev = SEVERITY_CONFIG[logItem.severity];
                  const SevIcon = sev.icon;
                  return (
                    <motion.div
                      key={logItem.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card className={cn('border', sev.border)}>
                        <CardContent className="flex items-start gap-4 p-4">
                          <div className={cn('mt-0.5 rounded-lg p-2', sev.bg)}>
                            <SevIcon className={cn('h-4 w-4', sev.color)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase tracking-wider"
                              >
                                {logItem.type}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] uppercase tracking-wider',
                                  sev.bg,
                                  sev.color,
                                  sev.border
                                )}
                              >
                                {logItem.severity}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium text-foreground">{logItem.message}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{logItem.details}</p>
                          </div>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDistanceToNow(logItem.timestamp, {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

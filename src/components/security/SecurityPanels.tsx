import { motion } from '@/components/ui/motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Smartphone, Monitor, Globe, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
  is_resolved: boolean | null;
}

interface Device {
  id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  is_trusted: boolean;
  last_seen_at: string;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high':
    case 'critical':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'medium':
      return 'bg-warning/10 text-warning border-warning/20';
    default:
      return 'bg-info/10 text-info border-info/20';
  }
};

interface SecurityAlertsPanelProps {
  alerts: SecurityAlert[];
  loading: boolean;
}

/** Security Alerts Panel component for the security section. */
export function SecurityAlertsPanel({ alerts, loading }: SecurityAlertsPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertas Recentes
          </CardTitle>
          <CardDescription>Atividades de segurança na sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-3 h-12 w-12 text-success" />
              <h4 className="font-medium">Nenhum alerta recente</h4>
              <p className="text-sm text-muted-foreground">
                Sua conta está segura e sem atividades suspeitas
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-4 rounded-lg border bg-card p-4"
                >
                  <div className={`rounded-lg p-2 ${getSeverityColor(alert.severity)}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h4 className="truncate font-medium">{alert.title}</h4>
                      <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                      {alert.is_resolved && (
                        <Badge
                          variant="outline"
                          className="border-success/20 bg-success/10 text-success"
                        >
                          Resolvido
                        </Badge>
                      )}
                    </div>
                    {alert.description && (
                      <p className="truncate text-sm text-muted-foreground">{alert.description}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(alert.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface SecurityDevicesPanelProps {
  devices: Device[];
  loading: boolean;
}

/** Security Devices Panel component for the security section. */
export function SecurityDevicesPanel({ devices, loading }: SecurityDevicesPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Dispositivos Recentes
          </CardTitle>
          <CardDescription>Últimos dispositivos que acessaram sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Smartphone className="mb-3 h-12 w-12 text-muted-foreground" />
              <h4 className="font-medium">Nenhum dispositivo registrado</h4>
              <p className="text-sm text-muted-foreground">
                Seus dispositivos aparecerão aqui após o login
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.slice(0, 5).map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg bg-muted p-2">
                      {device.os?.toLowerCase().includes('mobile') ||
                      device.os?.toLowerCase().includes('android') ||
                      device.os?.toLowerCase().includes('ios') ? (
                        <Smartphone className="h-5 w-5" />
                      ) : (
                        <Monitor className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{device.device_name || 'Dispositivo'}</h4>
                        {device.is_trusted && (
                          <Badge
                            variant="outline"
                            className="border-success/20 bg-success/10 text-xs text-success"
                          >
                            Confiável
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {device.browser} · {device.os}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {device.ip_address}
                        <span className="mx-1">·</span>
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(device.last_seen_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

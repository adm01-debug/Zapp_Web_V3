import { useState } from 'react';
import { motion } from '@/components/ui/motion';
import {
  Shield,
  Key,
  Smartphone,
  History,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MFASettings } from '@/features/auth';
import { useAuth } from '@/features/auth';
import { useMFA } from '@/features/auth';
import { useReauthentication } from '@/features/auth';
import { ReauthDialog } from '@/features/auth';

interface SecuritySettingsPanelProps {
  onSwitchTab?: (tab: string) => void;
}

/** Security Settings Panel component for the security section. */
export function SecuritySettingsPanel({ onSwitchTab }: SecuritySettingsPanelProps) {
  const { user } = useAuth();
  const { isMFAEnabled, factors } = useMFA();
  const {
    showReauthDialog,
    pendingAction,
    requireReauth,
    confirmReauth,
    cancelReauth,
    getActionLabel,
    isReauthenticating,
  } = useReauthentication();

  const [showMFASettings, setShowMFASettings] = useState(false);

  const securityItems = [
    {
      icon: Smartphone,
      title: 'Autenticação em Dois Fatores (2FA)',
      description: isMFAEnabled
        ? `${factors.filter((f) => f.status === 'verified').length} método(s) configurado(s)`
        : 'Adicione uma camada extra de proteção',
      status: isMFAEnabled ? 'enabled' : 'disabled',
      action: () => {
        requireReauth('configure_mfa', async () => {
          setShowMFASettings(true);
        });
      },
    },
    {
      icon: Key,
      title: 'Alterar Senha',
      description: 'Atualize sua senha regularmente para maior segurança',
      status: 'action',
      action: () => {
        requireReauth('change_password', async () => {
          window.location.href = '/reset-password';
        });
      },
    },
    {
      icon: History,
      title: 'Sessões Ativas',
      description: 'Gerencie dispositivos conectados à sua conta',
      status: 'info',
      action: () => {
        if (onSwitchTab) {
          onSwitchTab('devices');
        }
      },
    },
    {
      icon: AlertTriangle,
      title: 'Alertas de Segurança',
      description: 'Receba notificações sobre atividades suspeitas',
      status: 'enabled',
      action: () => {
        if (onSwitchTab) {
          onSwitchTab('notifications');
        }
      },
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'enabled':
        return (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            <CheckCircle className="mr-1 h-3 w-3" />
            Ativo
          </Badge>
        );
      case 'disabled':
        return (
          <Badge
            variant="outline"
            className="border-destructive/30 bg-destructive/10 text-destructive"
          >
            <XCircle className="mr-1 h-3 w-3" />
            Desativado
          </Badge>
        );
      default:
        return null;
    }
  };

  if (showMFASettings) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setShowMFASettings(false)}>
          ← Voltar
        </Button>
        <MFASettings />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Segurança da Conta</CardTitle>
              <CardDescription>
                Gerencie suas configurações de segurança e autenticação
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Security Score */}
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Nível de Segurança</span>
              <Badge variant={isMFAEnabled ? 'default' : 'secondary'}>
                {isMFAEnabled ? 'Alto' : 'Médio'}
              </Badge>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: isMFAEnabled ? '100%' : '60%' }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`h-full rounded-full ${isMFAEnabled ? 'bg-success' : 'bg-warning'}`}
              />
            </div>
            {!isMFAEnabled && (
              <p className="mt-2 text-xs text-muted-foreground">
                Ative o 2FA para aumentar a segurança da sua conta
              </p>
            )}
          </div>

          <Separator />

          {/* Security Items */}
          <div className="space-y-2">
            {securityItems.map((item, index) => (
              <motion.button
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={item.action}
                className="group flex w-full items-center gap-4 rounded-lg p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="rounded-lg bg-muted p-2">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                {getStatusBadge(item.status)}
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </motion.button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Informações da Conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Último login</span>
            <span className="text-sm font-medium">
              {user?.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString('pt-BR')
                : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Conta criada em</span>
            <span className="text-sm font-medium">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : 'N/A'}
            </span>
          </div>
        </CardContent>
      </Card>

      <ReauthDialog
        open={showReauthDialog}
        onOpenChange={() => cancelReauth()}
        actionLabel={pendingAction ? getActionLabel(pendingAction) : ''}
        onConfirm={confirmReauth}
        onCancel={cancelReauth}
        isLoading={isReauthenticating}
      />
    </div>
  );
}

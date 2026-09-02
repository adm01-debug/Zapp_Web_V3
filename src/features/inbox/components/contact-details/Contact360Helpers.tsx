/**
 * ExternalContact360Panel — Helper sub-components
 * Extracted from the main panel to reduce file size.
 */
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import {
  Building,
  Globe,
  MapPin,
  Phone,
  Mail,
  TrendingUp,
  ShoppingCart,
  User,
  Calendar,
  ExternalLink,
  CircleDollarSign,
  Briefcase,
  Award,
  Shield,
  Star,
  FileText,
  DollarSign,
  Tag,
  Clock,
  Instagram,
  Linkedin,
  Facebook,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import type {
  Contact360RFM,
  Contact360Customer,
  Contact360Company,
  Contact360Contact,
  Contact360Interaction,
  Contact360Stakeholder,
  Contact360Data,
} from '@/types/contact360';

// ─── Section header ──────────────────────────────────────────
/** Section Title function. */
export function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <h5 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      {children}
    </h5>
  );
}

// ─── Info row helper ─────────────────────────────────────────
/** Info Row function. */
export function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: React.ElementType;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/15 px-2 py-1 text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="max-w-[55%] truncate text-right font-medium">{value}</span>
    </div>
  );
}

// ─── RFM Badge ───────────────────────────────────────────────
/** R F M Badge function. */
export function RFMBadge({ rfm }: { rfm: Contact360RFM }) {
  const segmentColors: Record<string, string> = {
    Champions: 'bg-success/15 text-success border-success/30',
    'Loyal Customers': 'bg-info/15 text-info border-info/30',
    'Potential Loyalist': 'bg-primary/15 text-primary border-primary/30',
    'Recent Customers': 'bg-accent/15 text-accent border-accent/30',
    Promising: 'bg-secondary/15 text-secondary border-secondary/30',
    'Need Attention': 'bg-warning/15 text-warning border-warning/30',
    'About to Sleep': 'bg-warning/15 text-warning border-warning/30',
    'At Risk': 'bg-destructive/15 text-destructive border-destructive/30',
    Hibernating: 'bg-muted text-muted-foreground border-border',
    Lost: 'bg-muted/50 text-muted-foreground border-border/50',
    "Can't Lose Them": 'bg-destructive/15 text-destructive border-destructive/30',
  };
  const barColors: Record<string, string> = {
    Champions: 'bg-success',
    'Loyal Customers': 'bg-info',
    'Potential Loyalist': 'bg-primary',
    'At Risk': 'bg-destructive',
    Hibernating: 'bg-muted-foreground',
    Lost: 'bg-muted-foreground/60',
    "Can't Lose Them": 'bg-destructive',
  };
  const color =
    segmentColors[rfm.segment_code || ''] || 'bg-muted/30 text-muted-foreground border-border/30';
  const barColor = barColors[rfm.segment_code || ''] || 'bg-primary';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={cn('text-xs', color)}>
          {rfm.segment_code || 'Sem segmento'}
        </Badge>
        {rfm.combined_score != null && (
          <span className="text-xs text-muted-foreground">
            Score: {rfm.combined_score.toFixed(1)}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {[
          { abbr: 'R', value: rfm.recency_score },
          { abbr: 'F', value: rfm.frequency_score },
          { abbr: 'M', value: rfm.monetary_score },
        ].map(({ abbr, value }) => (
          <div key={abbr} className="flex items-center gap-2">
            <span className="w-3 text-[10px] font-semibold text-muted-foreground">{abbr}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/30">
              <motion.div
                className={cn('h-full rounded-full', barColor)}
                initial={{ width: 0 }}
                animate={{ width: `${((value ?? 0) / 5) * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span className="w-4 text-right text-[10px] font-medium text-muted-foreground">
              {value ?? '—'}
            </span>
          </div>
        ))}
      </div>
      {rfm.overall_trend && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <TrendingUp className="h-3 w-3" /> Tendência:{' '}
          <span className="font-medium">{rfm.overall_trend}</span>
        </div>
      )}
      {rfm.last_interaction_date && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> Última interação:{' '}
          {format(new Date(rfm.last_interaction_date), 'dd/MM/yyyy', { locale: ptBR })}
        </div>
      )}
    </div>
  );
}

// ─── Company Card ────────────────────────────────────────────
/** Company Card function. */
export function CompanyCard({ company }: { company: Contact360Company }) {
  const displayName = company.nome_fantasia || company.nome_crm || company.razao_social;
  const formatCurrency = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null;

  return (
    <div className="to-primary/3 space-y-2 rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 via-transparent p-3">
      <div className="flex items-start gap-3">
        {company.logo_url ? (
          <img
            loading="lazy"
            decoding="async"
            src={company.logo_url}
            alt={displayName || ''}
            className="h-10 w-10 rounded-lg border border-border/30 bg-background object-contain"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          {company.razao_social && company.razao_social !== displayName && (
            <p className="truncate text-[10px] text-muted-foreground">{company.razao_social}</p>
          )}
          {company.cnpj && (
            <p className="text-[10px] text-muted-foreground">
              {company.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        {company.ramo_atividade && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/20 p-1.5 text-muted-foreground">
            <Briefcase className="h-3 w-3 shrink-0" />
            <span className="truncate">{company.ramo_atividade}</span>
          </div>
        )}
        {company.porte_rf && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/20 p-1.5 text-muted-foreground">
            <Award className="h-3 w-3 shrink-0" />
            <span className="truncate">{company.porte_rf}</span>
          </div>
        )}
        {company.nicho_cliente && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/20 p-1.5 text-muted-foreground">
            <Tag className="h-3 w-3 shrink-0" />
            <span className="truncate">{company.nicho_cliente}</span>
          </div>
        )}
        {company.natureza_juridica_desc && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/20 p-1.5 text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{company.natureza_juridica_desc}</span>
          </div>
        )}
        {company.capital_social != null && company.capital_social > 0 && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/20 p-1.5 text-muted-foreground">
            <DollarSign className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatCurrency(company.capital_social)}</span>
          </div>
        )}
        {company.data_fundacao && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/20 p-1.5 text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {format(new Date(company.data_fundacao), 'dd/MM/yyyy')}
            </span>
          </div>
        )}
        {company.inscricao_estadual && (
          <div className="col-span-2 flex items-center gap-1.5 rounded-md bg-muted/20 p-1.5 text-muted-foreground">
            <Shield className="h-3 w-3 shrink-0" />
            <span className="truncate">IE: {company.inscricao_estadual}</span>
          </div>
        )}
        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 flex items-center gap-1.5 rounded-md bg-primary/5 p-1.5 text-primary hover:underline"
          >
            <Globe className="h-3 w-3 shrink-0" />
            <span className="truncate">{company.website.replace(/https?:\/\/(www\.)?/, '')}</span>
            <ExternalLink className="ml-auto h-3 w-3 shrink-0" />
          </a>
        )}
      </div>
      {company.status && (
        <Badge variant="outline" className="text-[10px]">
          Status: {company.status}
        </Badge>
      )}
    </div>
  );
}

// ─── Customer Profile ────────────────────────────────────────
/** Customer Profile function. */
export function CustomerProfile({ customer }: { customer: Contact360Customer }) {
  const formatCurrency = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">Vendedor:</span>
          <span className="text-xs font-medium">{customer.vendedor_nome || '—'}</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            customer.cliente_ativado
              ? 'border-success/30 bg-success/15 text-success'
              : 'border-destructive/30 bg-destructive/15 text-destructive'
          )}
        >
          {customer.cliente_ativado ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>
      {customer.sdr_nome && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3" /> SDR:{' '}
          <span className="font-medium text-foreground">{customer.sdr_nome}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg bg-muted/20 p-2 text-center">
          <ShoppingCart className="mx-auto mb-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">{customer.total_pedidos}</p>
          <p className="text-[10px] text-muted-foreground">Pedidos</p>
        </div>
        <div className="rounded-lg bg-muted/20 p-2 text-center">
          <CircleDollarSign className="mx-auto mb-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">{formatCurrency(customer.ticket_medio)}</p>
          <p className="text-[10px] text-muted-foreground">Ticket médio</p>
        </div>
        <div className="col-span-2 rounded-lg bg-muted/20 p-2 text-center">
          <TrendingUp className="mx-auto mb-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">{formatCurrency(customer.valor_total_compras)}</p>
          <p className="text-[10px] text-muted-foreground">Total compras</p>
        </div>
      </div>
      <div className="space-y-1">
        <InfoRow label="Poder de Compra" value={customer.poder_compra} />
        <InfoRow label="Perfil Preço" value={customer.perfil_preco} />
        <InfoRow label="Perfil Qualidade" value={customer.perfil_qualidade} />
        <InfoRow label="Perfil Prazo" value={customer.perfil_prazo} />
        <InfoRow label="Grupo" value={customer.grupo_clientes} />
        <InfoRow label="Ramo" value={customer.ramo_atividade} />
      </div>
      {(customer.data_primeira_compra || customer.data_ultima_compra) && (
        <div className="flex items-center justify-between rounded-md bg-muted/10 p-1.5 text-[10px] text-muted-foreground">
          {customer.data_primeira_compra && (
            <span>
              1ª: {format(new Date(customer.data_primeira_compra), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          )}
          {customer.data_ultima_compra && (
            <span>
              Última:{' '}
              {format(new Date(customer.data_ultima_compra), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          )}
        </div>
      )}
      {customer.data_ativacao && (
        <div className="text-[10px] text-muted-foreground">
          Ativado em: {format(new Date(customer.data_ativacao), 'dd/MM/yyyy', { locale: ptBR })}
        </div>
      )}
      {customer.motivo_inativacao && (
        <div className="rounded-md bg-destructive/10 p-1.5 text-[10px] text-destructive">
          Motivo inativação: {customer.motivo_inativacao}
        </div>
      )}
    </div>
  );
}

// ─── Contact Detail Card ─────────────────────────────────────
/** Contact Detail Card function. */
export function ContactDetailCard({ contact }: { contact: Contact360Contact }) {
  return (
    <div className="space-y-1">
      <InfoRow
        label="Nome"
        value={contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
        icon={User}
      />
      <InfoRow label="Tratamento" value={contact.nome_tratamento} />
      <InfoRow label="Apelido" value={contact.apelido} />
      <InfoRow label="Cargo" value={contact.cargo} icon={Briefcase} />
      <InfoRow label="Depto." value={contact.departamento} />
      <InfoRow label="CPF" value={contact.cpf} icon={Shield} />
      {contact.data_nascimento && (
        <InfoRow
          label="Nascimento"
          value={format(new Date(contact.data_nascimento), 'dd/MM/yyyy')}
          icon={Calendar}
        />
      )}
      <InfoRow label="Sentimento" value={contact.sentiment} />
      <InfoRow label="Estágio" value={contact.relationship_stage} icon={Star} />
      <InfoRow label="Fonte" value={contact.source} />
      {contact.tags && contact.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {contact.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="px-1.5 py-0 text-[9px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {contact.notes && (
        <div className="mt-1 rounded-md bg-muted/10 p-1.5 text-[10px] text-muted-foreground">
          {contact.notes}
        </div>
      )}
    </div>
  );
}

// ─── Stakeholder Card ────────────────────────────────────────
/** Stakeholder Card function. */
export function StakeholderCard({ stakeholder }: { stakeholder: Contact360Stakeholder }) {
  return (
    <div className="space-y-1">
      <InfoRow label="Papel" value={stakeholder.buying_role} />
      <InfoRow label="Poder" value={`${stakeholder.power_level}/10`} />
      <InfoRow label="Interesse" value={`${stakeholder.interest_level}/10`} />
      <InfoRow label="Posição" value={stakeholder.stance} />
      <InfoRow label="Prioridade" value={stakeholder.engagement_priority} />
    </div>
  );
}

// ─── Interactions Timeline ───────────────────────────────────
/** Interactions Timeline function. */
export function InteractionsTimeline({ interactions }: { interactions: Contact360Interaction[] }) {
  if (!interactions.length) return null;
  const channelEmoji: Record<string, string> = {
    whatsapp: '💬',
    email: '📧',
    phone: '📞',
    presencial: '🤝',
    chat: '💻',
  };
  const sentimentEmoji: Record<string, string> = {
    positive: '😊',
    neutral: '😐',
    negative: '😟',
    critical: '🔴',
  };
  return (
    <div className="max-h-[200px] space-y-1.5 overflow-y-auto">
      {interactions.map((i) => (
        <div key={i.id} className="flex items-start gap-2 rounded-md bg-muted/10 p-1.5 text-xs">
          <span className="mt-0.5 shrink-0 text-base leading-none">
            {channelEmoji[i.channel] || '📝'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{i.assunto || i.type || 'Interação'}</p>
            {i.resumo && <p className="truncate text-muted-foreground">{i.resumo}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-muted-foreground">
              {format(new Date(i.data_interacao), 'dd/MM', { locale: ptBR })}
            </p>
            {i.sentiment && (
              <span className="text-[10px]">{sentimentEmoji[i.sentiment] || ''}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Social Links ────────────────────────────────────────────
/** Social Links function. */
export function SocialLinks({
  social,
}: {
  social: { plataforma: string; url: string | null; handle: string | null }[];
}) {
  if (!social.length) return null;
  const icons: Record<string, React.ReactNode> = {
    instagram: <Instagram className="h-3.5 w-3.5" />,
    linkedin: <Linkedin className="h-3.5 w-3.5" />,
    facebook: <Facebook className="h-3.5 w-3.5" />,
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {social.map((s) => (
        <a
          key={s.plataforma}
          href={s.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-muted/20 px-2 py-1 text-xs transition-colors hover:bg-muted/40"
          title={`${s.plataforma}: ${s.handle || ''}`}
        >
          {icons[s.plataforma] || <Globe className="h-3.5 w-3.5" />}
          <span className="max-w-[100px] truncate">{s.handle || s.plataforma}</span>
        </a>
      ))}
    </div>
  );
}

// ─── Address ─────────────────────────────────────────────────
/** Address Line function. */
export function AddressLine({ address }: { address: Contact360Data['company_address'] }) {
  if (!address) return null;
  const parts = [
    address.logradouro,
    address.numero && `nº ${address.numero}`,
    address.complemento,
    address.bairro,
    address.cidade && address.estado && `${address.cidade}/${address.estado}`,
    address.cep,
  ].filter(Boolean);
  const mapsUrl =
    address.latitude && address.longitude
      ? `https://www.google.com/maps?q=${address.latitude},${address.longitude}`
      : null;
  return (
    <div className="rounded-md bg-muted/10 p-2 text-xs text-muted-foreground">
      <div className="flex items-start gap-1.5">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div>
          <p>{parts.join(', ')}</p>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-primary hover:underline"
            >
              Ver no mapa <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Contact Phones & Emails ─────────────────────────────────
/** Contact Channels function. */
export function ContactChannels({
  phones,
  emails,
}: {
  phones: Contact360Data['contact_phones'];
  emails: Contact360Data['contact_emails'];
}) {
  if (!phones?.length && !emails?.length) return null;
  return (
    <div className="space-y-1 text-xs">
      {phones?.map((p) => (
        <button
          type="button"
          key={p.numero_e164 || p.numero}
          aria-label={`Copiar número ${p.numero_e164 || p.numero}`}
          className="flex w-full cursor-pointer items-center gap-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            navigator.clipboard.writeText(p.numero_e164 || p.numero);
            toast.success('Copiado!');
          }}
        >
          <Phone className="h-3 w-3" />
          <span>{p.numero_e164 || p.numero}</span>
          {p.is_whatsapp && (
            <Badge variant="outline" className="px-1 py-0 text-[9px]">
              WA
            </Badge>
          )}
          {p.is_primary && (
            <Badge variant="outline" className="bg-primary/10 px-1 py-0 text-[9px]">
              P
            </Badge>
          )}
        </button>
      ))}
      {emails?.map((e) => (
        <button
          type="button"
          key={e.email}
          aria-label={`Copiar e-mail ${e.email}`}
          className="flex w-full cursor-pointer items-center gap-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            navigator.clipboard.writeText(e.email);
            toast.success('Copiado!');
          }}
        >
          <Mail className="h-3 w-3" />
          <span className="truncate">{e.email}</span>
          {e.is_primary && (
            <Badge variant="outline" className="bg-primary/10 px-1 py-0 text-[9px]">
              P
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Behavior Radar ──────────────────────────────────────────
/** Behavior Radar function. */
export function BehaviorRadar({
  decisionPower,
  formalityLevel,
  discProfile,
}: {
  decisionPower: number;
  formalityLevel: number;
  discProfile?: string | null;
}) {
  const dp = decisionPower / 10;
  const fl = formalityLevel / 5;
  const discMap: Record<string, number> = { D: 1, I: 0.8, S: 0.5, C: 0.7 };
  const ds = discProfile ? (discMap[discProfile.charAt(0)] ?? 0.5) : 0.5;
  const cx = 48,
    cy = 48,
    r = 36;
  const axes = [
    { angle: -90, value: dp, label: 'D' },
    { angle: 30, value: fl, label: 'F' },
    { angle: 150, value: ds, label: 'P' },
  ];
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const getPoint = (angle: number, val: number) => ({
    x: cx + Math.cos(toRad(angle)) * r * val,
    y: cy + Math.sin(toRad(angle)) * r * val,
  });
  const points = axes.map((a) => getPoint(a.angle, a.value));
  const poly = points.map((p) => `${p.x},${p.y}`).join(' ');
  const gridPoints = axes.map((a) => getPoint(a.angle, 1));
  const gridPoly = gridPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden="true">
      <polygon
        points={gridPoly}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="0.5"
        opacity="0.4"
      />
      {axes.map((a) => {
        const ep = getPoint(a.angle, 1);
        return (
          <line
            key={a.label}
            x1={cx}
            y1={cy}
            x2={ep.x}
            y2={ep.y}
            stroke="hsl(var(--muted))"
            strokeWidth="0.5"
            opacity="0.3"
          />
        );
      })}
      <motion.polygon
        points={poly}
        fill="hsl(var(--primary))"
        fillOpacity="0.15"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />
      {axes.map((a) => {
        const p = getPoint(a.angle, a.value);
        return <circle key={a.label} cx={p.x} cy={p.y} r="2.5" fill="hsl(var(--primary))" />;
      })}
      {axes.map((a) => {
        const lp = getPoint(a.angle, 1.25);
        return (
          <text
            key={a.label}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-[8px] font-medium"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

import {
  ShieldCheck, Briefcase, Eye, ArrowRight, Truck,
  Package, BarChart3, Wrench, BookOpen, CheckCircle2,
  Clock, Info, RotateCcw, AlertTriangle, FileText,
} from 'lucide-react'

// ─── Shared primitives ────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-5 ${className}`}>
      {children}
    </div>
  )
}

function Divider() {
  return <hr className="border-border" />
}

// ─── Role cards ───────────────────────────────────────────────────────────────

function RoleCard({
  icon: Icon,
  title,
  badge,
  badgeCls,
  items,
}: {
  icon: React.ElementType
  title: string
  badge: string
  badgeCls: string
  items: string[]
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <span className={`badge text-[10px] font-semibold ${badgeCls}`}>{badge}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Workflow step ────────────────────────────────────────────────────────────

function WorkflowStep({ label, sub, last = false }: { label: string; sub?: string; last?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-center min-w-[110px]">
        <p className="text-xs font-semibold text-primary">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {!last && <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90 sm:rotate-0 hidden sm:block" />}
    </div>
  )
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground w-36 flex-shrink-0">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

// ─── Feature badge ────────────────────────────────────────────────────────────

function FeaturePill({ label, status }: { label: string; status: 'live' | 'planned' }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
      status === 'live'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : 'bg-muted border-border text-muted-foreground'
    }`}>
      {status === 'live'
        ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        : <Clock className="w-3.5 h-3.5 flex-shrink-0" />}
      {label}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HelpPage() {
  return (
    <div className="max-w-3xl space-y-10 animate-fade-in pb-12">

      {/* Welcome */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">User Guide</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">RentalOps Quick User Guide</h1>
        <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
          This guide helps testers and rental business owners understand how the system works,
          what's currently available, and what's coming. No technical knowledge required.
        </p>
        <div className="flex items-center gap-2 mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 w-fit">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Testing build — workflows and permissions may continue evolving.
        </div>
      </div>

      <Divider />

      {/* Roles */}
      <Section title="User Roles" icon={ShieldCheck}>
        <p className="text-sm text-muted-foreground">
          Every account has one of three roles. Your role controls what you can see and do inside the app.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RoleCard
            icon={ShieldCheck}
            title="Admin"
            badge="Full Access"
            badgeCls="bg-violet-100 text-violet-700"
            items={[
              'Full system access',
              'Create, edit, and manage all records',
              'Manage dispatch board',
              'Handle invoices and payments',
              'Manage inventory catalog',
              'Access settings and configuration',
            ]}
          />
          <RoleCard
            icon={Briefcase}
            title="Staff"
            badge="Operational"
            badgeCls="bg-blue-100 text-blue-700"
            items={[
              'All day-to-day operations',
              'Create and update orders, customers, and inventory',
              'Record payments and returns',
              'Manage dispatch workflow',
              'Log damages and expenses',
            ]}
          />
          <RoleCard
            icon={Eye}
            title="Viewer"
            badge="Read Only"
            badgeCls="bg-muted text-muted-foreground"
            items={[
              'Browse all records safely',
              'View orders, customers, inventory',
              'See invoices and payments',
              'Explore dispatch board',
              'Cannot create or modify any data',
            ]}
          />
        </div>
      </Section>

      <Divider />

      {/* Order Workflow */}
      <Section title="Order Workflow" icon={FileText}>
        <p className="text-sm text-muted-foreground">
          Every rental follows this journey from start to finish. You can jump between steps
          from the Order Detail page.
        </p>

        {/* Desktop: horizontal flow */}
        <div className="hidden sm:flex items-center gap-1 flex-wrap">
          {[
            { label: 'Create Order', sub: 'Order details + items' },
            { label: 'Generate Invoice', sub: 'Auto from order' },
            { label: 'Record Payment', sub: 'Deposit or full' },
            { label: 'Schedule Dispatch', sub: 'Assign delivery' },
            { label: 'Delivery', sub: 'Out for delivery' },
            { label: 'Pickup', sub: 'Return pickup' },
            { label: 'Return Inspection', sub: 'Items checked in' },
            { label: 'Damage Log', sub: 'If needed', last: true },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-1">
              <WorkflowStep label={step.label} sub={step.sub} last={step.last} />
              {i < arr.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Mobile: vertical list */}
        <div className="sm:hidden space-y-2">
          {[
            'Create Order — Add event details and rental items',
            'Generate Invoice — Created automatically from the order',
            'Record Payment — Deposit or full balance',
            'Schedule Dispatch — Assign a delivery team and date',
            'Delivery — Track items out for delivery',
            'Pickup — Schedule return pickup',
            'Return Inspection — Check items back into inventory',
            'Damage Log — Report any damaged items if needed',
          ].map((step, i) => (
            <div key={step} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-primary">{i + 1}</span>
              </div>
              <p className="text-sm text-foreground">{step}</p>
            </div>
          ))}
        </div>

        <Card className="bg-muted/40">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Tip:</strong> Order statuses update automatically as you move
            through the workflow. You can also manually override the status from the Order Detail page.
          </p>
        </Card>
      </Section>

      <Divider />

      {/* Dispatch Logic */}
      <Section title="Dispatch Logic" icon={Truck}>
        <p className="text-sm text-muted-foreground">
          The Dispatch Board is a visual kanban board showing all active deliveries and pickups.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">How dispatching works</p>
            <div className="space-y-2">
              <InfoRow label="Creating a dispatch" value="From the Order Detail page — click Send to Dispatch" />
              <InfoRow label="Stages" value="Scheduled → Loading → Out for Delivery → Delivered → Pickup Pending → Returned" />
              <InfoRow label="Advancing stages" value="Click the → button on any dispatch card" />
              <InfoRow label="Configuring columns" value="Use the ⚙ icon to show/hide stages you don't use" />
            </div>
          </Card>
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Good to know</p>
            <ul className="space-y-2">
              {[
                'Hiding a stage column does NOT delete any records — they appear in an "Other Stages" column.',
                'Dispatches can be created manually for any eligible order.',
                'Marking a dispatch as Returned automatically updates the linked order status.',
                'Outstanding invoice balances trigger a warning before marking Returned.',
              ].map((note) => (
                <li key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                  {note}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Divider />

      {/* Inventory Workflow */}
      <Section title="Inventory &amp; Returns" icon={Package}>
        <p className="text-sm text-muted-foreground">
          Inventory is tracked by quantity. The system automatically adjusts availability as
          orders are reserved, dispatched, and returned.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Inventory quantities</p>
            <div className="space-y-2">
              <InfoRow label="Owned" value="Total units you own" />
              <InfoRow label="Available" value="Units not currently out on an order" />
              <InfoRow label="Out" value="Units currently at an event" />
              <InfoRow label="Damaged" value="Units flagged from damage reports" />
            </div>
          </Card>
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Returns &amp; damages</p>
            <ul className="space-y-2">
              {[
                'Recording a return restores item availability automatically.',
                'Damage reports reduce operational visibility and alert your team.',
                'Damage severity levels: Minor, Moderate, Severe.',
                'QR code scanning for individual item tracking is planned for a future phase.',
              ].map((note) => (
                <li key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  {note}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Divider />

      {/* Reports */}
      <Section title="Reports &amp; Analytics" icon={BarChart3}>
        <p className="text-sm text-muted-foreground">
          The Reports page gives you a financial and operational overview of your business.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Currently Available
            </p>
            <div className="flex flex-wrap gap-2">
              {['Revenue overview','Outstanding balances','Active orders','Inventory utilization','Top rented items'].map(r => (
                <FeaturePill key={r} label={r} status="live" />
              ))}
            </div>
          </Card>
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Planned Future Reports
            </p>
            <div className="flex flex-wrap gap-2">
              {['Accounting exports','Tax summaries','Profit & loss','Staff productivity','Advanced analytics'].map(r => (
                <FeaturePill key={r} label={r} status="planned" />
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <Divider />

      {/* Development Status */}
      <Section title="What's Still Being Built" icon={Wrench}>
        <p className="text-sm text-muted-foreground">
          RentalOps is an active build. The core rental workflow is fully functional.
          The features below are planned for upcoming phases.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Core — Working Now</p>
            <div className="flex flex-wrap gap-2">
              {[
                'Order management','Customer records','Inventory catalog',
                'Invoice generation','Payment recording','Dispatch board',
                'Returns logging','Damage reports','Expense tracking',
                'Role-based access','Calendar view','Reports',
              ].map(f => (
                <FeaturePill key={f} label={f} status="live" />
              ))}
            </div>
          </Card>
          <Card className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Coming in Future Phases
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'QR inventory scanning','Email receipts','Calendar drag & drop',
                'Data export tools','Advanced reporting','Customer portal',
                'SMS notifications','Multi-location support','Accounting integrations',
              ].map(f => (
                <FeaturePill key={f} label={f} status="planned" />
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <Divider />

      {/* Footer */}
      <div className="text-center space-y-1 py-4">
        <p className="text-xs text-muted-foreground">
          Questions during testing? Reach out to your system administrator.
        </p>
        <p className="text-[11px] text-muted-foreground/60">
          Testing build — workflows and permissions may continue evolving.
        </p>
      </div>

    </div>
  )
}

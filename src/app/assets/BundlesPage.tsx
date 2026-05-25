/**
 * BundlesPage — /assets/bundles
 *
 * Lists all asset bundles for the company.
 * Provides search, active/inactive filter, and navigation to detail/create.
 */

import { ChangeEvent, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Boxes, QrCode } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { PageShell, PageHeader, TableCard, TableToolbar, StatCard } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import { INVENTORY_CATEGORIES } from '@/lib/constants'
import QRLabelModal from '@/components/assets/QRLabelModal'
import type { AssetBundle } from '@/types/database'

type BundleRow = AssetBundle & {
  member_count: number
  catalog_item: { name: string; category: string } | null
}

export default function BundlesPage() {
  const { profile, appRole } = useAuth()
  const navigate = useNavigate()

  const [bundles, setBundles] = useState<BundleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active')

  // QR label modal — lifted here so list rows can open it without navigating
  const [qrBundle, setQrBundle] = useState<BundleRow | null>(null)
  const [qrOpen, setQrOpen] = useState(false)

  const fetchBundles = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      let query = supabase
        .from('asset_bundles')
        .select(`
          *,
          catalog_item:inventory_catalog(id, name, category)
        `)
        .eq('company_id', profile.company_id)
        .order('bundle_code', { ascending: true })

      if (activeFilter === 'active')   query = query.eq('is_active', true)
      if (activeFilter === 'inactive') query = query.eq('is_active', false)
      if (search) {
        query = query.or(`bundle_code.ilike.%${search}%,name.ilike.%${search}%`)
      }

      const { data: bundleData, error } = await query
      if (error) throw error

      // Fetch member counts separately
      const bundleIds = (bundleData ?? []).map((b) => b.id as string)
      let memberCounts: Record<string, number> = {}

      if (bundleIds.length > 0) {
        const { data: memberData } = await supabase
          .from('asset_bundle_members')
          .select('bundle_id')
          .eq('company_id', profile.company_id)
          .is('removed_at', null)
          .in('bundle_id', bundleIds)

        memberCounts = (memberData ?? []).reduce<Record<string, number>>((acc, m) => {
          const bid = m.bundle_id as string
          acc[bid] = (acc[bid] ?? 0) + 1
          return acc
        }, {})
      }

      const rows: BundleRow[] = (bundleData ?? []).map((b) => {
        const raw = b as unknown as AssetBundle & {
          catalog_item: { id: string; name: string; category: string } | null
        }
        return {
          ...raw,
          member_count: memberCounts[raw.id] ?? 0,
        }
      })

      setBundles(rows)
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id, search, activeFilter])

  useEffect(() => {
    const t = setTimeout(fetchBundles, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchBundles, search])

  const totalBundles   = bundles.length
  const activeBundles  = bundles.filter((b) => b.is_active).length
  const totalMembers   = bundles.reduce((a, b) => a + b.member_count, 0)

  const columns = [
    {
      key: 'bundle_code', label: 'Bundle Code', sortable: true,
      render: (row: BundleRow) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <QrCode className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-mono font-medium text-foreground">{row.bundle_code}</p>
            <p className="text-xs text-muted-foreground">{row.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'catalog_item', label: 'Catalog Item',
      render: (row: BundleRow) => {
        if (!row.catalog_item) return <span className="text-xs text-muted-foreground">Mixed / Not set</span>
        const cat = INVENTORY_CATEGORIES.find((c) => c.value === row.catalog_item?.category)
        return (
          <div className="flex items-center gap-1.5">
            <span>{cat?.icon ?? '📦'}</span>
            <span className="text-sm text-foreground">{row.catalog_item.name}</span>
          </div>
        )
      },
    },
    {
      key: 'member_count', label: 'Assets', align: 'right' as const,
      render: (row: BundleRow) => (
        <span className={`text-sm font-medium ${row.member_count === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
          {row.member_count}
        </span>
      ),
    },
    {
      key: 'qr_code_value', label: 'QR Value',
      render: (row: BundleRow) => (
        <span className="font-mono text-xs text-muted-foreground">{row.qr_code_value ?? row.bundle_code}</span>
      ),
    },
    {
      key: 'qr_action', label: '',
      align: 'right' as const,
      render: (row: BundleRow) => (
        <button
          title="Print QR label"
          onClick={(e) => { e.stopPropagation(); setQrBundle(row); setQrOpen(true) }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <QrCode className="w-4 h-4" />
        </button>
      ),
    },
    {
      key: 'is_active', label: 'Status',
      render: (row: BundleRow) => (
        row.is_active
          ? <span className="badge text-xs bg-emerald-100 text-emerald-700">Active</span>
          : <span className="badge text-xs bg-muted text-muted-foreground">Inactive</span>
      ),
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Asset Bundles"
        subtitle="Carts, pallets, and sets of serialized assets"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/assets/scan')} className="btn-secondary">
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Scanner</span>
            </button>
            {isAdmin(appRole) && (
              <button onClick={() => navigate('/assets/bundles/new')} className="btn-primary">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Bundle</span>
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Bundles"
          value={loading ? '—' : totalBundles}
          icon={<Boxes className="w-5 h-5 text-indigo-600" />}
          iconBg="bg-indigo-50"
        />
        <StatCard
          label="Active Bundles"
          value={loading ? '—' : activeBundles}
          icon={<Boxes className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          colorClass="text-emerald-700"
        />
        <StatCard
          label="Total Assets in Bundles"
          value={loading ? '—' : totalMembers}
          icon={<QrCode className="w-5 h-5 text-violet-600" />}
          iconBg="bg-violet-50"
          colorClass="text-violet-700"
        />
      </div>

      <TableCard>
        <TableToolbar>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search bundles…"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="search-input pl-9"
            />
          </div>
          <div className="flex items-center gap-1 ml-2">
            {(['active', 'inactive', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">{bundles.length} shown</p>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={bundles}
          keyField="id"
          onRowClick={(row) => navigate(`/assets/bundles/${(row as BundleRow).id}`)}
          loading={loading}
          emptyTitle="No bundles found"
          emptyDescription={
            search ? 'Try a different search term.' :
            activeFilter === 'inactive' ? 'No inactive bundles.' :
            'Create your first bundle to start tracking grouped assets.'
          }
        />
      </TableCard>

      {!loading && bundles.length === 0 && !search && activeFilter === 'active' && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Boxes className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No asset bundles yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs text-center">
            Create bundles to group chairs, tables, or tent pieces into carts or pallets.
            One QR scan checks out all assets at once.
          </p>
          {isAdmin(appRole) && (
            <button onClick={() => navigate('/assets/bundles/new')} className="btn-primary">
              <Plus className="w-4 h-4" /> Create First Bundle
            </button>
          )}
        </div>
      )}

      {/* QR Label Modal — shared across all rows; opens without page navigation */}
      {qrBundle && (
        <QRLabelModal
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          bundle={qrBundle}
          companyName={profile?.companies?.name ?? 'Rentora'}
        />
      )}
    </PageShell>
  )
}

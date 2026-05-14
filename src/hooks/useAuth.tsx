import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Company, AppRole } from '@/types/database'
import { toAppRole } from '@/lib/roles'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: (Profile & { companies: Company }) | null
  /** Normalised 3-role value — safe to use anywhere without null-checks on profile. */
  appRole: AppRole
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<(Profile & { companies: Company }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Prevent double-fetch from getSession + onAuthStateChange both firing
  const fetchingRef = useRef(false)
  // Timeout ref so we can clear it
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Safety timeout — if loading hasn't resolved in 10s, show an error
  function startLoadingTimeout() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (fetchingRef.current) {
        console.error('[useAuth] Profile fetch timed out after 10s')
        setError('Loading timed out. Check your Supabase connection and RLS policies.')
        setLoading(false)
        fetchingRef.current = false
      }
    }, 10000)
  }

  function clearLoadingTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(() => {
    // Use ONLY onAuthStateChange — it fires with INITIAL_SESSION immediately on mount,
    // handling both the logged-in and logged-out cases without a separate getSession call.
    // This eliminates the double-fetch race condition.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session) => {
        setSession(session)
        if (session?.user) {
          // TOKEN_REFRESHED and USER_UPDATED are silent background events — the user is
          // already authenticated. Do NOT set loading=true for these or ProtectedRoute
          // will unmount the entire page, destroying all modal and form state.
          const silent = event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED'
          fetchProfile(session.user, event, silent)
        } else {
          setProfile(null)
          setError(null)
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      clearLoadingTimeout()
    }
  }, [])

  async function fetchProfile(user: User, event: AuthChangeEvent, silent = false) {
    const userId = user.id
    // Prevent concurrent fetches
    if (fetchingRef.current) return
    fetchingRef.current = true
    // Silent refreshes (TOKEN_REFRESHED, USER_UPDATED) must not show the loading screen —
    // that would unmount the entire page and destroy all open modal and form state.
    if (!silent) setLoading(true)
    setError(null)
    startLoadingTimeout()

    try {
      console.log('[useAuth] Fetching profile for user:', userId)

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          company_id,
          email,
          full_name,
          phone,
          avatar_url,
          role,
          is_active,
          last_seen_at,
          created_at,
          updated_at,
          companies (
            id,
            name,
            slug,
            email,
            phone,
            address,
            city,
            state,
            zip,
            country,
            logo_url,
            timezone,
            currency,
            tax_rate,
            default_rental_days,
            active,
            created_at,
            updated_at
          )
        `)
        .eq('id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = "no rows returned" — handled below as missing profile
        console.error('[useAuth] Profile query error:', error.message, error.details, error.hint)
        setError(`Profile not found: ${error.message}. Make sure a profiles row exists for this user in Supabase.`)
        setProfile(null)
      } else if (!data) {
        // Profile row doesn't exist yet — attempt auto-provision on first sign-in
        if (event === 'SIGNED_IN') {
          console.log('[useAuth] No profile found — attempting auto-provision for:', userId)
          const provisioned = await autoProvisionProfile(user)
          if (provisioned) {
            // Fetch again now that the row exists
            const { data: data2 } = await supabase
              .from('profiles')
              .select(`
                id, company_id, email, full_name, phone, avatar_url,
                role, is_active, last_seen_at, created_at, updated_at,
                companies (
                  id, name, slug, email, phone, address, city, state,
                  zip, country, logo_url, timezone, currency, tax_rate,
                  default_rental_days, active, created_at, updated_at
                )
              `)
              .eq('id', userId)
              .single()
            if (data2) {
              console.log('[useAuth] Auto-provisioned profile loaded for:', userId)
              setProfile(data2 as unknown as Profile & { companies: Company })
              setError(null)
              return
            }
          }
          setError(
            'No profile found for this user. If you just signed up, run the auto-profile SQL migration ' +
            '(supabase/migrations/20260514_auto_profile_trigger.sql) in your Supabase SQL Editor.'
          )
        } else {
          setError('No profile found for this user. Insert a row into the profiles table in Supabase.')
        }
        console.error('[useAuth] Profile query returned no data for user:', userId)
        setProfile(null)
      } else {
        console.log('[useAuth] Profile loaded:', data.email, '| Role:', data.role, '| Company:', (data.companies as unknown as Company | null)?.name)
        setProfile(data as unknown as Profile & { companies: Company })
        setError(null)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[useAuth] Unexpected error fetching profile:', msg)
      setError(`Unexpected error: ${msg}`)
      setProfile(null)
    } finally {
      clearLoadingTimeout()
      setLoading(false)
      fetchingRef.current = false
    }
  }

  async function autoProvisionProfile(user: User): Promise<boolean> {
    try {
      // Prefer company_id embedded in invite metadata (set during server-side invite)
      const metaCompanyId = user.user_metadata?.company_id as string | undefined
      let companyId = metaCompanyId

      if (!companyId) {
        // Fallback: single-tenant — use the first active company
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('active', true)
          .limit(1)
          .single()
        companyId = company?.id
      }

      if (!companyId) return false

      const { error } = await supabase.from('profiles').upsert({
        id:         user.id,
        company_id: companyId,
        email:      user.email ?? '',
        full_name:  (user.user_metadata?.full_name as string) ?? null,
        role:       'staff',
        is_active:  true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

      if (error) {
        console.error('[useAuth] Auto-provision failed:', error.message)
        return false
      }
      return true
    } catch {
      return false
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      appRole: toAppRole(profile?.role),
      loading,
      error,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, IdCard, Link2, LogOut, MoreHorizontal, Pencil, Plus, Trash2, UserPlus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton } from '@/components/ui/display'
import { Field, FormError, FormGrid, Select, SelectField, TextField, TextareaField, formValues } from '@/components/ui/form'
import { Menu, MenuItem, Sheet, Tabs, useConfirm, useToast } from '@/components/ui/overlay'
import { TransactionSheet } from '@/components/forms/other-forms'
import { RoleBadge } from '@/components/shell'
import { api, useMembers, useSave, useStaff } from '@/lib/queries'
import { getData } from '@/lib/api'
import { EMPLOYMENT_TYPES, ROLE_META } from '@/lib/constants'
import { fmtDate, fmtMoney, fmtRelative, initials } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { Invite, Role, StaffMember } from '@/lib/types'

type Tab = 'members' | 'staff'

export default function TeamPage() {
  const { can, user, role, currency } = useSession()
  const { data: members, isLoading } = useMembers()
  const { data: staff } = useStaff()
  const invites = useQuery({ queryKey: ['members', 'invites'], queryFn: () => getData<Invite[]>('/api/farm/invites'), enabled: can('manager') })
  const confirm = useConfirm()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('members')
  const [sheet, setSheet] = useState<null | { kind: 'invite' } | { kind: 'staff'; item?: StaffMember } | { kind: 'pay'; staff: StaffMember }>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const setRole = useSave(({ userId, role }: { userId: number; role: Role }) => api.put(`/api/farm/members/${userId}`, { role }), { invalidate: ['members', 'me'], success: 'Role updated' })
  const removeMember = useSave((userId: number) => api.del(`/api/farm/members/${userId}`), { invalidate: ['members'], success: 'Removed' })
  const revoke = useSave((id: number) => api.del(`/api/farm/invites/${id}`), { invalidate: ['members'], success: 'Invite revoked' })
  const delStaff = useSave((id: number) => api.del(`/api/staff/${id}`), { invalidate: ['staff'], success: 'Staff record deleted' })

  if (isLoading || !members) return <PageSkeleton />
  const canManage = (target: Role) => role === 'owner' || (role === 'manager' && (target === 'worker' || target === 'viewer'))
  const assignable: Role[] = role === 'owner' ? ['owner', 'manager', 'worker', 'viewer'] : ['worker', 'viewer']
  const linkFor = (code: string) => `${window.location.origin}/join?code=${code}`

  const copy = async (inv: Invite) => {
    try {
      await navigator.clipboard.writeText(linkFor(inv.code))
      setCopied(inv.id)
      toast('Invite link copied')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Copy this invite link:', linkFor(inv.code))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Everyone who can sign in to this farm, and your staff records."
        actions={<>
          {can('manager') && tab === 'staff' && <Button variant="secondary" onClick={() => setSheet({ kind: 'staff' })}><Plus />Add staff record</Button>}
          {can('manager') && <Button onClick={() => setSheet({ kind: 'invite' })}><UserPlus />Invite someone</Button>}
        </>} />

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'members', label: 'People with access', count: members.length }, { value: 'staff', label: 'Staff records', count: staff?.length ?? null }]} />

      {tab === 'members' && (
        <>
          <Card>
            <ul className="divide-y divide-stone-100">
              {members.map((m) => (
                <li key={m.userId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={initials(m.name, m.email)} src={m.avatarUrl} size={40} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-900">{m.name || m.email}{m.userId === user?.id && <span className="ml-2 text-xs font-normal text-stone-400">(you)</span>}</p>
                      <p className="truncate text-xs text-stone-500">{m.email} · {m.lastLoginAt ? `active ${fmtRelative(m.lastLoginAt)}` : 'never signed in'}{m.expiresAt ? ` · access until ${fmtDate(m.expiresAt)}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.userId !== user?.id && can('manager') && canManage(m.role) ? (
                      <Select value={m.role} onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as Role })} className="w-36" aria-label={`Role for ${m.name || m.email}`}>
                        {assignable.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
                      </Select>
                    ) : <RoleBadge role={m.role} />}
                    {m.userId === user?.id ? (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (await confirm({ title: 'Leave this farm?', description: 'You will lose access until someone invites you again.', confirmLabel: 'Leave farm', danger: true })) {
                          removeMember.mutate(m.userId, { onSuccess: () => { window.location.href = '/onboarding' } })
                        }
                      }}><LogOut />Leave</Button>
                    ) : can('manager') && canManage(m.role) && (
                      <Button size="sm" variant="danger-ghost" onClick={async () => {
                        if (await confirm({ title: `Remove ${m.name || m.email}?`, description: 'They will immediately lose access to this farm.', confirmLabel: 'Remove', danger: true })) removeMember.mutate(m.userId)
                      }} aria-label="Remove member"><Trash2 /></Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {can('manager') && (
            <Card>
              <CardHeader title="Open invite links" description="Anyone with a link can join with the role shown, until it expires or is used up." icon={Link2} />
              {(invites.data || []).length === 0 ? <p className="px-5 pb-6 pt-3 text-sm text-stone-500">No open invites.</p> : (
                <ul className="mt-3 divide-y divide-stone-100">
                  {invites.data!.map((inv) => (
                    <li key={inv.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><RoleBadge role={inv.role} />{inv.email && <span className="text-sm text-stone-700">{inv.email}</span>}{inv.note && <span className="text-sm text-stone-500">{inv.note}</span>}</div>
                        <p className="mt-1 text-xs text-stone-400">
                          {inv.maxUses ? `${inv.usedCount}/${inv.maxUses} used` : `${inv.usedCount} joined`} · link expires {fmtDate(inv.expiresAt)}{inv.accessDays ? ` · access for ${inv.accessDays} days` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => copy(inv)}>{copied === inv.id ? <Check /> : <Copy />}{copied === inv.id ? 'Copied' : 'Copy link'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => revoke.mutate(inv.id)}>Revoke</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold text-stone-900">What each role can do</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(ROLE_META) as Role[]).map((r) => (
                <div key={r} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200/70"><RoleBadge role={r} /><p className="mt-2 text-xs leading-relaxed text-stone-600">{ROLE_META[r].description}</p></div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'staff' && (
        <Card>
          {!staff?.length ? (
            <EmptyState icon={IdCard} title="No staff records" description="Keep contact details, contracts and pay for employees and contractors, with or without a login."
              action={can('manager') && <Button onClick={() => setSheet({ kind: 'staff' })}><Plus />Add staff record</Button>} />
          ) : (
            <ul className="divide-y divide-stone-100">
              {staff.map((s) => {
                const member = members.find((m) => m.userId === s.userId)
                return (
                  <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={initials(s.name)} src={member?.avatarUrl} size={40} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-stone-900">{s.name} {s.endDate && <Badge className="ml-1">Left {fmtDate(s.endDate)}</Badge>}</p>
                        <p className="truncate text-xs text-stone-500">{[s.jobTitle, EMPLOYMENT_TYPES.find((e) => e.value === s.employmentType)?.label, s.phone, s.email].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {member && <RoleBadge role={member.role} />}
                      {can('manager') && s.payRate != null && <span className="text-sm text-stone-600 tabular">{fmtMoney(s.payRate, currency)}/{s.payUnit}</span>}
                      {can('manager') && (
                        <Menu trigger={<button className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100" aria-label="Staff actions"><MoreHorizontal className="size-4" /></button>}>
                          <MenuItem icon={Wallet} onClick={() => setSheet({ kind: 'pay', staff: s })}>Record a payment</MenuItem>
                          <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'staff', item: s })}>Edit</MenuItem>
                          <MenuItem icon={Trash2} danger onClick={async () => { if (await confirm({ title: `Delete ${s.name}'s record?`, description: 'Payments already recorded stay in your finances.', confirmLabel: 'Delete', danger: true })) delStaff.mutate(s.id) }}>Delete</MenuItem>
                        </Menu>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {sheet?.kind === 'invite' && <InviteSheet onClose={() => setSheet(null)} assignable={assignable} onCreated={(inv) => { copy(inv); setSheet(null) }} />}
      {sheet?.kind === 'staff' && <StaffSheet onClose={() => setSheet(null)} item={sheet.item} />}
      {sheet?.kind === 'pay' && <TransactionSheet open onClose={() => setSheet(null)} defaultType="expense" preset={{ type: 'expense', category: 'wages', staffId: sheet.staff.id, counterparty: sheet.staff.name, description: `Wages: ${sheet.staff.name}` }} />}
    </div>
  )
}

function InviteSheet({ onClose, assignable, onCreated }: { onClose: () => void; assignable: Role[]; onCreated: (i: Invite) => void }) {
  const [role, setRole] = useState<Role>('worker')
  const [error, setError] = useState<string | null>(null)
  const save = useSave((b: any) => api.post<{ data: Invite }>('/api/farm/invites', b), { invalidate: ['members'], silentError: true, onSuccess: (r) => onCreated(r.data) })
  return (
    <Sheet open onClose={onClose} title="Invite someone" description="We’ll create a link to send by text, email or WhatsApp. They sign in with Google to join."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="invite-form" loading={save.isPending}>Create & copy link</Button></>}>
      <form id="invite-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        const v = formValues(e.currentTarget)
        save.mutate({ role, email: v.email, note: v.note, accessDays: v.accessDays ?? null, linkValidDays: v.linkValidDays ?? 14 }, { onError: (err) => setError(err.message) })
      }}>
        <Field label="Role">
          <div className="space-y-2">
            {assignable.map((r) => (
              <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition ${role === r ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-stone-200 hover:ring-stone-300'}`}>
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5 text-brand-700 focus:ring-brand-500" />
                <span><span className="block text-sm font-medium text-stone-900">{ROLE_META[r].label}</span><span className="block text-xs text-stone-500">{ROLE_META[r].description}</span></span>
              </label>
            ))}
          </div>
        </Field>
        <TextField label="Their email (optional)" name="email" type="email" hint="Locks the link to this Google account and makes it single-use" />
        <TextField label="Note" name="note" placeholder="e.g. Relief stockman" />
        <FormGrid>
          <SelectField label="Access lasts" name="accessDays" data-number defaultValue="" placeholder="Until removed" options={[{ value: 7, label: '1 week' }, { value: 30, label: '30 days' }, { value: 90, label: '3 months' }, { value: 365, label: '1 year' }]} />
          <SelectField label="Link valid for" name="linkValidDays" data-number defaultValue={14} options={[{ value: 1, label: '1 day' }, { value: 7, label: '7 days' }, { value: 14, label: '14 days' }, { value: 30, label: '30 days' }]} />
        </FormGrid>
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

function StaffSheet({ onClose, item }: { onClose: () => void; item?: StaffMember }) {
  const { data: members = [] } = useMembers()
  const { currency } = useSession()
  const [error, setError] = useState<string | null>(null)
  const save = useSave((b: any) => item ? api.put(`/api/staff/${item.id}`, b) : api.post('/api/staff', b), { invalidate: ['staff'], success: 'Saved', silentError: true, onSuccess: onClose })
  return (
    <Sheet open onClose={onClose} wide title={item ? `Edit ${item.name}` : 'Add staff record'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="staff-form" loading={save.isPending}>Save</Button></>}>
      <form id="staff-form" className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(formValues(e.currentTarget), { onError: (err) => setError(err.message) }) }}>
        <FormGrid>
          <TextField label="Name" name="name" required defaultValue={item?.name} />
          <TextField label="Job title" name="jobTitle" defaultValue={item?.jobTitle ?? ''} placeholder="e.g. Stockperson" />
          <TextField label="Phone" name="phone" type="tel" defaultValue={item?.phone ?? ''} />
          <TextField label="Email" name="email" type="email" defaultValue={item?.email ?? ''} />
          <SelectField label="Employment" name="employmentType" defaultValue={item?.employmentType ?? 'full_time'} options={EMPLOYMENT_TYPES} />
          <SelectField label="Linked login" name="userId" data-number defaultValue={item?.userId ?? ''} placeholder="No login" options={members.map((m) => ({ value: m.userId, label: m.name || m.email }))} />
          <TextField label="Pay rate" name="payRate" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} defaultValue={item?.payRate ?? ''} />
          <SelectField label="Per" name="payUnit" defaultValue={item?.payUnit ?? 'hour'} options={[{ value: 'hour', label: 'Hour' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
          <TextField label="Start date" name="startDate" type="date" defaultValue={item?.startDate ?? ''} />
          <TextField label="End date" name="endDate" type="date" defaultValue={item?.endDate ?? ''} />
        </FormGrid>
        <TextField label="Emergency contact" name="emergencyContact" defaultValue={item?.emergencyContact ?? ''} />
        <TextareaField label="Notes" name="notes" defaultValue={item?.notes ?? ''} placeholder="Certificates, training, holidays…" />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}


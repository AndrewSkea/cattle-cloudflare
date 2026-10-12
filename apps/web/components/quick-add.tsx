'use client'

import { Baby, ClipboardList, HeartPulse, Landmark, PawPrint, Sprout, TrendingUp, Wallet } from 'lucide-react'
import { MenuItem } from './ui/overlay'
import { AnimalSheet, BirthSheet, BreedingSheet, HealthSheet, WeightSheet } from './forms/livestock-forms'
import { TaskSheet, TransactionSheet } from './forms/other-forms'
import { useSession } from '@/lib/session'

export type QuickAddKind = null | 'animal' | 'health' | 'birth' | 'breeding' | 'weight' | 'task' | 'income' | 'expense'

/** The "Quick add" menu entries, shared by the dashboard button and the phone bottom bar. */
export function QuickAddItems({ onPick }: { onPick: (k: Exclude<QuickAddKind, null>) => void }) {
  const { can, shows } = useSession()
  return (
    <>
      <MenuItem icon={PawPrint} onClick={() => onPick('animal')}>Animal</MenuItem>
      <MenuItem icon={Baby} onClick={() => onPick('birth')}>Birth</MenuItem>
      <MenuItem icon={Sprout} onClick={() => onPick('breeding')}>Service or scan</MenuItem>
      {shows('health') && <MenuItem icon={HeartPulse} onClick={() => onPick('health')}>Health record</MenuItem>}
      <MenuItem icon={TrendingUp} onClick={() => onPick('weight')}>Weight</MenuItem>
      {shows('tasks') && <MenuItem icon={ClipboardList} onClick={() => onPick('task')}>Task</MenuItem>}
      {can('manager') && shows('finance') && <MenuItem icon={Wallet} onClick={() => onPick('expense')}>Expense</MenuItem>}
      {can('manager') && shows('finance') && <MenuItem icon={Landmark} onClick={() => onPick('income')}>Income</MenuItem>}
    </>
  )
}

export function QuickAddSheets({ sheet, onClose }: { sheet: QuickAddKind; onClose: () => void }) {
  return (
    <>
      {sheet === 'animal' && <AnimalSheet open onClose={onClose} />}
      {sheet === 'health' && <HealthSheet open onClose={onClose} />}
      {sheet === 'birth' && <BirthSheet open onClose={onClose} />}
      {sheet === 'breeding' && <BreedingSheet open onClose={onClose} />}
      {sheet === 'weight' && <WeightSheet open onClose={onClose} />}
      {sheet === 'task' && <TaskSheet open onClose={onClose} />}
      {(sheet === 'income' || sheet === 'expense') && <TransactionSheet open onClose={onClose} defaultType={sheet} />}
    </>
  )
}

'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface LogCostModalProps {
  open: boolean;
  onClose: () => void;
  animals: Array<{ id: number; tagNo: string; managementTag?: string | null }>;
  onSuccess: () => void;
}

export function LogCostModal({ open, onClose, animals, onSuccess }: LogCostModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const perHead = amount && animals.length > 0
    ? (parseFloat(amount) / animals.length).toFixed(2)
    : '0.00';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !description || !date) return;

    setSaving(true);
    setError('');
    try {
      await apiClient.allocateCost({
        amount: parseFloat(amount),
        description,
        date,
        groupType: 'custom',
        cattleIds: animals.map(a => a.id),
      });
      onSuccess();
      onClose();
      setAmount('');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
    } catch (err: any) {
      setError(err.message || 'Failed to allocate cost');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Log Cost</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Split cost evenly across {animals.length} animal{animals.length !== 1 ? 's' : ''} ({'\u00A3'}{perHead} per head)
        </p>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount ({'\u00A3'})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. Winter feed supplement"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              required
            />
          </div>

          {animals.length <= 10 && (
            <div className="text-xs text-gray-400">
              {animals.map(a => a.managementTag || a.tagNo).join(', ')}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !amount || !description}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Allocate Cost'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

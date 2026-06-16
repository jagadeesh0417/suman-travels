'use client';

import { useEffect, useState } from 'react';

interface DateRecord {
  id: number;
  date: string;
  created_at: string;
}

export default function AdminDates() {
  const [dates, setDates] = useState<DateRecord[]>([]);
  const [newDate, setNewDate] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');

  const loadDates = () => {
    fetch('/api/dates')
      .then((r) => r.json())
      .then(setDates);
  };

  useEffect(loadDates, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) return;

    const res = await fetch('/api/dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newDate }),
    });

    if (res.ok) {
      setNewDate('');
      loadDates();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to create date');
    }
  };

  const handleUpdate = async (id: number) => {
    const res = await fetch('/api/dates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, date: editDate }),
    });

    if (res.ok) {
      setEditId(null);
      setEditDate('');
      loadDates();
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this date and all associated slots?')) return;

    const res = await fetch(`/api/dates?id=${id}`, { method: 'DELETE' });
    if (res.ok) loadDates();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">Manage Dates</h1>

      <form onSubmit={handleCreate} className="glass-card p-6 mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Add New Date
        </label>
        <div className="flex gap-3">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="input-field flex-1"
            required
          />
          <button type="submit" className="btn-primary">
            Add Date
          </button>
        </div>
      </form>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-4 text-sm font-semibold text-gray-700">Date</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-700">Day</th>
                <th className="text-right p-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dates.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500">
                    No dates created yet
                  </td>
                </tr>
              )}
              {dates.map((d) => (
                <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="p-4">
                    {editId === d.id ? (
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="input-field"
                      />
                    ) : (
                      <span className="font-medium text-gray-900">
                        {new Date(d.date).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-gray-500">
                    {new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long' })}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      {editId === d.id ? (
                        <>
                          <button
                            onClick={() => handleUpdate(d.id)}
                            className="px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditId(d.id); setEditDate(d.date); }}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(d.id)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

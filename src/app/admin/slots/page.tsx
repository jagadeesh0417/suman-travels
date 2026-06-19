'use client';

import { useEffect, useState, useCallback } from 'react';
import { EXAM_TIMINGS } from '@/lib/slots';

interface SlotRecord {
  id: number;
  date_id: number;
  time: string;
  enabled: number;
  vehicle_time: string;
  date?: string;
}

export default function AdminSlots() {
  const [slots, setSlots] = useState<SlotRecord[]>([]);
  const [vehicleTimes, setVehicleTimes] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(() => {
    fetch('/api/slots')
      .then((r) => r.json())
      .then((data: SlotRecord[]) => {
        setSlots(data);
        const map: Record<number, string> = {};
        data.forEach((s) => { map[s.id] = s.vehicle_time || ''; });
        setVehicleTimes(map);
      });
  }, []);

  useEffect(loadData, [loadData]);

  const handleToggle = async (id: number, current: number) => {
    await fetch('/api/slots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: current ? 0 : 1 }),
    });
    loadData();
  };

  const handleVehicleTimeSave = async (id: number) => {
    await fetch('/api/slots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, vehicle_time: vehicleTimes[id] || '' }),
    });
    loadData();
  };

  const grouped = slots.reduce((acc, s) => {
    const key = s.date || String(s.date_id);
    if (!acc[key]) acc[key] = { date: s.date, date_id: s.date_id, slots: [] };
    acc[key].slots.push(s);
    return acc;
  }, {} as Record<string, { date?: string; date_id: number; slots: SlotRecord[] }>);

  const sorted = Object.values(grouped).sort((a, b) =>
    (a.date || '').localeCompare(b.date || '')
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">Exam Slots</h1>
      <p className="text-gray-500 mb-6">
        Fixed exam timings — slots are automatically created when you add a date.
        Set the vehicle start time for each slot.
      </p>

      <button
        onClick={async () => {
          setGenerating(true);
          try {
            await fetch('/api/slots/generate-missing', { method: 'POST' });
            loadData();
          } catch {}
          setGenerating(false);
        }}
        disabled={generating}
        className="btn-primary mb-6"
      >
        {generating ? 'Generating...' : 'Generate Missing Slots for All Dates'}
      </button>

      {sorted.length === 0 && !generating && (
        <div className="glass-card p-12 text-center">
          <p className="text-gray-500">No dates created yet. Add a date from the Dates page to auto-create slots.</p>
        </div>
      )}

      {sorted.map((group) => (
        <div key={group.date_id} className="glass-card mb-4 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <h2 className="font-bold text-[#1e3a5f]">
              {group.date
                ? new Date(group.date).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : `Date #${group.date_id}`}
            </h2>
          </div>
          <div className="p-4 space-y-2">
            {EXAM_TIMINGS.map((timing) => {
              const slot = group.slots.find((s) => s.time === timing.value);
              return (
                <div
                  key={timing.value}
                  className="flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors flex-wrap"
                >
                  <div className="flex items-center gap-3 min-w-[180px]">
                    <span className="text-sm font-medium text-gray-500 w-16">
                      {timing.label.split(' – ')[0]}
                    </span>
                    <span className="font-semibold text-gray-900">{timing.label.split(' – ')[1]}</span>
                  </div>

                  {slot && (
                    <>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 whitespace-nowrap">Vehicle</label>
                        <input
                          type="time"
                          value={vehicleTimes[slot.id] ?? ''}
                          onChange={(e) =>
                            setVehicleTimes((prev) => ({ ...prev, [slot.id]: e.target.value }))
                          }
                          className="input-field !py-1.5 !text-sm !w-32"
                        />
                        <button
                          onClick={() => handleVehicleTimeSave(slot.id)}
                          className="px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                        >
                          Save
                        </button>
                      </div>

                      <button
                        onClick={() => handleToggle(slot.id, slot.enabled)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ml-auto ${
                          slot.enabled
                            ? 'bg-green-50 text-green-600 hover:bg-green-100'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      >
                        {slot.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

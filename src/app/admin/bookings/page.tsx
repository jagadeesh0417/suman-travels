'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { slotLabel } from '@/lib/slots';

interface BookingRecord {
  booking_id: string;
  date: string;
  time: string;
  passenger_count: number;
  amount: number;
  payment_status: string;
  utr_number: string;
  created_at: string;
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadBookings = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    fetch(`/api/bookings?${params.toString()}`)
      .then((r) => r.json())
      .then(setBookings);
  };

  useEffect(loadBookings, [search, statusFilter]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Bookings</h1>
        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or date..."
            className="input-field max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-field max-w-[140px]"
          >
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-4 text-sm font-semibold text-gray-700">Booking ID</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-700">Date</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-700">Time</th>
                <th className="text-center p-4 text-sm font-semibold text-gray-700">Passengers</th>
                <th className="text-right p-4 text-sm font-semibold text-gray-700">Amount</th>
                <th className="text-center p-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-700">UTR</th>
                <th className="text-right p-4 text-sm font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    No bookings found
                  </td>
                </tr>
              )}
              {bookings.map((b) => (
                <tr key={b.booking_id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="p-4">
                    <span className="font-mono font-medium text-[#1e3a5f] text-sm">
                      {b.booking_id}
                    </span>
                  </td>
                  <td className="p-4 text-gray-900">
                    {new Date(b.date).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="p-4 text-gray-900">{slotLabel(b.time)}</td>
                  <td className="p-4 text-center font-medium">{b.passenger_count}</td>
                  <td className="p-4 text-right font-medium">
                    ₹{b.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        b.payment_status === 'confirmed'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {b.payment_status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="font-mono text-xs text-gray-500">
                      {b.utr_number || '-'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/admin/bookings/${b.booking_id}`}
                      className="px-3 py-1.5 bg-[#1e3a5f]/5 text-[#1e3a5f] rounded-lg text-sm font-medium hover:bg-[#1e3a5f]/10 transition-colors"
                    >
                      View
                    </Link>
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

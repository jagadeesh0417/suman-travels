'use client';

import { useEffect, useState } from 'react';

interface DocumentRecord {
  booking_id: string;
  date: string;
  time: string;
  passenger_count: number;
  amount: number;
  payment_status: string;
  created_at: string;
  has_document: boolean;
}

export default function AdminDocuments() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.json())
      .then(setDocuments);
  }, []);

  const handleDownload = async (bookingId: string) => {
    try {
      const res = await fetch(`/api/documents?download=${bookingId}`);
      if (!res.ok) throw new Error('Document not found');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookingId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Document not available');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">Documents</h1>

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
                <th className="text-right p-4 text-sm font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No confirmed bookings yet. Documents appear after successful payment.
                  </td>
                </tr>
              )}
              {documents.map((doc) => (
                <tr key={doc.booking_id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="p-4">
                    <span className="font-mono font-medium text-[#1e3a5f] text-sm">
                      {doc.booking_id}
                    </span>
                  </td>
                  <td className="p-4 text-gray-900">
                    {new Date(doc.date).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="p-4 text-gray-900">{doc.time}</td>
                  <td className="p-4 text-center font-medium">{doc.passenger_count}</td>
                  <td className="p-4 text-right font-medium">
                    ₹{doc.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-600">
                      {doc.payment_status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDownload(doc.booking_id)}
                      disabled={!doc.has_document}
                      className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download
                    </button>
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

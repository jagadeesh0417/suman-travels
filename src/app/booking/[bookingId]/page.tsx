'use client';

import { useEffect, useState, use, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface BookingStatus {
  status: string;
  booking_id: string;
  serial_number?: number;
  message?: string;
}

async function fireEvent(bookingId: string, event: string, detail?: string) {
  try {
    await fetch('/api/debug/checkout-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, event, detail }),
    });
  } catch {}
}

export default function BookingStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ t: string }>;
}) {
  const { bookingId } = use(params);
  const { t: token } = use(searchParams);
  const router = useRouter();
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [polling, setPolling] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status?t=${token}`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 404) {
          setPolling(false);
          clearInterval(pollingRef.current);
        }
        return;
      }
      const data: BookingStatus = await res.json();
      setStatus(data);

      if (data.status === 'confirmed') {
        setPolling(false);
        clearInterval(pollingRef.current);
        fireEvent(bookingId, 'status_confirmed', `serial=${data.serial_number}`);
      } else if (data.status === 'paid_detected') {
        // Payment detected but not yet confirmed by webhook — keep polling
        fireEvent(bookingId, 'paid_detected', '');
      }
    } catch {}
  }, [bookingId, token]);

  useEffect(() => {
    fireEvent(bookingId, 'status_page_loaded', `token_present=${!!token}`);

    if (!token) {
      router.replace('/');
      return;
    }

    checkStatus();

    // Aggressive polling: every 2s for first 20s, then every 5s to 120s ceiling
    let fastPolls = 0;
    pollingRef.current = setInterval(async () => {
      fastPolls++;
      if (fastPolls > 10) {
        clearInterval(pollingRef.current);
        // Switch to 5s polling
        pollingRef.current = setInterval(checkStatus, 5000);
        // Stop after 120s total
        setTimeout(() => {
          clearInterval(pollingRef.current);
          setPolling(false);
        }, 120000 - 20000);
      }
      await checkStatus();
    }, 2000);

    return () => {
      clearInterval(pollingRef.current);
    };
  }, [bookingId, token, checkStatus, router]);

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/receipt?t=${token}`, { cache: 'no-store' });
      if (res.status === 409) {
        // Still pending, resume polling
        fireEvent(bookingId, 'download_attempt_pending', '');
        return;
      }
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${bookingId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      fireEvent(bookingId, 'receipt_downloaded', '');
    } catch {
      fireEvent(bookingId, 'download_error', '');
    }
  };

  const isConfirmed = status?.status === 'confirmed';

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f]">Booking Status</h1>
          <p className="text-gray-500 mt-2">Booking ID: <span className="font-mono font-medium">{bookingId}</span></p>
        </div>

        <div className="glass-card p-8 text-center">
          {isConfirmed ? (
            <>
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#1e3a5f] mb-2">Booking Confirmed!</h2>
              {status?.serial_number && (
                <p className="text-sm text-gray-500 mb-4">Serial No: <span className="font-bold text-[#1e3a5f]">{status.serial_number}</span></p>
              )}
              <p className="text-gray-500 mb-6">Your booking has been confirmed. You can now download your receipt.</p>

              <button onClick={handleDownload} className="btn-primary w-full justify-center mb-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Receipt (Word)
              </button>

              <Link href="/" className="btn-outline w-full justify-center">
                Return Home
              </Link>
            </>
          ) : polling ? (
            <>
              <div className="w-16 h-16 mx-auto mb-4">
                <div className="w-10 h-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
              <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Confirming your booking…</h2>
              <p className="text-xs text-gray-400">{bookingId}</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center">
                <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Payment received</h2>
              <p className="text-gray-500 mb-4">
                We're confirming your booking. Call <a href="tel:+919010532226" className="text-[#1e3a5f] font-medium">+91 9010532226</a> if you need help.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
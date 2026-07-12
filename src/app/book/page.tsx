import { Suspense } from 'react';
import BookPageClient from './client';

export default function BookPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <BookPageClient />
    </Suspense>
  );
}

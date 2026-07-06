import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="h-screen overflow-hidden bg-[#f6f4ee] text-emerald-950 lg:flex">
      <Sidebar />

      <main className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex h-full w-full flex-col gap-6 overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-white p-4 shadow-sm shadow-emerald-950/5 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

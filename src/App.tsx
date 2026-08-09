import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const CreateEvent = lazy(() => import("./pages/CreateEvent"));
const EventCreated = lazy(() => import("./pages/EventCreated"));
const EventPage = lazy(() => import("./pages/EventPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const MyEventsPage = lazy(() => import("./pages/MyEventsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageFallback = () => (
  <main className="min-h-[100dvh] bg-background" aria-busy="true" aria-label="Loading page">
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-5 h-12 w-2/3" />
      <Skeleton className="mt-5 h-5 w-1/2" />
      <Skeleton className="mt-10 h-72 w-full rounded-lg" />
    </div>
  </main>
);

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/create" element={<CreateEvent />} />
          <Route path="/created" element={<EventCreated />} />
          <Route path="/my-events" element={<MyEventsPage />} />
          <Route path="/event/:id" element={<EventPage />} />
          <Route path="/admin/:id" element={<AdminPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;

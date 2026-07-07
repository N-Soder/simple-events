import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import CreateEvent from "./pages/CreateEvent";
import EventCreated from "./pages/EventCreated";
import EventPage from "./pages/EventPage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/create" element={<CreateEvent />} />
        <Route path="/created" element={<EventCreated />} />
        <Route path="/event/:id" element={<EventPage />} />
        <Route path="/admin/:id" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;

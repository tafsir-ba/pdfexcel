import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Wizard from "@/pages/Wizard";
import Pricing from "@/pages/Pricing";
import Faq from "@/pages/Faq";

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
};

const Layout = ({ children, withFooter = true }) => (
  <div className="min-h-screen bg-canvas bg-grain">
    <Navbar />
    <main>{children}</main>
    {withFooter && <Footer />}
  </div>
);

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Layout><Landing /></Layout>} />
          <Route path="/app" element={<Layout><Wizard /></Layout>} />
          <Route path="/pricing" element={<Layout><Pricing /></Layout>} />
          <Route path="/faq" element={<Layout><Faq /></Layout>} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;

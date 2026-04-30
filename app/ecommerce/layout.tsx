"use client";

import React from "react";
import Footer from "@/components/ecommarce/footer";
import Header from "@/components/ecommarce/header";
import { useEffect, useState } from "react";
import FloatingCartButton from "@/components/ecommarce/FloatingCartButton";

const EcommerceLayout = ({ children }: { children: React.ReactNode }) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="min-h-full">
        <div className="min-h-screen flex flex-col">
          {/* Header placeholder to maintain layout structure */}
          <div className="h-20 bg-background border-b border-border"></div>
          <div key="layout-children-loading">
            {children}
          </div>
          {/* Footer placeholder to maintain layout structure */}
          <div className="h-96 bg-card border-t border-border"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="min-h-screen flex flex-col">
        <Header />
        <div key="layout-children">
          {React.Children.map(children, (child, index) => 
            React.isValidElement(child) ? React.cloneElement(child, { key: `child-${index}` }) : child
          )}
          <FloatingCartButton />
        </div>
        <Footer />
      </div>
    </div>
  );
};

export default EcommerceLayout;

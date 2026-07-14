"use client";

import { useEffect } from "react";

export function ClearPurchasedCart({ slug }) {
  useEffect(() => {
    window.localStorage.removeItem(`clinica_cart_${slug}`);
  }, [slug]);
  return null;
}

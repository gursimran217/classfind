"use client";

import { useEffect, useState } from "react";

/**
 * Sunset backdrop for the product pages: the generated cloud clips, looped.
 *
 * Two orientation-matched sources — 16:9 for desktop, 9:16 for phones — and only
 * one is ever mounted, so a phone never downloads the landscape file or vice
 * versa. Cream scrims at the top and bottom give the header and footer a clean
 * field; the footage itself is otherwise untouched.
 */
export default function PaperBackdrop() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const small = window.matchMedia("(max-width: 767px)").matches;
    setSrc(small ? "/film3/bg-9x16.mp4" : "/film3/bg-16x9.mp4");
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#e9d9c4]">
      {/* static stand-in, visible only until the clip mounts */}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,#f6c98a_0%,#f0a878_30%,#c98fae_62%,#7d6bb0_100%)]" />

      {src && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      )}

      {/* cream scrims where chrome and copy sit */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#f3e7d6]/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#f3e7d6]/90 to-transparent" />
    </div>
  );
}

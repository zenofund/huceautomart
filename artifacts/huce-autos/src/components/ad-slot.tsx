import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Device = "desktop" | "tablet" | "mobile";

interface ResolvedAd {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
}

function currentDevice(width: number): Device {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function resolvePositions(basePlacement: string, device: Device): string[] {
  return [`${basePlacement}_${device}`, basePlacement];
}

export function AdSlot({
  basePlacement,
  className = "",
  imageClassName = "",
}: {
  basePlacement: string;
  className?: string;
  imageClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [device, setDevice] = useState<Device>(() =>
    typeof window === "undefined" ? "desktop" : currentDevice(window.innerWidth),
  );

  useEffect(() => {
    const onResize = () => setDevice(currentDevice(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const positions = useMemo(() => resolvePositions(basePlacement, device), [basePlacement, device]);

  const query = useQuery({
    queryKey: ["ad-slot", basePlacement, device],
    queryFn: async () => {
      const res = await fetch(`/api/ads/resolve?positions=${encodeURIComponent(positions.join(","))}`);
      if (!res.ok) throw new Error("Failed to load ad");
      return (await res.json()) as { item: ResolvedAd | null };
    },
    staleTime: 60_000,
  });

  const ad = query.data?.item ?? null;

  useEffect(() => {
    if (!ad) return;
    const el = rootRef.current;
    if (!el) return;
    const key = `ad-impression:${ad.id}:${basePlacement}:${device}`;
    if (sessionStorage.getItem(key) === "1") return;

    let sent = false;
    const send = async () => {
      if (sent) return;
      sent = true;
      sessionStorage.setItem(key, "1");
      try {
        await fetch(`/api/ads/${ad.id}/impression`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placement: basePlacement, device }),
        });
      } catch {
        // no-op
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible) {
          void send();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ad, basePlacement, device]);

  if (!ad) return null;

  const Wrapper = ad.linkUrl ? "a" : "div";
  return (
    <div className={className} ref={rootRef}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Sponsored</div>
      <Wrapper
        {...(ad.linkUrl
          ? {
              href: ad.linkUrl,
              target: "_blank",
              rel: "noreferrer",
            }
          : {})}
        className="block overflow-hidden rounded-xl border border-gray-200 bg-white hover:opacity-95 transition-opacity"
      >
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className={`w-full object-cover ${imageClassName}`}
          loading="lazy"
        />
      </Wrapper>
    </div>
  );
}

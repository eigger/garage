import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Garage - 차량관리",
    short_name: "Garage",
    description: "차량관리 통합 대시보드 (정비/소모품, 주유, 주행관리)",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18523f",
    orientation: "portrait",
    shortcuts: [
      {
        name: "빠른 입력",
        short_name: "빠른 입력",
        description: "주유/정비 빠른 입력으로 바로 이동",
        url: "/?shortcut=quick-log",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

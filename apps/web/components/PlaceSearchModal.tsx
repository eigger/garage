"use client";

import { useEffect, useState } from "react";
import { loadKakaoMaps, loadNaverMaps } from "../lib/maps/loadSdk";
import type { MapProvidersConfig } from "../lib/maps/types";
import { XIcon } from "./icons";

interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

interface PlaceSearchModalProps {
  mapConfig: MapProvidersConfig;
  onSelect: (result: PlaceResult) => void;
  onClose: () => void;
  t: (key: any) => string;
}

export function PlaceSearchModal({ mapConfig, onSelect, onClose, t }: PlaceSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    if (mapConfig.kakaoAppKey) {
      loadKakaoMaps(mapConfig.kakaoAppKey)
        .then(() => {
          if (active) setSdkReady(true);
        })
        .catch((err) => {
          console.error("Failed to load Kakao Maps:", err);
          if (active) setErrorMsg("지도 서비스를 불러오는 데 실패했습니다.");
        });
    } else if (mapConfig.naverClientId) {
      loadNaverMaps(mapConfig.naverClientId)
        .then(() => {
          if (active) setSdkReady(true);
        })
        .catch((err) => {
          console.error("Failed to load Naver Maps:", err);
          if (active) setErrorMsg("지도 서비스를 불러오는 데 실패했습니다.");
        });
    } else {
      setErrorMsg("설정된 지도 API 키가 없어서 검색 기능을 이용할 수 없습니다.");
    }
    return () => {
      active = false;
    };
  }, [mapConfig]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !sdkReady) return;
    setSearching(true);
    setResults([]);
    setErrorMsg("");

    if (mapConfig.kakaoAppKey) {
      const kakao = (window as any).kakao;
      if (kakao?.maps?.services) {
        const ps = new kakao.maps.services.Places();
        ps.keywordSearch(query, (data: any[], status: any) => {
          setSearching(false);
          if (status === kakao.maps.services.Status.OK) {
            const mapped = data.map((item) => ({
              name: item.place_name,
              address: item.road_address_name || item.address_name,
              lat: Number(item.y),
              lon: Number(item.x),
            }));
            setResults(mapped);
          } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
            setErrorMsg("검색 결과가 없습니다.");
          } else {
            setErrorMsg("검색 중 오류가 발생했습니다.");
          }
        });
      } else {
        setSearching(false);
        setErrorMsg("검색 모듈을 불러오지 못했습니다.");
      }
    } else if (mapConfig.naverClientId) {
      const naver = (window as any).naver;
      if (naver?.maps?.Service) {
        naver.maps.Service.geocode({ query }, (status: any, response: any) => {
          setSearching(false);
          if (status === naver.maps.Service.Status.ERROR) {
            setErrorMsg("검색 중 오류가 발생했습니다.");
            return;
          }
          const items = response.v2.addresses;
          if (!items || items.length === 0) {
            setErrorMsg("검색 결과가 없습니다.");
            return;
          }
          const mapped = items.map((item: any) => ({
            name: item.roadAddress || item.jibunAddress,
            address: item.roadAddress || item.jibunAddress,
            lat: Number(item.y),
            lon: Number(item.x),
          }));
          setResults(mapped);
        });
      } else {
        setSearching(false);
        setErrorMsg("검색 모듈을 불러오지 못했습니다.");
      }
    } else {
      setSearching(false);
      setErrorMsg("검색을 지원하지 않는 설정입니다.");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "90%",
          maxWidth: "480px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "16px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
            {mapConfig.kakaoAppKey ? "주소 및 상호 검색" : "주소 검색"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              padding: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              minHeight: "auto",
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input
            type="text"
            placeholder={mapConfig.kakaoAppKey ? "상호명이나 주소를 입력하세요" : "주소를 입력하세요"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, marginBottom: 0 }}
            autoFocus
          />
          <button
            type="submit"
            disabled={!query.trim() || !sdkReady || searching}
            style={{
              padding: "0 16px",
              height: "42px",
              minHeight: "42px",
              whiteSpace: "nowrap",
              fontSize: "14px",
            }}
          >
            {searching ? "검색 중..." : "검색"}
          </button>
        </form>

        {/* Error or Alert */}
        {errorMsg && (
          <p style={{ margin: "8px 0", fontSize: "13px", color: "var(--color-danger)", textAlign: "center" }}>
            {errorMsg}
          </p>
        )}

        {/* Results list */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {results.map((res, i) => (
            <div
              key={i}
              onClick={() => onSelect(res)}
              style={{
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--color-border-light)",
                cursor: "pointer",
                backgroundColor: "var(--color-surface-secondary)",
                transition: "background-color 0.2s ease",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-border-light)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-surface-secondary)";
              }}
            >
              <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--color-text)", marginBottom: "4px" }}>
                {res.name}
              </div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{res.address}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

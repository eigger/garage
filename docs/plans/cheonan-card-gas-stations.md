# 천안사랑카드 가맹 주유소 연동 — 구현 계획

> 사전 조사·설계 완료. 이 문서만 보고 바로 구현할 수 있도록 확정된 사실과 미결정 항목을 분리해 정리했다.
> 조사일: 2026-08-06 / 기준 커밋: `5d0514a`

## 1. 목표

천안사랑카드로 결제 가능한 주유소를 **가격순·거리순으로 한 화면에서** 볼 수 있게 한다.

- 가격은 **오피넷에서 조회된 값**을 쓰고, 차량 유종을 강조하되 **그 주유소가 취급하는 다른 유종 가격도 모두 표기**한다 (§7-2)
- 기능 전체는 **기본 비활성화된 옵션**이며, 켜야만 외부 API 호출이 시작된다 (§5)
- 갱신은 **cron이 아니라 조회 시점 온디맨드**다. 아무도 안 보면 호출 0건, 오피넷 게시 경계를 넘겼을 때만 갱신 (§6)

핵심 제약 하나가 설계를 결정한다 — **오피넷 `aroundAll.do`의 `radius`는 최대 5000m가 상한**이다.
반면 천안시 가맹 주유소 56곳(좌표 보유 기준)은 **남북 28km × 동서 29km**에 퍼져 있고,
천안시청 정중앙 기준으로도 5km 안에 들어오는 건 **23곳(41%)**뿐이다.

| 시청 기준 반경 | 가맹점 수 |
|---|---|
| 5km | 23 / 56 |
| 10km | 40 / 56 |
| 15km | 50 / 56 |
| 20km | 55 / 56 |
| 최대 거리 | 23.3km |

따라서 **기존 "주변 주유소"에 체크박스 필터를 붙이는 방식은 채택하지 않는다.**
천안 시내에 있어도 절반을 놓치고, 천안 밖에 있으면 0건이 된다.

대신 **가맹점 전체 목록을 미리 캐시해두고, 위치와 무관하게 정렬·필터하는 별도 화면**을 만든다.
좌표와 가격을 우리가 들고 있으므로 **캐시가 신선하면** 요청 경로의 외부 호출은 0회다.
(캐시가 낡아 갱신을 트리거한 요청은 응답은 즉시 반환하되, 백그라운드에서 §6의 호출이 나간다 — §6-3 참고.)

| | 기존 "주변 주유소" (그대로 둠) | 신규 "천안사랑 주유소" |
|---|---|---|
| 데이터 | `aroundAll` 5km 반경 | 캐시된 가맹점 전체 |
| 거리 | 오피넷 `DISTANCE` | 서버 haversine |
| 정렬 | 거리순/가격순/이득순 | 가격순/거리순 (위치 무관) |
| 요청 경로 오피넷 호출 (캐시 신선 시) | 1회 (§3 리팩터링 후) | **0회** |

---

## 2. 확정된 외부 API 사실

### 2-1. 코나카드 가맹점 API (비공식, 실제 호출로 검증 완료)

```
POST https://search.konacard.co.kr/api/v1/payable-merchants
Content-Type: application/json

{"id":34,"bizType":"3301","merchantType":"KB","pageNum":1,"pageSize":200,
 "affiliateName":"천안사랑카드","searchKey":""}
```

- **`Content-Type`은 반드시 JSON.** `application/x-www-form-urlencoded`는 400을 반환한다.
- 인증·API 키 없음. `searchKey: ""`면 전체 조회.
- `id: 34` = 천안사랑카드, `bizType: "3301"` = 주유소 카테고리.
- `pageSize: 200`으로 **76건 전부 한 번에** 받아진다. 페이징 루프 불필요.
- 응답 경로: `data.merchants[]`, 총건수는 `data.totalCount`.

**응답 필드** (사용할 것만):

| 필드 | 설명 |
|---|---|
| `seq` | 가맹점 고유번호 — upsert 키로 사용 |
| `simpleNm` | 상호 |
| `addr` | 주소 (도로명 또는 읍/면/동까지만) |
| `telNo` | 전화번호 (nullable) |
| `bizType` | `5608` 주유소 / `5609` 충전소(LPG) |
| `bizTypeDetail` | "주유소" / "충전소" |
| `latitude`, `longitude` | WGS84, **nullable** |

**실측 데이터 (2026-08-06):**
- 총 76건 = 주유소(`5608`) 62건 + 충전소(`5609`) 14건
- **좌표 결측 20건(26%).** 그중 6건은 도로명 주소까지 있고, 14건은 읍/면/동까지만 있다.
- 상호가 법인명이라 주유소명과 다른 건: `(주)엠제이컴퍼니`, `강성산업`, `공원`,
  `태호건설주식회사 천안지점`, `주식회사 화이너지(원성깨비주유소)` 등 5건 내외
- 동명이인: `보성주유소` 2건 (좌표로 구분됨)

**다른 지역:** 루트 페이지(`/payable-merchants`)에 경기도 시군(`id` 1~33)이 있으나,
`id=16`(수원) + `merchantType=KB`로 던지면 0건이다. 지역마다 `merchantType`/`bizType` 체계가 다르다.
**이번 범위는 천안(`id=34`)만이고, 코드도 천안 전용으로 짠다.**
지역 파라미터를 받는 범용 추상화를 미리 만들지 않는다 — 위에서 보듯 지역마다 체계가 달라
지금 추상화해도 맞을 확률이 낮다. 이름도 전부 `cheonan*` / `CheonanCard*`로 통일한다.
나중에 다른 지역이 필요해지면 그때 §5-3의 상수를 맵으로 승격하고 이름을 일반화한다.

**리스크:** 비공식 API다. 계약이 없으므로 예고 없이 바뀔 수 있다. `robots.txt`는 404.
가맹점 목록은 TTL 7일로 드물게만 호출한다(§6-1). **실패 시 기능을 조용히 비활성화하는 폴백이 필수.**

### 2-2. 오피넷 API (공식 문서 `Opinet_API_Free.pdf` 2026.04 기준)

**일일 호출 한도: 1,500 call/일** (키 단위). 이 예산을 설계에 반영해야 한다.

가격 갱신 시각: **1시, 2시, 9시, 12시, 16시, 19시**

이번 작업에 쓰는 엔드포인트:

| API | 용도 | 핵심 반환 필드 |
|---|---|---|
| ⑨ `aroundAll.do` | 반경 내 주유소 | `UNI_ID`, `POLL_DIV_CD`, `OS_NM`, `PRICE`, `DISTANCE`, **`GIS_X_COOR`**, **`GIS_Y_COOR`** |
| ⑪ `searchByName.do` | **상호로 주유소 검색** | `UNI_ID`, `OS_NM`, `VAN_ADR`, `NEW_ADR`, **`SIGUNCD`**, **`LPG_YN`**, `GIS_X_COOR`, `GIS_Y_COOR` |
| ⑩ `detailById.do` | 주유소 상세 | 위 + `TEL`, `OIL_PRICE[]`(`PRODCD`, `PRICE`, `TRADE_DT`, `TRADE_TM`), `KPETRO_YN`, `GOOD_YN` |
| ⑧ `lowTop10.do` | 지역 최저가 TOP20 | `UNI_ID`, `PRICE`, `OS_NM`, **`VAN_ADR`**, **`NEW_ADR`**, **`GIS_X_COOR`**, **`GIS_Y_COOR`** |
| ⑯ `areaCode.do` | 지역코드 조회 | `AREA_CD`, `AREA_NM` |

**중요한 점 세 가지:**

1. **`aroundAll.do`는 좌표를 반환한다.** 현재 [apps/api/src/lib/opinet.ts](../../apps/api/src/lib/opinet.ts) 는 파싱하지 않고 있다.
2. **`lowTop10.do`도 주소와 좌표를 반환한다.** 역시 파싱하지 않고, 대신 후보마다 `detailById`를 또 부른다.
3. **`searchByName.do`가 매칭 문제의 해법이다.** `osnm`(2글자 이상) + `area`(시도코드 2자리)로
   조회하면 `UNI_ID`를 직접 얻는다. `SIGUNCD`로 천안 소재 확인, `LPG_YN`(`N`:주유소 / `Y`:충전소 / `C`:겸업)로
   코나카드 `5608`/`5609`와 교차검증까지 된다.

`searchByName.do`로 **동기화 시점에 `UNI_ID`를 가맹점 행에 확정해 둔다.**
조회 시점에는 `CheonanCardMerchant`(+가격 캐시)를 바로 읽어 목록을 만든다 —
주변 주유소 목록을 `UNI_ID`로 거르는 필터 설계는 채택하지 않았다(§1).
좌표 결측 20건도 상호 검색으로 상당수 해소된다.

> 검토 과정에서 Kakao Local API로 결측 좌표를 채우는 안도 있었으나 **채택하지 않는다.**
> `searchByName.do`로 해결되고, Kakao는 (a) 저장된 `KAKAO_MAP_APP_KEY`가 JS SDK 키라 서버 배치에서 못 쓰고,
> (b) 오픈 API 데이터의 별도 DB 구축을 제한하는 약관 조항이 걸리며,
> (c) Kakao 미설정 사용자에게 기능이 반쪽이 되는 의존성을 만든다.

> **이득순과의 관계 (후속, 이번 범위 밖).** 캐시된 가맹 62곳을 이득순 후보로 쓰면
> `lowTop10` 없이도 후보가 넓어질 수 있다. 의도적 제외 — NearbyStationsCard 이득순은
> 기존 `lowTop10` 경로를 유지하고, 천안사랑 화면은 가격순/거리순만 제공한다.
> 이득순 통합은 별도 이슈로 다룬다.

---

## 3. 선행 작업 — 오피넷 호출 절감 (별도 PR, 이 기능과 독립)

**이 기능과 무관하게 지금 코드가 일일 예산을 낭비하고 있다. 먼저 분리해서 처리한다.**

| 시나리오 | 현재 | 수정 후 |
|---|---|---|
| 거리순/가격순 조회 1회 | `aroundAll` 1 + `detailById` 5 = **6회** | **1회** |
| 이득순 조회 1회 | `aroundAll` 1 + `lowTop10` 1 + `detailById` ≤10 = **12회** | **2회** |

### 3-1. `fetchNearbyStations`에 좌표 추가

[apps/api/src/lib/opinet.ts:108](../../apps/api/src/lib/opinet.ts) 의 매핑에 `GIS_X_COOR`/`GIS_Y_COOR` 파싱을 추가하고
`katecToWgs84`로 변환해 `lat`/`lon`을 `OpinetStationSummary`에 포함시킨다.

- `packages/shared/src/schemas/opinet.ts`의 `opinetStationSummarySchema`에 `lat`, `lon` (`.nullable()`) 추가
- [apps/web/components/NearbyStationsCard.tsx:124-138](../../apps/web/components/NearbyStationsCard.tsx) 의
  상위 5건 `detailById` 보강 로직(`gasCoords` state 포함)을 **통째로 제거**하고 요약 응답의 좌표를 그대로 쓴다
- `mockStations()`에도 좌표를 넣어 목 데이터 경로가 깨지지 않게 한다

### 3-2. `fetchLowPriceCandidates`에 주소·좌표 추가

`VAN_ADR`, `NEW_ADR`, `GIS_X_COOR`, `GIS_Y_COOR`를 파싱해 `OpinetLowPriceCandidate`에 포함시키고,
[apps/api/src/routes/opinet.ts:84-89](../../apps/api/src/routes/opinet.ts) 의
`candidates.map((c) => fetchStationDetail(c.id))` 블록을 제거한다.

### 3-3. (선택) `lowTop10` 지역코드를 시군 4자리로

`lowTop10.do`의 `area`는 시군코드 4자리를 받는다. 현재 [opinet.ts:7](../../apps/api/src/lib/opinet.ts) 의
`OPINET_AREA_BY_SIDO`는 시도 2자리만 쓴다. 시군코드를 쓰면 이득순 후보가 해당 시군으로 좁혀져 정확도가 오른다.
**코드값은 `areaCode.do?area=05`로 확인 필요** (§8 참조). 확인 전까지는 시도 2자리 동작을 유지한다.

> 이 PR은 `NearbyStationsCard`의 기존 동작(5개 표시, 번호↔지도 마커 대응)을 바꾸지 않는다.
> 호출 수만 줄이는 변경이며, 리팩터링 후 반드시 실제 키로 거리순/가격순/이득순 3개 모드를 눌러 확인한다.

---

## 4. 데이터 모델

`apps/api/prisma/schema.prisma`에 추가 후 마이그레이션 1개 생성.

```prisma
// 천안사랑카드로 결제 가능한 주유소. 코나카드 검색 API를 스냅샷해 오피넷 UNI_ID와
// 매핑해둔다. 가맹 여부의 authoritative 소스는 코나카드 쪽이다.
model CheonanCardMerchant {
  konaSeq     Int      @id  // 코나카드 seq — 그대로 PK로 쓴다
  name        String   // simpleNm (코나카드 상호, 법인명일 수 있음)
  address     String
  tel         String?
  bizType     String   // "5608" 주유소 / "5609" 충전소(LPG)
  lat         Float?   // 코나카드 좌표 (26%가 null)
  lon         Float?

  // 오피넷 매칭 결과 — null이면 가격 정보를 붙일 수 없다(가맹점인 건 여전히 유효)
  opinetId    String?
  matchMethod String?  // "name" | "coord" | "manual"
  opinetName  String?  // OS_NM — 화면에는 이쪽을 우선 표시
  brand       String?  // POLL_DIV_CD
  roadAddress String?  // NEW_ADR
  opinetLat   Float?
  opinetLon   Float?
  lpgYn       String?  // N/Y/C

  syncedAt    DateTime
  updatedAt   DateTime @updatedAt

  @@index([opinetId])
}

// 유종별 현재가 캐시. opinetId 단위.
model CheonanCardStationPrice {
  opinetId  String
  prodCd    String   // B027 휘발유 / D047 경유 / K015 부탄 / B034 고급휘발유
  price     Int
  tradeAt   DateTime // TRADE_DT + TRADE_TM 조합
  updatedAt DateTime @updatedAt

  @@id([opinetId, prodCd])
}

// 온디맨드 갱신(§6)의 신선도 판정과 동시 실행 가드에 쓰는 단일 행 상태.
// 행이 하나뿐이므로 id는 항상 1을 쓴다.
model CheonanCardSyncState {
  id                    Int       @id @default(1)
  merchantSyncedAt      DateTime?  // 가맹점 목록 + UNI_ID 매핑 최종 성공 시각 (TTL 7일)
  pricesSyncedAt        DateTime?  // 가격 최종 성공 시각 — 게시 경계와 비교
  merchantSyncStartedAt DateTime?  // 진행 중 표시. 10분 지나면 무시(프로세스 재시작 대비)
  priceSyncStartedAt    DateTime?  // 진행 중 표시. 10분 지나면 무시(프로세스 재시작 대비)
  lastError             String?
  updatedAt             DateTime  @updatedAt
}
```

**설계 의도:**
- `opinetId`가 null인 행도 **삭제하지 않는다.** 가맹 여부는 코나카드가 authoritative하므로,
  가격만 없는 채로 목록 하단에 "가격 정보 없음"으로 노출한다.
- 코나카드 좌표와 오피넷 좌표를 따로 보관한다. 표시·거리 계산은 오피넷 좌표 우선, 없으면 코나카드 좌표.
- 좌표 출처가 코나카드/오피넷이므로 Kakao 약관 이슈가 없다.
- `CheonanCardStationPrice`는 `opinetId` 문자열로만 연결한다(Prisma relation 없음).
  가맹 해지로 merchant 행을 삭제할 때, 그 `opinetId`를 더 이상 쓰는 merchant가 없으면
  **해당 price 행도 함께 삭제**한다(orphan 방지).

---

## 5. 기능 스위치

### 5-1. 설정 키

`packages/shared/src/schemas/settings.ts`의 `settingKeySchema`에 **하나만** 추가한다.

| 키 | 값 | 기본값 | 역할 |
|---|---|---|---|
| **`CHEONAN_CARD_ENABLED`** | `"true"` / `"false"` | **미설정 = 비활성** | 기능 on/off 스위치 |

지역 설정 키는 두지 않는다. 대상은 천안 하나뿐이고, §5-3의 상수에 하드코딩한다.

**기능이 활성화되는 조건은 둘 다 만족할 때뿐이다:**

```
CHEONAN_CARD_ENABLED === "true"  &&  OPINET_API_KEY 설정됨
```

`isCheonanCardEnabled()` 헬퍼를 `apps/api/src/lib/cheonanCard.ts`에 두고 라우트·잡이 공통으로 쓴다.

**기본 비활성화의 실질적 의미는 "외부 API를 아예 호출하지 않는다"이다.**
끈 상태에서는 §6의 `ensure*` 함수가 no-op이고, `/config`가 `enabled: false`를 반환해
프론트 진입점도 사라진다. 갱신이 온디맨드이므로(§6) **켜지 않은 배포에는 백그라운드 활동 자체가 없다.**
비공식 API에 의존하는 기능이므로 옵트인이 맞다.

**끌 때 캐시 데이터는 지우지 않는다.** 다시 켜면 즉시 목록이 보이고,
가격은 다음 조회 시점에 §6의 신선도 판정에 따라 갱신된다.

**켜는 순간 워밍업(선택).** `PUT /api/settings/CHEONAN_CARD_ENABLED`로 `"true"`가 저장될 때
`ensureFreshMerchants()`를 백그라운드로 트리거해두면, 첫 사용자가 `"preparing"` 화면을 안 봐도 된다.
필수는 아니다 — 없어도 첫 조회가 알아서 채운다. 라우트 응답을 블로킹하지 말 것.

### 5-2. 통합 설정 UI

`apps/web/app/integrations/page.tsx`의 `fuel` 그룹에 항목을 추가한다.
`CHEONAN_CARD_ENABLED`는 텍스트 입력이 아니라 **토글 스위치**로 노출하는 게 자연스럽다.

비밀값이 아니므로 [settings.ts:23](../../apps/api/src/routes/settings.ts) 의
`isPlainValueKey`에 포함시켜 마스킹 없이 값이 보이게 한다.
(현재 `isPlainValueKey`가 `key === "EV_CHARGER_API_KEY_EXPIRES_AT"` 단일 비교이므로 배열 포함 검사로 바꾼다.)

### 5-3. 상수

`apps/api/src/lib/cheonanCard.ts`에 하드코딩:

```ts
export const CHEONAN_CARD = {
  label: "천안사랑카드",
  konaId: 34,                     // 코나카드 지역 id
  merchantType: "KB",
  bizType: "3301",                // 주유소 카테고리
  affiliateName: "천안사랑카드",
  opinetSidoArea: "05",           // 충청남도 — searchByName의 area
  opinetSigunCds: [] as string[], // SIGUNCD 화이트리스트 — §8에서 확정
} as const;
```

`.env.example`와 `docker-compose.yml`에도 주석과 함께 `CHEONAN_CARD_ENABLED`를 추가한다.

---

## 6. 동기화 — cron이 아니라 **온디맨드(lazy) 갱신**

`node-cron`을 쓰지 않는다. **아무도 화면을 열지 않으면 외부 API 호출이 0건**이고,
조회 시점에 캐시가 낡았을 때만 갱신한다. 기능이 기본 비활성(§5)인 것과 같은 철학이다.

`apps/api/src/lib/cheonanCardSync.ts`에 두 개의 `ensure` 함수를 두고,
`GET /api/cheonan-card/stations`가 이를 호출한다.

```ts
ensureFreshMerchants()  // TTL 7일
ensureFreshPrices()     // TTL = 오피넷 가격 게시 경계
```

**두 함수 모두 진입 시 `isCheonanCardEnabled()`를 확인하고 false면 즉시 no-op으로 반환한다.**
기능을 켜지 않은 배포에서는 코나카드·오피넷 호출이 단 한 건도 나가지 않는다.
(오피넷 키가 없으면 목 데이터가 나오는데, 가짜 가격을 저장하면 안 된다 —
`/api/opinet/configured`가 false일 때 빠른 입력의 주유소 찾기를 숨기는 기존 정책과 동일한 이유다.)

### 6-0. 갱신 판정과 응답 전략 ⚠️ 핵심

**신선도 판정** (`isPriceCacheStale`, 순수 함수로 분리해 테스트):

오피넷 가격 게시 시각은 **1·2·9·12·16·19시**다. "마지막으로 지나간 게시 경계"보다
캐시가 오래됐으면 stale이다.

```ts
lastPublishBoundary(now)  // now 이전의 가장 최근 경계 시각
stale = pricesSyncedAt < lastPublishBoundary(now)
```

> **⚠️ 타임존 함정.** 경계는 **KST(Asia/Seoul) 기준**이다. 컨테이너 `TZ`가 UTC일 수 있으므로
> `getHours()`를 그대로 쓰면 9시간 어긋난다. `Intl.DateTimeFormat`에 `timeZone: "Asia/Seoul"`을
> 명시하거나 UTC 오프셋으로 직접 계산할 것. **테스트에 반드시 UTC 환경 케이스를 넣는다.**

**응답 전략 — stale-while-revalidate.** 갱신에는 76회 호출 × throttle = **15초 안팎이 걸린다.
사용자를 그동안 기다리게 하면 안 된다.**

| 캐시 상태 | 응답 | 백그라운드 |
|---|---|---|
| 비어 있음 | `status: "preparing"`, `stations: []` | 가맹점 + 가격 동기화 시작 |
| 신선 | `status: "fresh"` + 데이터 | 없음 |
| 낡음 | **`status: "refreshing"` + 낡은 데이터 즉시 반환** | 가격 갱신 시작 |

**낡아도 일단 보여준다.** 프론트는 `status`에 따라 안내를 띄우고 몇 초 뒤 재조회한다(§7-2).
갱신 트리거는 `await`하지 않는다 — 라우트 응답을 절대 블로킹하지 말 것.

**동시 실행 가드 (필수).** 여러 사용자가 동시에, 또는 한 사용자가 연타로 경계를 넘기면
갱신이 N중으로 돌아 호출량이 N배가 된다. **가맹점·가격 모두**에 적용한다.

- 모듈 스코프에 in-flight `Promise | null`을 두고, 진행 중이면 그 Promise를 그대로 반환한다
- DB에 `merchantSyncStartedAt` / `priceSyncStartedAt`을 기록해, 프로세스 재시작으로 메모리
  플래그가 날아가도 **10분 이내에 시작된 갱신이 있으면 새로 시작하지 않는다**
- 최초 진입에서 두 동기화가 함께 트리거되므로, 가맹점 가드가 없으면 코나카드+searchByName이 2배가 된다
- API 프로세스는 1개지만, 이 가드는 재시작·다중 워커 어느 쪽에서도 안전해야 한다

### 6-1. `ensureFreshMerchants` — 가맹점 목록 + `UNI_ID` 매핑

**TTL 7일.** `CheonanCardSyncState.merchantSyncedAt`이 7일보다 오래됐거나 없으면 실행.

1. 코나카드 API 1회 호출 → 76건
2. `konaSeq`로 upsert. **응답에 없어진 행은 삭제**하고, 그 `opinetId`를 더 이상 쓰는 merchant가
   없으면 **`CheonanCardStationPrice` orphan도 삭제**한다
3. `opinetId`가 아직 없는 행에 대해 매칭:
   - **1차 — `searchByName.do`**: `osnm`을 정규화한 상호로 조회(`area=05`).
     결과 중 `SIGUNCD`가 `opinetSigunCds`에 포함(또는 화이트리스트 비어 있으면 주소에 "천안")이고,
     **좌표 대조 규칙(아래)을 만족**하는 후보만 채택.
     후보가 정확히 1건일 때만 확정 → `matchMethod = "name"`
   - **`opinetSigunCds`가 빈 배열일 때:** 동명 오매칭을 막기 위해 **좌표 대조를 필수로 강제**한다.
     코나카드 좌표가 없거나 500m 이내 후보가 없으면 name 매칭을 확정하지 않는다.
   - **2차 — 좌표 폴백**: 1차 실패 + 코나카드 좌표 있음.
     해당 좌표로 `aroundAll.do`(radius 1000) 호출 후 **150m 이내 + 최근접** 1건 → `matchMethod = "coord"`.
     **`prodcd`는 필수**이므로 `bizType === "5609"`(LPG 충전소)면 `K015`, 그 외는 `B027`로 조회한다.
     (B027만 쓰면 LPG 전용 14건이 결과에 안 잡힌다.)
   - 둘 다 실패하면 `opinetId = null`로 두고 **`app.log.warn`으로 상호를 남긴다**
4. `LPG_YN`과 코나카드 `bizType`이 어긋나면(예: `5608`인데 `LPG_YN = "Y"`) 로그만 남기고 매칭은 유지

**상호 정규화** (`normalizeStationName`, 순수 함수로 분리해 테스트):
`(주)`·`(유)`·`주식회사`·공백·`셀프`·`self`·`SELF` 제거, 소문자화, 괄호 안 내용 제거.
`(주)광명주유소` → `광명주유소`. 2글자 미만이 되면 `searchByName` 호출을 건너뛴다(API 제약).

**호출량**: 최초 1회 최대 76회(+ 좌표 폴백 20회 내외 ≈ **~96회**). 이후 신규 가맹점만이라 주당 한 자릿수.
**200ms 간격으로 throttle**한다. 완료 후 `merchantSyncedAt`을 갱신한다.

### 6-2. `ensureFreshPrices` — 유종별 현재가

**TTL = §6-0의 게시 경계.** stale일 때만 실행.

1. `opinetId`가 있는 행을 모두 조회
2. 각각 `detailById.do` 1회 → **`OIL_PRICE[]`에 들어 있는 유종을 전부** `CheonanCardStationPrice`에 upsert.
   차량 유종만 골라 저장하지 않는다 — **화면에서 전 유종 가격을 함께 보여줘야 하고(§7-2),
   한 번의 호출로 이미 다 받아오므로 추가 비용이 0이다.**
3. `TRADE_DT` + `TRADE_TM`을 파싱해 `tradeAt`에 저장 — 화면의 "기준시각" 표기에 쓴다
4. 이번 응답의 `OIL_PRICE[]`에 없는 유종 행은 **삭제한다** (취급 중단 반영)
5. 200ms 간격 throttle. 개별 실패는 건너뛰고 계속 진행(직전 값 유지)
6. **전부 실패해도 `pricesSyncedAt`을 갱신하지 않는다** — 다음 조회에서 다시 시도해야 한다.
   단 `priceSyncStartedAt`은 남겨 재시도 폭주를 막는다

주유소마다 취급 유종이 다르다. LPG 충전소는 `K015`만, 고급휘발유(`B034`)나 실내등유(`C004`)를
안 파는 곳도 흔하다. **`OIL_PRICE[]`에 있는 것만 저장하고, 없는 유종은 화면에서도 표시하지 않는다.**

**호출량**: 1회 갱신 = 76회. 하루 최대 = 경계를 넘긴 횟수만큼.

### 6-3. 일일 예산 점검

| 사용 패턴 | 호출/일 |
|---|---|
| **기능을 켜지 않음 (기본값)** | **0** |
| 켜두고 아무도 안 봄 | **0** |
| **최초 활성화 1회** (가맹점 매칭 ~96 + 가격 76) | **~172** (일회성, 7일마다 매핑만 소량) |
| 하루 한 번 조회 (가격만 stale) | 76 |
| 하루 종일 산발 조회 (경계 6개 전부 통과) | 456 |
| 가맹점 매핑 (7일 TTL, 평상시) | < 1 |
| 주변 주유소 조회 (§3 이후 1회/조회) | 사용량 비례 |
| **최악** (최초 172 + 산발 456) | **~630 / 1,500 (42%)** — 평상 최악은 ~460 |

**cron 3회/일(고정 228) 대비 트레이드오프를 명확히 인지할 것:**
안 쓰면 0이지만, 하루 종일 쓰면 456으로 **더 많다.** 그래도 평상 최악이 예산의 ~31%라 수용 가능하고,
새벽 1·2시 경계는 그 시간에 조회하는 사람이 없으면 트리거 자체가 안 되므로
실질 상한은 4회(304회)에 가깝다. **온디맨드 방식이 이 프로젝트(자가호스팅·소수 사용자)에 더 맞다.**

예산이 문제가 되면 게시 경계 목록을 `[9,12,16,19]`로 줄이는 것만으로 상한이 조절된다.
경계 배열을 상수로 분리해 나중에 조정할 수 있게 둘 것.

---

## 7. 구현 상세

### 7-1. 백엔드

**`apps/api/src/lib/cheonanCard.ts`** (신규)
- `CHEONAN_CARD` 상수 정의
- `isCheonanCardEnabled()` — §5-1의 두 조건 AND. 라우트·동기화가 공통으로 사용
- `fetchKonaMerchants()` — 코나카드 API 호출 + 파싱
- `normalizeStationName(name)` — 순수 함수
- `resolveOpinetId(...)` — 매칭 로직 (searchByName → 좌표 폴백)

**`apps/api/src/lib/cheonanCardSync.ts`** (신규) — §6
- `CHEONAN_CARD_PRICE_BOUNDARIES = [1, 2, 9, 12, 16, 19]` 상수
- `lastPublishBoundary(now)` / `isPriceCacheStale(syncedAt, now)` — 순수 함수, KST 기준
- `ensureFreshMerchants()` / `ensureFreshPrices()` — 게이팅 + in-flight 가드 + 백그라운드 실행

**`apps/api/src/lib/opinet.ts`** (수정)
- `searchStationsByName(osnm, area)` 추가 (⑪)
- `fetchStationPrices(uniId)` 추가 — `detailById`의 `OIL_PRICE[]` 전체를 반환
- §3의 좌표 파싱 추가

**`apps/api/src/routes/cheonanCard.ts`** (신규, `prefix: "/api/cheonan-card"`)

기존 라우트들과 동일하게 `app.addHook("preHandler", app.authenticate)`.

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/config` | `{ enabled, label, merchantCount, merchantSyncedAt }` |
| `GET` | `/stations` | 가맹 주유소 전체 목록 |

`GET /stations` 쿼리 파라미터:

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `fuelType` | 필수 | `GASOLINE`/`DIESEL`/`LPG` — **정렬·강조 기준 유종**. `ELECTRIC`은 빈 배열 |
| `lat`, `lon` | 선택 | 있으면 haversine으로 `distanceM` 계산 및 거리순 정렬 가능 |
| `sort` | 선택 | `price`(기본) / `distance`. `distance`인데 좌표가 없으면 `price`로 폴백 |
| `maxKm` | 선택 | 거리 필터. 미지정 = 전체 |

**`fuelType`은 필터가 아니라 "무엇을 강조하고 무엇으로 정렬할지"를 정한다.**
응답에는 각 주유소가 취급하는 **전 유종 가격을 모두 담는다.**

**핸들러는 응답 전에 `ensureFreshMerchants()` / `ensureFreshPrices()`를 호출하되 `await`하지 않는다.**
두 함수는 갱신이 필요한지만 즉시 판정하고, 필요하면 백그라운드로 시작한 뒤 곧바로 반환한다(§6-0).

```ts
{
  label: "천안사랑카드",
  // "preparing" 캐시 없음 / "refreshing" 낡은 값 반환 중 / "fresh" 최신
  // 프론트는 preparing·refreshing일 때 ~5초 뒤 재조회한다
  status: "preparing" | "refreshing" | "fresh",
  primaryProdCd: "B027",   // fuelType으로부터 변환된 강조 대상 유종
  stations: Array<{
    id: string;            // opinetId
    konaSeq: number;
    name: string;          // opinetName ?? name
    brand: string | null;
    brandLabel: string | null;
    address: string;
    tel: string | null;
    lat: number | null;
    lon: number | null;
    distanceM: number | null;   // lat/lon 미제공 시 null

    // 오피넷에서 조회된 가격. 그 주유소가 취급하는 유종만 들어온다.
    // primaryProdCd가 항상 포함된다는 보장은 없다(취급하지 않을 수 있음).
    prices: Array<{
      prodCd: string;           // B027 | D047 | B034 | C004 | K015
      price: number;
      tradeAt: string;          // ISO — 유종별 기준시각
    }>;
    primaryPrice: number | null; // prices에서 primaryProdCd를 뽑아둔 값. 정렬 키

    isLpgStation: boolean;       // bizType 5609
  }>,
  unmatched: Array<{ konaSeq, name, address, tel, lat, lon, distanceM }>,
  merchantSyncedAt: string | null,  // 가맹점 목록 기준 시각
  pricesSyncedAt: string | null,    // 가격 캐시 기준 시각
}
```

- `fuelType`에 따라 `bizType`을 거른다: `LPG` → `5609`(+`5608` 중 `lpgYn`이 `C`), 그 외 → `5608`(+`C`)
- `prices`는 **유종 표시 순서를 서버에서 고정**해 내려보낸다:
  `B027`(휘발유) → `B034`(고급휘발유) → `D047`(경유) → `K015`(자동차부탄) → `C004`(실내등유).
  단 `primaryProdCd`에 해당하는 항목은 프론트에서 맨 앞으로 끌어올려 강조한다
- `primaryPrice`가 `null`인 행(해당 유종 미취급)은 정렬 시 **뒤로 보낸다.** 목록에서 지우지는 않는다 —
  가맹점인 건 사실이고, 다른 유종 가격은 여전히 유용하다
- 유종 라벨은 `packages/shared`에 `OPINET_PROD_LABELS` 맵으로 두고 ko/en 양쪽을 제공한다
  (`B027` 휘발유 / `B034` 고급휘발유 / `D047` 경유 / `K015` 자동차부탄(LPG) / `C004` 실내등유)
- 타입은 `packages/shared/src/schemas/cheonanCard.ts`에 zod 스키마로 정의하고 `index.ts`에서 re-export

### 7-2. 프론트엔드

**신규 화면: `apps/web/app/vehicles/[id]/cheonan-card/page.tsx`**

기존 서브라우트(`history`, `quick-log`, `analytics`, `schedule` 등)와 같은 위치·같은 레이아웃 규약을 따른다.
차량의 `fuelType`과 마지막 위치 좌표를 그대로 쓸 수 있어서다.

화면 구성:
- 헤더: 지역 라벨 + 가맹점 수 + **가격 기준시각** ("N개 · 오늘 09:12 기준")
- 정렬 토글: **가격순 / 거리순** — 기존 `NearbyStationsCard`의 토글 스타일 재사용
- 거리 필터: `5km / 10km / 20km / 전체` — 기본값 **전체**
- 목록: 브랜드·상호·주소·**가격(아래 규칙)**·거리 + `NavLaunchButtons`
  - 목록 순번 뱃지는 `StationBadge` 패턴 재사용
  - `RESULT_LIMIT` 같은 5개 제한을 두지 않는다. 62건 전체를 렌더한다
- 하단 별도 섹션: **"가격 정보 없음"** (`unmatched`) — 상호·주소·전화번호만 표시

**가격 표시 규칙** — 차량 유종을 강조하되, **오피넷에서 조회된 다른 유종 가격도 전부 함께 보여준다.**

```
[SK에너지] 태조산주유소                    2.4km
휘발유  1,598원                     ← 강조: 크게 + var(--color-primary) + 600
경유 1,489 · 고급휘발유 1,845 · 자동차부탄 1,012   ← 보조: 12px + var(--color-text-muted)
09:12 기준
```

- **강조**: `primaryProdCd` 유종을 첫 줄에 유종명과 함께 크게 표시.
  기존 [NearbyStationsCard.tsx:311](../../apps/web/components/NearbyStationsCard.tsx) 의
  가격 스타일(`fontSize: 13, fontWeight: 600, color: var(--color-primary)`)을 그대로 쓰되 한 단계 키운다
- **보조**: 나머지 유종을 한 줄에 `유종명 가격` 형태로 나열. 12px / `var(--color-text-muted)`.
  줄이 넘치면 `flexWrap`으로 접히게 한다
- 그 주유소가 **취급하지 않는 유종은 아예 표시하지 않는다** (0원이나 `-`로 채우지 않는다)
- `primaryPrice`가 `null`이면(해당 유종 미취급) 강조 자리에 `해당 유종 미취급` 문구를 두고
  보조 줄은 그대로 보여준다. 목록에서 빼지 않는다
- **기준시각**은 유종마다 다를 수 있다. 항목별로는 `primaryProdCd`의 `tradeAt`을 쓰고,
  헤더에는 전체 중 가장 오래된 값을 기준으로 표기해 과대 신선도를 주장하지 않는다
- 현재 위치가 지역에서 멀면(예: 최근접 가맹점이 30km 초과) 상단에 안내 문구
- 지도를 넣는다면 마커는 **화면에 보이는 상위 N개만** (62개를 다 찍으면 못 본다)

**`status` 처리** (§6-0의 온디맨드 갱신과 짝을 이룬다):

| `status` | 화면 |
|---|---|
| `"fresh"` | 그대로 표시 |
| `"refreshing"` | **낡은 목록을 그대로 보여주고** 헤더에 "가격 갱신 중" 표시. 기존 데이터를 비우지 않는다 |
| `"preparing"` | 스켈레톤 + "가맹점 정보를 불러오는 중입니다" |

- `preparing`/`refreshing`이면 **약 5초 뒤 재조회**한다. 무한 폴링하지 말 것.
  **재시도 예산을 분리한다** — 최초 동기화는 가맹점(~20s)+가격(~15s) ≈ 35s 이상이므로
  `preparing`은 **12회 ≈ 60초**, `refreshing`(가격만)은 **6회 ≈ 30초**.
  한도를 넘기면 "잠시 후 다시 시도해 주세요"로 멈춘다
- 갱신에 15초 안팎이 걸리므로 `refreshing` 상태가 여러 번 보일 수 있다.
  **낡은 가격이라도 계속 읽을 수 있어야 한다** — 스피너로 목록을 가리지 말 것

**진입점: `apps/web/components/NearbyStationsCard.tsx`**
- 마운트 시 `GET /api/cheonan-card/config` 조회
- `enabled`일 때만 카드 하단에 "천안사랑 가맹 주유소 전체 보기 →" 링크를 노출
- **기존 카드의 동작·정렬 옵션은 건드리지 않는다**

**i18n**: `apps/web/lib/i18n/translations.ts`의 `ko`/`en` 양쪽에 키 추가.
`cheonanCardTitle`, `cheonanCardDistanceFilterAll`, `cheonanCardPriceAsOf`, `cheonanCardNoPriceSection`,
`cheonanCardTooFarNotice`, `cheonanCardEmpty`, `cheonanCardViewAll`, `cheonanCardDisabled`,
`cheonanCardFuelNotSold`, `cheonanCardPreparing`, `cheonanCardRefreshing`, `cheonanCardRetryLater` 등. 기존 `sortDistance`/`sortPrice`는 재사용한다.
유종 라벨(`B027` 등)은 `packages/shared`의 `OPINET_PROD_LABELS`에서 로케일별로 가져온다.

### 7-3. 폴백·에러 처리

| 상황 | 동작 |
|---|---|
| **`CHEONAN_CARD_ENABLED`가 `"true"`가 아님 (기본값)** | `/config`가 `enabled: false`. 진입점 숨김. **`ensure*` no-op — 외부 호출 0건** |
| `OPINET_API_KEY` 미설정 | 동일하게 비활성 — **목 가격을 저장하지 않는다** |
| 켜져 있으나 캐시 비어 있음 | `status: "preparing"`. 첫 조회가 백그라운드 동기화를 트리거 |
| 가격 캐시가 낡음 | `status: "refreshing"` + **낡은 값 즉시 반환**. 갱신은 백그라운드 |
| 갱신이 이미 진행 중 | 새로 시작하지 않고 in-flight Promise 재사용 (§6-0) |
| 코나카드 API 실패 | 에러 로그 + `lastError` 기록, **기존 캐시 유지**. 화면은 정상 동작 |
| 가격 갱신 전체 실패 | `pricesSyncedAt`을 갱신하지 않아 다음 조회에서 재시도. 낡은 값은 계속 표시 |
| 오피넷 매칭 실패 | `unmatched`로 노출. 목록에서 지우지 않음 |
| 해당 유종 미취급 | `primaryPrice: null`. 다른 유종 가격은 표시, 정렬은 뒤로 |
| 기능을 끔 | 캐시 유지. 진입점만 사라짐. 다시 켜면 즉시 복구 |

---

## 8. 확인·결정이 필요한 항목

1. **천안 시군코드(`SIGUNCD`)** — `areaCode.do?out=json&code={KEY}&area=05`를 실제 키로 호출해
   천안시(또는 동남구/서북구가 분리돼 있는지) 코드를 확인하고 `opinetSigunCds`에 채운다.
   §3-3의 `lowTop10` 개선도 이 값에 의존한다.
   **채우기 전(빈 배열)에는 §6-1대로 좌표 대조를 필수로 강제**한다.
2. **`searchByName.do` 실제 응답 형태** — 결과가 0건/다건일 때의 JSON 구조를 확인한다.
   오피넷 JSON은 개행·탭이 섞여 나와 기존 `parseOpinetJson`이 이를 제거하고 있으니 그대로 재사용할 것.
3. **매칭 실패 건 override** — 법인명 4~5건을 seed JSON으로 커밋할지, 관리자 UI에서 수동 매핑할지.
   1차 구현에서는 `unmatched` 노출까지만 하고 override는 후속으로 미루는 것을 권한다.
4. **가격 게시 경계 목록** — 문서상 1·2·9·12·16·19시 전부를 경계로 쓴다(§6-0).
   예산이 문제가 되면 `[9,12,16,19]`로 줄일 수 있게 상수로 분리해 둘 것. 실사용 패턴을 보고 조정한다.

---

## 9. 작업 순서 (PR 분할)

| # | 범위 | 비고 |
|---|---|---|
| 1 | **§3 오피넷 호출 절감** | 독립적. 먼저 머지. 실제 키로 3개 정렬 모드 확인 필수 |
| 2 | §4 스키마 + 마이그레이션, §5 설정 키·게이팅, §6 온디맨드 갱신, §7-1 백엔드 | **끈 상태에서 외부 호출 0건**을 먼저 확인한 뒤, 켜고 76건이 채워지는지 확인. `node-cron` 등록 없음 |
| 3 | §7-2 프론트 화면 + 진입점 + i18n + 통합 설정 토글 | 전 유종 가격 표시·강조, `status` 재조회 처리 포함 |
| 4 | 문서 갱신 | `docs/INTEGRATIONS.md`에 코나카드 섹션 신설(§2-1 내용), 오피넷 섹션에 `searchByName`/좌표 파싱 반영, `README.md`/`README.en.md` 기능 목록, `docs/PROGRESS.md` |

각 PR은 `master`에서 브랜치를 따고, 저장소의 기존 커밋 컨벤션(`feat(api):`, `fix(web):` 등)을 따른다.
버전 범프는 실제 릴리스를 자를 때만 한다.

## 10. 테스트

`vitest` 기준. 외부 API는 `fetch`를 목으로 대체하고, **순수 함수 위주로 테스트한다.**

- `normalizeStationName` — `(주)`/`주식회사`/`셀프`/괄호/공백 제거, 2글자 미만 처리
- 매칭 로직 — searchByName 0건/1건/다건, 좌표 폴백 임계값(150m) 경계, `LPG_YN` 불일치,
  **`opinetSigunCds` 빈 배열 시 좌표 없으면 name 매칭 거부**, **5609 → aroundAll `K015`**
- **`isCheonanCardEnabled()`** — §5-1 두 조건 AND, `CHEONAN_CARD_ENABLED`가 `"false"`/미설정/임의 문자열일 때 false
- **게이팅** — 비활성 상태에서 `ensureFreshMerchants()`/`ensureFreshPrices()`를 불러도
  `fetch`가 **0회** 호출되는지 (기본 비활성화의 핵심 보장이므로 반드시 테스트한다)
- **`lastPublishBoundary` / `isPriceCacheStale`** — 순수 함수.
  경계 직전·직후, 자정 넘김(19시 경계 → 다음날 1시), **`TZ=UTC` 환경에서도 KST 기준으로 판정되는지**
- **동시 실행 가드** — `ensureFreshMerchants()`/`ensureFreshPrices()`를 동시에 3번 호출해도
  각각 1회만 실행되는지. `merchantSyncStartedAt`/`priceSyncStartedAt`이 10분 이내면 새로 시작하지 않고,
  10분이 지났으면 재시작하는지
- **`status` 판정** — 캐시 없음→`preparing`, 낡음→`refreshing`(+낡은 데이터 동봉), 신선→`fresh`
- **갱신 실패 시** `pricesSyncedAt`이 갱신되지 않아 다음 조회가 재시도하는지
- 가맹 해지 시 **orphan `CheonanCardStationPrice`가 삭제되는지**
- `GET /api/cheonan-card/stations`
  - 유종별 `bizType` 필터
  - **`prices` 배열에 취급 유종이 전부 담기고 미취급 유종은 빠지는지**
  - **`primaryPrice` 추출과 `primaryPrice: null` 행의 정렬 위치(뒤)**
  - `lat`/`lon` 없을 때 `sort=distance` → `price` 폴백, `maxKm` 필터
- 가격 동기화 — `OIL_PRICE[]`의 전 유종이 upsert되고, 사라진 유종 행이 삭제되는지
- §3 리팩터링 — `aroundAll`/`lowTop10` 응답에서 좌표가 올바르게 파싱·변환되는지
  (`apps/api/src/lib/geo.test.ts`의 KATEC 변환 테스트 패턴 참고)

기존 테스트 파일 위치 규약: 소스와 같은 디렉터리의 `*.test.ts`.

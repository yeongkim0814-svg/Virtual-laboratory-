# 가상 물리·화학 실험실

## 목표
태블릿 브라우저에서 실행되는 1인칭 3D 실험실. 장비를 배치/회전하고
수치를 조정하며, 장비 간 물리 상호작용을 실시간으로 확인한다.
새 장비를 계속 추가할 수 있는 확장 구조가 최우선이다.
장기 방향(참고): 실험실 안의 모든 물체에 실제 물리 법칙이 적용되도록 한다.
(각 규칙은 아래 테스트 규칙대로 제안 → 승인 → 구현)

## 기술 스택
- TypeScript + Vite + Three.js + Vitest (UI 프레임워크 없음)
- 배포: GitHub Pages (GitHub Actions에서 테스트 통과 후 배포)
- 사용자는 태블릿만 사용 → 모든 조작은 터치 기준

## 조작
- 왼쪽 화면: 가상 조이스틱(이동) / 오른쪽 화면: 드래그(시점 회전)
- 버튼 최소 크기 44px, 멀티터치 동시 입력 지원(이동+회전 동시)
- UI는 당분간 단순하게 유지 (추후 사용자가 디자인 여부 결정)

## 아키텍처 규칙
1. 장비 = 모델(.glb, 없으면 placeholder) + 정의(JSON) + 동작(모듈). 서로 독립.
2. 장비끼리 직접 참조 금지. 모든 상호작용은 "신호 채널"을 통해서만 이루어진다.
   채널: Light, Electric, Mechanical, Thermal, Chemical (필요 시 추가)
3. 장비는 자신이 사용하는 채널과 포트(입력/출력 좌표, JSON)만 선언한다.
   새 장비 추가 시 기존 장비 코드를 수정하지 않아야 한다.
4. 조정 가능한 수치는 params로 선언하고, 슬라이더 UI는 params에서 자동 생성한다.
5. 물리 계산은 해석식. 식마다 주석으로 (출처 / 가정 / 유효범위) 명시.
   단위는 SI, 변수명에 단위 표기(wavelengthM, gapM).

## 테스트 규칙
- 모든 물리 규칙에 단위 테스트를 작성한다.
- 기대값은 사용자가 손계산으로 제공하거나 승인한 값만 사용한다.
- 테스트가 실패하면 테스트가 아니라 구현을 수정한다.
  (기대값이 틀렸다고 판단되면 수정하지 말고 근거와 함께 보고한다.)
- 새 물리 규칙은 테스트를 먼저 제안하고, 사용자 승인 후 구현한다.

## 에셋 규칙 (모든 시각 요소는 사용자가 직접 디자인해 교체한다)
- 화면의 모든 3D 시각 요소(방, 테이블, 장비, 이펙트)는 assets.json의
  이름으로만 참조한다. 값이 null이면 단순 placeholder 도형을 표시한다.
- 코드에 색상·모양·크기를 하드코딩하지 않는다.
- 에셋 교체는 assets.json 수정만으로 끝나야 한다.

## 그래픽 스타일: 스타일라이즈드 로우폴리 (Sea of Thieves 풍 절충안)
- 장비당 약 3,000~8,000 삼각형
- 부드러운 셰이딩 + 모서리 베벨, 과장되고 묵직한 비례, 낡은 흔적(긁힘·녹청)
- 재질: 모델당 재질 1개 + 손그림(hand-painted) 텍스처 1장(1024² 이하), 노멀맵 없음
- 팔레트: 낡은 황동, 청록 녹청, 따뜻한 짙은 나무, 짙은 철, 포인트 짙은 빨강
- 모델 규약: 1단위 = 1m, +Y 위, 앞 = +Z, 원점은 바닥 중앙
- 기능 면(빛 출구·조준 영역·스크린 면)은 평평하고 장식 없이. 전원선·플러그는 모델에 넣지 않음(코드가 생성)
- 발광(emissive)은 레이저·결과 무늬·켜진 LED 에만 사용(코드가 그림 → 모델에는 발광 없음)
- 그림자/후처리는 기본 OFF (태블릿 30fps 우선)
- placeholder 도형은 지금처럼 플랫 셰이딩 단색 유지

## 저장/불러오기
- 실험 세팅(장비 종류, 위치, 회전, 수치)은 JSON으로 직렬화 가능해야 한다.

## 성능 기준
- 태블릿에서 30fps 이상. 무늬 계산은 셰이더(GPU)에서 처리.

## 작업 방식
- 한 번에 한 단계만 구현. 요청 범위를 벗어난 기능 추가 금지.
- 각 단계 끝에 "무엇을 만들었고, 어떻게 확인하는지" 요약.

## 현재 구조 (구현 메모)
- `public/assets.json`
  - `assets`: 에셋 이름 → `.glb 경로` 또는 `null`(placeholder)
  - `placeholders`: null 일 때의 외형(색, 두께) / `environment`: 배경색·조명 / `placementPreview`: 배치 미리보기 색·투명도
  - `wiring`: 케이블 색·굵기, 포트 탭 반경, 고른 포트 확대 배율 / 포트 표시 에셋 = `port-marker` (평소 숨김, 고른 포트에만 표시)
- `public/lab.json` — 방 크기, 가구(furniture: 테이블·찬장 위치·크기), 고정 설비(fixtures: 테이블 콘센트), 격자(cellSizeM), 케이블(최대 길이 등), 플레이어(시작 위치·눈높이·반지름·속도), 카메라, 조작 감도
- `src/assets/` — AssetRegistry(이름 → Object3D), placeholder 상자(원점=바닥 중앙)
- `src/room/` — roomLayout(바닥·벽 배치, 벽 충돌; 순수 함수), buildRoom
- `src/input/` — controlMath(순수 함수), touchControls(Touch Events, 멀티터치)
- `src/player/` — 1인칭 카메라
- `src/signal/` — channels(채널 목록·Signal 타입), signalBus(라우터 기반 전달, 채널별 Router 교체 가능),
  cables(케이블 규칙·케이블 라우터, 순수 함수), cableRoute(케이블 경로: 장비 원을 피해 바닥으로, 순수 함수),
  cableLayout(매 프레임 경로 갱신·최대 길이 넘으면 빠짐), cableView(경로를 튜브로 그리기)
  케이블은 면(바닥·테이블·선반) 위로 장비·찬장·테이블 다리를 피해 가고, 가장자리를 (반지름 + 여유)만큼 넘은 뒤
  비스듬히 바닥으로 늘어뜨린다(선반은 앞으로만). 가구는 케이블 반지름만큼 넓혀 검사(묻힘 방지)
- `src/equipment/` — registry(devices/ 자동 수집), equipmentManager(프레임 갱신, 1프레임 지연 전달), setup(세팅 JSON 저장/불러오기), ports(로컬→월드)
- `src/geom/rect.ts` — 회전된 직사각형(안/밖, 셀 포함, 선분 교차, 가장 가까운 변, 밀어내기; 순수 함수)
- `src/room/furnitureParts.ts` — 가구 부품(테이블: 상판·다리, 찬장: 판·선반), 선반 높이, 다리 자리(순수 함수)
- `src/room/surfaces.ts` — 놓을 수 있는 면(바닥 + 테이블 윗면 + 찬장 선반), 면별 허용 셀·빈 높이·케이블 나가는 변
- `src/physics/optics.ts` — 광학(승인 규칙): R1 광선 직진·교차(traceRay), R2 레이저 켜짐(정격 5 V 이상),
  R4 파장 → 색(Bruton 1996 근사). R3 공기 중 손실 없음(라우터가 신호 값 그대로 전달)
- `src/signal/lightRouter.ts` — Light 채널 라우터: 출구에서 광선 추적 → 처음 닿는 받는 면(Light 입력)에 전달,
  장비 몸체·가구·벽은 막음. 이번 프레임 빛 목록(beams) 기록
- `src/interaction/laserView.ts` — 빛 선·빛 점 그리기(색 = 파장, 외형 = assets.json laserBeam)
- `src/physics/doubleSlit.ts` — 이중 슬릿(승인 규칙): R5 I/I₀ = cos²(πd sinθ/λ)·sinc²(πa sinθ/λ), sinθ = y/√(y²+L²),
  R6 투과 P_out = P_in·2a/D(빔 지름 1 mm). R7 조준 영역에 닿으면 두 슬릿 가운데를 지난다고 봄, L = 가운데 광선 거리
  비스듬한 입사: R5′ s = sinθ − sinθᵢ 로 바꾼 같은 식(sin = 슬릿 간격 방향 성분), R6′ × cosθᵢ
  (cosθᵢ 는 빛 라우터가 받는 포트에 extraValues.incidenceCos 로 붙여 줌)
- `src/interaction/screenOverlay.ts` — 스크린 면(displaysLight)의 1 mm 눈금
- `src/interaction/patternView.ts` — 간섭 무늬(R5′ 를 GLSL 로 옮김, 셰이더는 단위 테스트 불가 → 코드 리뷰로 같은 식 확인).
  슬릿을 지난 빛이 닿은 면 어디든(스크린·벽·바닥·가구·장비 옆면) 그린다. 픽셀의 월드 위치 → 슬릿 방향으로 sinθ 계산
  → 기울어진 면도 정확. 닿은 면 사각형 = optics.hitSurface. 색 = 파장 색 × I/I₀(R8), 세로 = 빔 지름 띠.
  한계: 슬릿 → 무늬 사이 장애물의 부분 가림은 다루지 않음(가운데 광선만 추적)
- 장비: power-supply(직류 전원), laser(전기 입력 → 빛 출력, +z), double-slit(뒤 조준 영역 2×2 cm → 앞으로 슬릿 빛),
  screen(빛 받는 면 +z, 세기·파장 표시, 무늬·눈금), test-*(채널 확인용)
- Light 포트: 정의에 directionLocal(단위벡터), 입력은 faceSizeM. 케이블로 잇지 않음.
  빛을 지나보내는 장비(슬릿)의 출력은 `continuesFrom: "<입력 id>"` → 입력 면에 닿은 광선을 같은 직선으로 잇는다
  (출발점 = 그 직선이 출력 면과 만나는 점). 장비를 돌려도 빛이 꺾이지 않음(R1).
  params/readouts 의 displayScale: 값은 SI 로 저장, 표시는 × 배율(예: 파장 m → nm 1e9)
- 광축 높이: 광학 장비의 빛 출구·받는 면 중심은 놓인 면에서 0.10 m(레이저·스크린은 바닥부터 0.10;
  슬릿처럼 클램프에 끼우는 장비는 클램프 자리(0.08) + 장비 자기 축(0.02) = 0.10 으로 나눠 맞춤)
- `src/grid/grid.ts` — 바닥 격자(셀 중심 = k·cellSizeM), 원 밑넓이 셀(원이 조금이라도 들어가는 셀, 보수적), 방 안·겹침 검사(순수 함수)
- `src/equipment/footprint.ts` — 모델이 내접하는 밑면 원 반지름(모델 꼭짓점 중 수직축에서 가장 먼 수평 거리)
- `src/hand/` — hand(1인칭 손 뷰모델: 오른손·왼손, 집기·들기·놓기, Minecraft 식 휘두르기, 흔들림), handMath(순수 함수)
  두 손 장비는 집을 때 grip 을 잇는 선이 몸 좌우와 나란하도록 손 안에서 돈다(두 손 겹침 방지)
- `src/interaction/` — interaction(탭으로 집기, 화면 중앙 시선으로 배치 후보, 탭으로 놓기), placementPreview(반투명 장비 + 밑넓이 셀)
- `src/ui/holdControls.ts` — 들고 있을 때 조준점, 안내 메시지, 앉기 버튼(눈높이 lab.json player.crouchEyeHeightM)
- `src/interaction/rotateGizmo.ts` — 회전 중인 장비 둘레 고리
- 가구(lab.json furniture): 테이블 윗면, 찬장(문 없는 선반형 보관함, 이웃한 두 벽을 가득) 선반 = 장비를 놓는 면.
  선반 사이 빈 높이보다 큰 장비는 못 놓음. 찬장 장비도 일반 장비처럼 집고 놓는다(따로 소환·재고 없음).
  조준이 면 가장자리에 걸리면 밑넓이가 면 안에 들어가는 가까운 셀로 끌어당김.
  가구 모양은 assets.json 의 type 이름(table, cupboard). 없으면 lab.json 치수로 만든 부품 상자.
  테이블 밑은 바닥 케이블이 지나감(다리만 피함). 플레이어는 가구를 통과하지 못함
- 장비 배치 규칙: 위치는 셀 중심에만, 밑넓이(모델이 내접하는 원 → 격자) 셀이 하나라도 겹치거나 방 밖이면 배치 불가.
  셀이 안 겹치면 모델끼리도 절대 안 겹친다(원 ⊂ 셀).
  들고 있는 동안 회전 불가 → 놓인 장비를 길게 누른 채(controls.longPressS) 좌우로 밀면 그 자리에서 회전,
  손을 떼면 끝(1° 단위, 15° 배수 ±3° 에 붙음, 회전 고리 = assets.json rotateGizmo). 패널에는 각도 없음
- `src/ui/equipmentPanel.ts` — 장비 목록·readouts 표시(보기 전용)·저장/불러오기. 수치는 조정하지 않음(아래 참고)
- `src/ui/paramsPopup.ts` / `src/ui/paramControls.ts` — 장비를 놓은 뒤 두 번 탭하면 뜨는 수치 조정 창(그 장비 하나,
  화면 가운데). params 슬라이더·스위치 UI는 paramControls 에 있고 패널·팝업이 같이 씀
  (params 있는 장비를 탭하면 곧바로 집지 않고 controls.doubleTapS 만큼 기다렸다가 두 번째 탭이 없으면 집음.
  수치 없는 장비·고정 장비는 그대로 즉시 집힘/안내만)
- `public/setups/default.json` — 시작 시 불러오는 세팅

### 새 장비 추가 방법 (기존 코드 수정 없음)
1. `src/equipment/devices/<type>/definition.json` — type(=폴더 이름), label, asset, hold(hands: 1|2, grips: 손바닥이 닿는 점들)(밑넓이는 모델에서 자동 계산), channels, ports, params, readouts
2. `src/equipment/devices/<type>/behavior.ts` — `export default { type, create: () => ({ update(ctx) {…} }) }`
   - ctx.inputs[포트id] 로 받고, ctx.emit(포트id, 값) 으로 내보내고, ctx.setReadout 으로 표시
3. `public/assets.json` — assets 에 `"<asset>": null`, placeholders 에 `{ color, sizeM }`
4. 세팅 JSON(`public/setups/*.json`)에 배치
- 포트 연결: 케이블. 빈손으로 포트 탭 → 다른 포트 탭 = 연결(같은 채널, out↔in, 다른 장비, 포트당 1개).
  꽂힌 포트를 탭하면 뽑기. 세팅 JSON(version 2)의 cables 에 저장. 들고 있는 동안 신호만 끊김(케이블은 꽂힌 채)
  케이블 = 늘어나지 않는 줄(lab.json cable.maxLengthM). 장비를 피해 가는 경로가 최대 길이보다 길면
  연결 불가 / 연결 중이면 빠짐. 용도: 전원선·센서 연결선(회로 설계용 아님)
- 전원 코드(장비에 달린 선): Electric 입력 포트에 `cord: { plug: "mains" | "dc" }` → 장비에서 선이 나와
  끝에 플러그(에셋 `plug`)가 달림. 안 꽂혀 있으면 lab.json cable.looseRestM 만큼 바닥면에 늘어져 있음.
  플러그 탭 = 뽑기/꽂기 시작. 꽂는 곳 = Electric 출력 포트의 `socket` 종류가 같아야 함(plug-kind 오류)
  현재: 테이블 콘센트(socket mains, 220 V) ← 전원 장치 mains 코드, 레이저 mains 코드
  직류 전원 장치(R9 CV/CC, 설정 전압·전류 한계): mains 에 전압이 있을 때만 출력, out(socket dc) 은 추후 LED 등 부하용.
  부하는 `ctx.reply(입력 포트, {thresholdV, seriesOhm})` 로 자기 V–I 특성(구간 선형)을 케이블을 거꾸로 알린다 →
  전원 장치는 `ctx.replies.out` 으로 받아 동작점(R9/R10)을 정하고 {voltageV, currentA} 를 내보낸다(한 프레임 늦게)
- LED(R10): dc 코드, 색 스위치(630/525/470 nm, 바꾸면 새 LED 로 교체), V_F = hc/(eλ), R_D 10 Ω, η 0.2,
  정격 20 mA 초과 시 탐(끊긴 회로). readout options 로 상태 이름 표시(꺼짐/켜짐/탐)
- 정의의 `glow`: 스스로 빛나는 부분. assets.json "<asset>-glow" 를 붙이고 색 = 파장 색, 밝기 = √(빛 출력 / fullPowerW)(보기용)
- params 에 `options: [{value, label}]` 가 있으면 스위치(버튼 묶음) UI. 값은 숫자(SI)로 저장.
  레이저 스위치 = wavelengthM: OFF(0) / 650 nm / 532 nm (R2′)
- 고정 설비(fixtures): lab.json `fixtures`(id·type·위치·회전). 정의에 `"fixed": true` 인 장비만 가능.
  집기·회전 불가, 세팅 저장 제외(꽂힌 케이블은 저장). 세팅 cables 에서 fixture id 로 참조
- 클램프(실험용 받침): 슬릿·LED 처럼 작은 장비는 바닥·테이블에 직접 못 놓고(`mountOnly: true`) 클램프
  (`mounts: [{id, positionM}]`) 등에만 끼운다.
  - 들고 mountOnly 장비를 화면 중앙으로 클램프의 빈 자리(mounts, 보이지 않는 탭 대상)에 겨누면 배치 후보
    (격자 셀은 없음 — 칸을 새로 차지하지 않는다). 탭하면 끼움. 이미 찼으면 mount-occupied
  - 자리 = 클램프 위치 + mounts.positionM(회전 반영), 장비 자기 회전은 독립(끼운 채로도 길게 누르기 회전 가능
    — R5′ 슬릿을 돌리는 실험 때문에 일부러 클램프 회전과 안 묶음)
  - 클램프에 뭔가 끼워져 있으면(`manager.isMounted`) 그 클램프는 집을 수 없음("먼저 끼운 장비를 빼세요")
  - 끼운 장비를 집으면(setHeld true) mountedOn 이 곧바로 비워짐(자리가 바로 풀림) — 다시 놓으려면 다시 끼워야 함
  - 세팅 JSON: mountOnly 장비는 `mountedOn: {deviceId, mountId}` 필수(parseSetup 이 참조·중복 자리 검사).
    저장된 positionM 은 무시되고 불러올 때 클램프 자리로 다시 계산(EquipmentManager.validate 2단계: 격자에
    놓이는 장비 → 끼워진 장비 순)
  - 클램프 자신은 물리에 안 들어감(bodyBoxes 의 빛 차단, cableLayout 의 케이블 장애물 모두 제외) — 받침일
    뿐이라고 봄. 안 그러면 끼운 장비(클램프와 같은 xz)로 가는 빛·케이블이 클램프 몸체에 막혀 버림
- test-source / test-probe 는 채널 확인용(물리 없음). 실제 장비가 생기면 삭제 가능
- 모델: `public/models/*.glb` (assets.json 에서 경로로 연결). `tests/models.test.ts` 가 규약 검사
  (원점 = 바닥 중앙, 8,000 삼각형 이하, 빛 출구 = 모델 앞 끝). 물리(빛 차단 상자·격자 발판)는 모델의 실제
  바운딩 박스로 정해지므로, 장식(리벳·테두리 등)은 기존 placeholder 크기(assets.json placeholders.*.sizeM)를
  절대 넘지 않게 만든다(넘으면 기존 세팅의 장비 간격·차단 거리가 달라짐). `tools/models/` = 모델 제작
  스크립트(앱 코드 아님):
  - laser.mjs = 사용자 도면(스팀펑크 레이저)을 단순 부품으로 근사 → `node tools/models/laser.mjs`
  - glbWriter.mjs: `buildGlb`(구 방식, 재질 여러 개·단색·평면, laser·clamp 가 씀) / `buildTexturedGlb`
    (새 방식, 재질 1개 + 텍스처 1장, smooth 플래그로 부품마다 매끈한 곡면 ↔ 평평한 모서리 선택, double-slit 이 씀)
  - atlas.mjs: 손그림 느낌 색상 아틀라스를 절차적으로 그림(그러데이션 + 잡음 + 얼룩, 시드 고정)
  - png.mjs: 외부 이미지 라이브러리 없이 PNG 인코딩(node zlib 만 사용) — 아틀라스를 텍스처로 굽는 데 씀
  - doubleSlit.mjs = 이중 슬릿판(0.044 × 0.04, 레이저 몸통 지름 정도로 작게 — 클램프에 끼워 쓰므로 자기
    받침 없음) → `node tools/models/doubleSlit.mjs`. 판 두께 ±0.005 는 물리 그대로, 포트 y = 0.02(판 세로
    가운데, 클램프 자리 0.08 과 더해 광축 0.10). 장식(리벳·테두리)은 판 두께 안쪽에 파묻음
  - led.mjs = LED 실제 부품 모양(다리 2 + 몸통 + 둥근 머리, 상자 아님) + led-glow(발광 머리 구슬) →
    `node tools/models/led.mjs`
  - clamp.mjs = 실험용 클램프(받침대+기둥+열린 고리, 간단한 도형) → `node tools/models/clamp.mjs`.
    mounts "slot" = (0, 0.08, 0) — 위 클램프 절 참고
- 명령: `npm run dev` / `npm test` / `npm run build`
- 배포: main push → Actions 테스트·빌드 → Pages (https://yeongkim0814-svg.github.io/Virtual-laboratory-/)

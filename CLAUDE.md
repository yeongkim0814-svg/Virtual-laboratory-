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

## 그래픽 스타일: 로우폴리
- 장비당 약 2,000~5,000 삼각형, 플랫 셰이딩, 단색 재질
- 모델 규약: 1단위 = 1m, 원점은 바닥 중앙
- 발광(emissive)은 레이저와 결과 무늬에만 사용
- 그림자/후처리는 기본 OFF

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
  - `wiring`: 케이블 색·굵기, 포트 탭 반경, 고른 포트 확대 배율 / 포트 표시 에셋 = `port-marker`
- `public/lab.json` — 방 크기, 가구(furniture: 테이블·찬장 위치·크기·찬장 재고), 격자(cellSizeM), 케이블(최대 길이 등), 플레이어(시작 위치·눈높이·반지름·속도), 카메라, 조작 감도
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
- `src/grid/grid.ts` — 바닥 격자(셀 중심 = k·cellSizeM), 원 밑넓이 셀(원이 조금이라도 들어가는 셀, 보수적), 방 안·겹침 검사(순수 함수)
- `src/equipment/footprint.ts` — 모델이 내접하는 밑면 원 반지름(모델 꼭짓점 중 수직축에서 가장 먼 수평 거리)
- `src/hand/` — hand(1인칭 손 뷰모델: 오른손·왼손, 집기·들기·놓기, Minecraft 식 휘두르기, 흔들림), handMath(순수 함수)
- `src/interaction/` — interaction(탭으로 집기, 화면 중앙 시선으로 배치 후보, 탭으로 놓기), placementPreview(반투명 장비 + 밑넓이 셀)
- `src/ui/holdControls.ts` — 들고 있을 때 조준점, 안내 메시지
- 가구(lab.json furniture): 테이블 윗면, 찬장(문 없는 선반형 보관함, 이웃한 두 벽) 선반 = 장비를 놓는 면.
  선반 사이 빈 높이보다 큰 장비는 못 놓음. 찬장 장비도 일반 장비처럼 집고 놓는다(따로 소환·재고 없음).
  조준이 면 가장자리에 걸리면 밑넓이가 면 안에 들어가는 가까운 셀로 끌어당김.
  가구 모양은 assets.json 의 type 이름(table, cupboard). 없으면 lab.json 치수로 만든 부품 상자.
  테이블 밑은 바닥 케이블이 지나감(다리만 피함). 플레이어는 가구를 통과하지 못함
- 장비 배치 규칙: 위치는 셀 중심에만, 밑넓이(모델이 내접하는 원 → 격자) 셀이 하나라도 겹치거나 방 밖이면 배치 불가.
  셀이 안 겹치면 모델끼리도 절대 안 겹친다(원 ⊂ 셀).
  들고 있는 동안 회전 불가 → 놓은 뒤 패널 각도 슬라이더(-180~180°, 1°)
- `src/ui/equipmentPanel.ts` — 장비 목록, params 슬라이더 자동 생성, readouts 표시, 저장/불러오기
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
- 찬장(예정): 장비를 EquipmentManager 에 새로 만든 뒤 `hand.pick()` 을 부르면 손에 들린다
- test-source / test-probe 는 채널 확인용(물리 없음). 실제 장비가 생기면 삭제 가능
- 명령: `npm run dev` / `npm test` / `npm run build`
- 배포: main push → Actions 테스트·빌드 → Pages (https://yeongkim0814-svg.github.io/Virtual-laboratory-/)

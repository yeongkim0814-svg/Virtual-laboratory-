# 가상 물리·화학 실험실

## 목표
태블릿 브라우저에서 실행되는 1인칭 3D 실험실. 장비를 배치/회전하고
수치를 조정하며, 장비 간 물리 상호작용을 실시간으로 확인한다.
새 장비를 계속 추가할 수 있는 확장 구조가 최우선이다.

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
- `public/lab.json` — 방 크기, 격자(cellSizeM), 플레이어(시작 위치·눈높이·반지름·속도), 카메라, 조작 감도
- `src/assets/` — AssetRegistry(이름 → Object3D), placeholder 상자(원점=바닥 중앙)
- `src/room/` — roomLayout(바닥·벽 배치, 벽 충돌; 순수 함수), buildRoom
- `src/input/` — controlMath(순수 함수), touchControls(Touch Events, 멀티터치)
- `src/player/` — 1인칭 카메라
- `src/signal/` — channels(채널 목록·Signal 타입), signalBus(포트 위치·채널 기반 라우팅, 채널별 Router 교체 가능)
- `src/equipment/` — registry(devices/ 자동 수집), equipmentManager(프레임 갱신, 1프레임 지연 전달), setup(세팅 JSON 저장/불러오기), ports(로컬→월드)
- `src/grid/grid.ts` — 바닥 격자(셀 중심 = k·cellSizeM), 원 밑넓이 셀, 방 안·겹침 검사(순수 함수)
- `src/hand/` — hand(1인칭 손 뷰모델: 오른손·왼손, 집기·들기·놓기·떨어뜨리기, Minecraft 식 휘두르기, 흔들림), handMath(순수 함수)
- `src/interaction/` — interaction(탭으로 집기, 화면 중앙 시선으로 배치 후보, 탭으로 놓기), placementPreview(반투명 장비 + 밑넓이 셀)
- `src/ui/holdControls.ts` — 들고 있을 때 놓기(떨어뜨리기) 버튼, 조준점, 안내 메시지
- 장비 배치 규칙: 위치는 셀 중심에만, 밑넓이(원) 셀이 하나라도 겹치거나 방 밖이면 배치 불가.
  들고 있는 동안 회전 불가 → 놓은 뒤 패널 각도 슬라이더(-180~180°, 1°)
- 떨어뜨리기 낙하: 현재 비물리적 보간. 자유낙하 규칙은 사용자 승인 후 교체(hand.ts TODO)
- `src/ui/equipmentPanel.ts` — 장비 목록, params 슬라이더 자동 생성, readouts 표시, 저장/불러오기
- `public/setups/default.json` — 시작 시 불러오는 세팅

### 새 장비 추가 방법 (기존 코드 수정 없음)
1. `src/equipment/devices/<type>/definition.json` — type(=폴더 이름), label, asset, hold(hands: 1|2, grips: 손바닥이 닿는 점들), footprint(radiusM: 밑넓이 원 반지름), channels, ports, params, readouts
2. `src/equipment/devices/<type>/behavior.ts` — `export default { type, create: () => ({ update(ctx) {…} }) }`
   - ctx.inputs[포트id] 로 받고, ctx.emit(포트id, 값) 으로 내보내고, ctx.setReadout 으로 표시
3. `public/assets.json` — assets 에 `"<asset>": null`, placeholders 에 `{ color, sizeM }`
4. 세팅 JSON(`public/setups/*.json`)에 배치
- 포트 연결: 같은 채널의 out·in 포트가 lab.json `signal.contactToleranceM` 이내면 연결(접촉 라우터)
- 포트 자동 스냅은 격자 배치와 충돌해 제거됨. 포트는 격자·각도가 맞을 때만 맞닿는다
- 찬장(예정): 장비를 EquipmentManager 에 새로 만든 뒤 `hand.pick()` 을 부르면 손에 들린다
- test-source / test-probe 는 채널 확인용(물리 없음). 실제 장비가 생기면 삭제 가능
- 명령: `npm run dev` / `npm test` / `npm run build`
- 배포: main push → Actions 테스트·빌드 → Pages (https://yeongkim0814-svg.github.io/Virtual-laboratory-/)

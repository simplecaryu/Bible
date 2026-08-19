# 관주 및 Strong 사전 출처

배포 데이터베이스의 관주 자료는 *Treasury of Scripture Knowledge*의 공개 도메인
자료를 `narthur/tsk-cli` 형식으로 정규화한 업스트림 스냅샷에서 가져옵니다.

고전 Strong 사전 보강 자료는 Open Scriptures Strong's Dictionaries의 디지털
데이터를 사용합니다. 원 사전 내용은 공개 도메인이며 디지털 데이터의 라이선스와
고지는 원 배포처를 따릅니다.

- 통합 스냅샷: `Newhyuck2/Bible` revision
  `1abac050b9aa1153512f4dee9fbc83c93af63ae0`
- TSK 형식 출처: <https://github.com/narthur/tsk-cli>
- Strong 디지털 데이터 출처: <https://github.com/openscriptures/strongs>

앱은 각 자료의 이름, 라이선스, 리비전과 URL을 생성된 SQLite의
`content_sources`에 보존하고 해당 기능 화면에 출처를 표시합니다.

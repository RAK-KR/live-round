// 캠페인 상대 — 가면(mask), 가면색(mc), 눈빛(ec), 난이도(lv), 라운드 구성
export const PROLOGUE = [
  '눈을 뜨자 지하실이었습니다. 축축한 벽, 흔들리는 전구 하나.',
  '테이블 위에는 산탄총 한 자루. 그리고 맞은편에, 가면을 쓴 무언가가 앉아 있습니다.',
  '문은 다섯 개. 하나를 지날 때마다 테이블이 바뀝니다.',
];
export const ENDING = [
  '마지막 가면이 테이블 위로 떨어집니다. 가면 뒤에는 아무것도 없었습니다.',
  '계단 위로 희미한 빛이 새어 들어옵니다.',
  '당신은 일어섭니다. 테이블 위에는 여전히, 장전된 총이 남아 있습니다.',
];
export const STAGES = [
  {
    name: '문지기', mask: 'plain', mc: '#d9d3c5', ec: '#ff2a1a', weep: true, lv: 'easy',
    rounds: [{ hp: 2, items: 0 }, { hp: 3, items: 1 }, { hp: 4, items: 2, sudden: true }],
    intro: ['“문이 닫혔습니다. 열쇠는 이 테이블 위에 있지요.”', '“한 발씩. 순서대로. 그게 규칙입니다.”'],
    taunt: ['떨리십니까?', '다음은 어느 쪽일까요.', '숨소리가 크군요.'],
    hurt: ['...아프군요.', '좋습니다. 계속하지요.'],
    win: ['자리가 하나 비었군요.', '다음 손님을 부르겠습니다.'],
    lose: ['...다음 문으로 가십시오.'],
  },
  {
    name: '재봉사', mask: 'stitch', mc: '#cbbfae', ec: '#b8ff3a', lv: 'normal',
    rounds: [{ hp: 3, items: 1 }, { hp: 4, items: 2 }, { hp: 5, items: 3, sudden: true }],
    intro: ['“입을 꿰매면 거짓말을 못 하지.”', '“당신 입은... 아직 열려 있군.”'],
    taunt: ['한 땀, 한 땀.', '실이 모자라.', '조용히.'],
    hurt: ['실밥이 터졌군.', '흐음.'],
    win: ['이제 조용하군.'],
    lose: ['...실이 끊어졌어.'],
  },
  {
    name: '웃는 자', mask: 'smile', mc: '#e4ddcf', ec: '#ff8a1a', lv: 'normal',
    rounds: [{ hp: 3, items: 2 }, { hp: 4, items: 3 }, { hp: 5, items: 4, sudden: true }],
    intro: ['“웃어. 어차피 둘 중 하나는 웃게 돼.”', '“나는 항상 웃고 있지.”'],
    taunt: ['하하.', '재밌지 않아?', '웃어 봐.'],
    hurt: ['하... 하하.', '그것도 웃기네.'],
    win: ['봐, 웃고 있잖아.'],
    lose: ['...안 웃겨.'],
  },
  {
    name: '외눈', mask: 'cyclops', mc: '#bab3a7', ec: '#5ad8ff', lv: 'hard',
    rounds: [{ hp: 4, items: 2 }, { hp: 5, items: 3 }, { hp: 6, items: 4, sudden: true }],
    intro: ['“하나면 충분하다. 보는 데에는.”', '“나는 약실 안을 본다.”'],
    taunt: ['보인다.', '네 손이 떨린다.', '계산은 끝났다.'],
    hurt: ['계산 착오.', '...흥미롭군.'],
    win: ['예상대로.'],
    lose: ['보지 못했다.'],
  },
  {
    name: '주인', mask: 'host', mc: '#c9ae74', ec: '#ff1414', lv: 'nightmare',
    rounds: [{ hp: 4, items: 3 }, { hp: 5, items: 4 }, { hp: 6, items: 4, sudden: true }],
    intro: ['“어서 오게. 이 집의 주인일세.”', '“모든 문은 이 테이블로 이어지지.”', '“앉게. 마지막 판이네.”'],
    taunt: ['서두를 것 없네.', '이 집은 늘 이긴다네.', '자네 차례일세.'],
    hurt: ['훌륭하군.', '오랜만에 피를 보는군.'],
    win: ['자네도 이제 이 집의 일부일세.'],
    lose: ['...문은, 열려 있네.'],
  },
];

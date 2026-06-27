export const IS_MOCK = !process.env.NEXT_PUBLIC_INSFORGE_URL

export const samplePlayers = [
  { id: 'p1',  real_name: '김민준', summoner_name: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'p2',  real_name: '이서준', summoner_name: null, created_at: '2026-01-02T00:00:00Z' },
  { id: 'p3',  real_name: '박도윤', summoner_name: null, created_at: '2026-01-03T00:00:00Z' },
  { id: 'p4',  real_name: '정시우', summoner_name: null, created_at: '2026-01-04T00:00:00Z' },
  { id: 'p5',  real_name: '최주원', summoner_name: null, created_at: '2026-01-05T00:00:00Z' },
  { id: 'p6',  real_name: '윤현우', summoner_name: null, created_at: '2026-01-06T00:00:00Z' },
  { id: 'p7',  real_name: '임지호', summoner_name: null, created_at: '2026-01-07T00:00:00Z' },
  { id: 'p8',  real_name: '한준서', summoner_name: null, created_at: '2026-01-08T00:00:00Z' },
  { id: 'p9',  real_name: '오건우', summoner_name: null, created_at: '2026-01-09T00:00:00Z' },
  { id: 'p10', real_name: '신예준', summoner_name: null, created_at: '2026-01-10T00:00:00Z' },
]

export const sampleSessions = [
  { id: 's1', created_at: '2026-04-05T13:00:00Z', ended_at: '2026-04-05T16:00:00Z', bet_amount: 3000 },
  { id: 's2', created_at: '2026-05-10T14:00:00Z', ended_at: '2026-05-10T17:30:00Z', bet_amount: 2000 },
  { id: 's3', created_at: '2026-06-01T13:00:00Z', ended_at: '2026-06-01T17:00:00Z', bet_amount: 5000 },
]

export const sampleRounds = [
  // s1 — 8명 (p1~p8), 8판
  { id: 'r1',  session_id: 's1', team1_ids: ['p1','p2','p3','p4'], team2_ids: ['p5','p6','p7','p8'], winner_team: 1 },
  { id: 'r2',  session_id: 's1', team1_ids: ['p1','p3','p5','p7'], team2_ids: ['p2','p4','p6','p8'], winner_team: 2 },
  { id: 'r3',  session_id: 's1', team1_ids: ['p2','p3','p6','p7'], team2_ids: ['p1','p4','p5','p8'], winner_team: 1 },
  { id: 'r4',  session_id: 's1', team1_ids: ['p1','p2','p5','p6'], team2_ids: ['p3','p4','p7','p8'], winner_team: 1 },
  { id: 'r5',  session_id: 's1', team1_ids: ['p1','p4','p6','p7'], team2_ids: ['p2','p3','p5','p8'], winner_team: 2 },
  { id: 'r6',  session_id: 's1', team1_ids: ['p2','p4','p5','p7'], team2_ids: ['p1','p3','p6','p8'], winner_team: 1 },
  { id: 'r7',  session_id: 's1', team1_ids: ['p1','p3','p6','p8'], team2_ids: ['p2','p4','p5','p7'], winner_team: 2 },
  { id: 'r8',  session_id: 's1', team1_ids: ['p2','p3','p5','p8'], team2_ids: ['p1','p4','p6','p7'], winner_team: 1 },

  // s2 — 8명 (p3~p10), 6판
  { id: 'r9',  session_id: 's2', team1_ids: ['p3','p4','p5','p6'],  team2_ids: ['p7','p8','p9','p10'], winner_team: 2 },
  { id: 'r10', session_id: 's2', team1_ids: ['p3','p5','p7','p9'],  team2_ids: ['p4','p6','p8','p10'], winner_team: 1 },
  { id: 'r11', session_id: 's2', team1_ids: ['p4','p5','p8','p9'],  team2_ids: ['p3','p6','p7','p10'], winner_team: 2 },
  { id: 'r12', session_id: 's2', team1_ids: ['p3','p6','p8','p9'],  team2_ids: ['p4','p5','p7','p10'], winner_team: 1 },
  { id: 'r13', session_id: 's2', team1_ids: ['p4','p7','p8','p9'],  team2_ids: ['p3','p5','p6','p10'], winner_team: 2 },
  { id: 'r14', session_id: 's2', team1_ids: ['p3','p4','p9','p10'], team2_ids: ['p5','p6','p7','p8'],  winner_team: 1 },

  // s3 — 10명 (p1~p10), 10판
  { id: 'r15', session_id: 's3', team1_ids: ['p1','p2','p3','p4','p5'],  team2_ids: ['p6','p7','p8','p9','p10'], winner_team: 1 },
  { id: 'r16', session_id: 's3', team1_ids: ['p1','p3','p6','p8','p10'], team2_ids: ['p2','p4','p5','p7','p9'],  winner_team: 2 },
  { id: 'r17', session_id: 's3', team1_ids: ['p2','p4','p6','p9','p10'], team2_ids: ['p1','p3','p5','p7','p8'],  winner_team: 1 },
  { id: 'r18', session_id: 's3', team1_ids: ['p1','p4','p7','p8','p9'],  team2_ids: ['p2','p3','p5','p6','p10'], winner_team: 1 },
  { id: 'r19', session_id: 's3', team1_ids: ['p2','p5','p6','p7','p10'], team2_ids: ['p1','p3','p4','p8','p9'],  winner_team: 2 },
  { id: 'r20', session_id: 's3', team1_ids: ['p1','p2','p6','p9','p10'], team2_ids: ['p3','p4','p5','p7','p8'],  winner_team: 1 },
  { id: 'r21', session_id: 's3', team1_ids: ['p3','p5','p7','p8','p10'], team2_ids: ['p1','p2','p4','p6','p9'],  winner_team: 2 },
  { id: 'r22', session_id: 's3', team1_ids: ['p1','p4','p5','p8','p9'],  team2_ids: ['p2','p3','p6','p7','p10'], winner_team: 1 },
  { id: 'r23', session_id: 's3', team1_ids: ['p2','p3','p6','p8','p9'],  team2_ids: ['p1','p4','p5','p7','p10'], winner_team: 1 },
  { id: 'r24', session_id: 's3', team1_ids: ['p1','p5','p7','p9','p10'], team2_ids: ['p2','p3','p4','p6','p8'],  winner_team: 2 },
]

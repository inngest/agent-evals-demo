export const canonicalPrompt =
  "Show me everyone who signed up in the last two weeks but hasn't activated yet.";

export const canonicalSql = `SELECT u.id, u.email, u.signed_up_at
FROM users u
LEFT JOIN events e ON e.user_id = u.id AND e.name = 'activated'
WHERE u.signed_up_at >= now() - interval '14 days'
  AND e.id IS NULL
ORDER BY u.signed_up_at DESC;`;

export type MockUser = {
  id: string;
  email: string;
  signed_up_at: string;
  activated: false;
};

export const mockUsers: MockUser[] = [
  {
    id: "usr_9d21",
    email: "maya.chen@example.com",
    signed_up_at: "2026-05-31T17:24:00.000Z",
    activated: false,
  },
  {
    id: "usr_2ac8",
    email: "noah.patel@example.com",
    signed_up_at: "2026-05-30T22:11:00.000Z",
    activated: false,
  },
  {
    id: "usr_61fb",
    email: "ava.rodriguez@example.com",
    signed_up_at: "2026-05-29T14:45:00.000Z",
    activated: false,
  },
  {
    id: "usr_34ea",
    email: "liam.jordan@example.com",
    signed_up_at: "2026-05-28T09:17:00.000Z",
    activated: false,
  },
  {
    id: "usr_c801",
    email: "zoe.kim@example.com",
    signed_up_at: "2026-05-27T19:02:00.000Z",
    activated: false,
  },
  {
    id: "usr_7f4b",
    email: "ethan.ross@example.com",
    signed_up_at: "2026-05-26T12:38:00.000Z",
    activated: false,
  },
  {
    id: "usr_b51d",
    email: "isla.brooks@example.com",
    signed_up_at: "2026-05-24T18:51:00.000Z",
    activated: false,
  },
  {
    id: "usr_480c",
    email: "sam.wilson@example.com",
    signed_up_at: "2026-05-23T16:09:00.000Z",
    activated: false,
  },
  {
    id: "usr_18a0",
    email: "nina.nguyen@example.com",
    signed_up_at: "2026-05-22T08:33:00.000Z",
    activated: false,
  },
  {
    id: "usr_f3a7",
    email: "leo.martin@example.com",
    signed_up_at: "2026-05-20T20:06:00.000Z",
    activated: false,
  },
];

export const seededScoreTrend = [
  0.81, 0.8, 0.82, 0.84, 0.83, 0.85, 0.86, 0.88, 0.87, 0.89, 0.9, 0.91,
  0.9, 0.92,
];
